import { Types } from 'mongoose';
import { Appointment } from '../models/Appointment';
import { Payment } from '../models/Payment';
import { PaymentWebhookEvent } from '../models/Payment';
import { AppError, errors } from '../utils/errors';
import { round2 } from '../utils/money';
import { enqueueEmail } from './mail.service';
import { templates } from '../templates/email';
import { getSettings } from './settings.service';
import { syncAppointmentPaymentStatus } from './billing.service';
import { logAudit } from './audit.service';
import * as razorpay from './razorpay.service';
import { logger } from '../config/logger';

async function loadAppointmentForPayment(reference: string) {
  const appointment = await Appointment.findOne({ reference: reference.toUpperCase() }).populate(
    'staff',
    'name'
  );
  if (!appointment) throw errors.notFound('Booking not found');
  return appointment;
}

function payAmountFor(appointment: {
  depositAmount: number;
  totalPrice: number;
  paymentStatus: string;
}) {
  if (appointment.paymentStatus === 'paid') throw errors.conflict('This booking is already fully paid');
  if (appointment.depositAmount > 0 && appointment.paymentStatus !== 'deposit_paid') {
    return round2(appointment.depositAmount);
  }
  return round2(appointment.totalPrice);
}

/** Creates a gateway order for an appointment deposit / full payment. */
export async function createOnlineOrder(reference: string) {
  if (!razorpay.isConfigured()) {
    throw new AppError(503, 'PAYMENTS_DISABLED', 'Online payments are currently unavailable');
  }
  const settings = await getSettings();
  if (!settings.payments.onlinePaymentsEnabled) {
    throw new AppError(503, 'PAYMENTS_DISABLED', 'Online payments are currently unavailable');
  }

  const appointment = await loadAppointmentForPayment(reference);
  const amount = payAmountFor(appointment);

  const order = await razorpay.createOrder({
    amount,
    currency: settings.currency.code || 'INR',
    receipt: appointment.reference,
    notes: { appointmentId: String(appointment._id), reference: appointment.reference },
  });

  await Payment.create({
    appointment: appointment._id,
    customer: appointment.customer,
    amount,
    method: 'online',
    status: 'pending',
    provider: 'razorpay',
    providerOrderId: order.id,
  });

  return {
    orderId: order.id,
    amount,
    currency: settings.currency.code || 'INR',
    keyId: razorpay.keyId(),
    appointmentReference: appointment.reference,
  };
}

async function markOnlinePaymentCaptured(params: {
  providerOrderId: string;
  providerPaymentId?: string;
  amount?: number;
  source: 'verify' | 'webhook';
}): Promise<boolean> {
  const payment = await Payment.findOne({
    provider: 'razorpay',
    providerOrderId: params.providerOrderId,
  });
  if (!payment) {
    logger.warn({ orderId: params.providerOrderId }, 'online payment: no local record for order');
    return false;
  }
  if (payment.status === 'captured') return true; // idempotent

  payment.status = 'captured';
  payment.providerPaymentId = params.providerPaymentId ?? payment.providerPaymentId;
  payment.paidAt = new Date();
  await payment.save();

  if (payment.appointment) {
    await syncAppointmentPaymentStatus(String(payment.appointment));
    await sendPaymentSuccessEmail(String(payment.appointment), payment.amount, 'Online (Razorpay)');
  }
  await logAudit({
    action: 'payment.captured',
    entity: 'Payment',
    entityId: String(payment._id),
    after: { amount: payment.amount, providerOrderId: params.providerOrderId, source: params.source },
  });
  return true;
}

/** Verifies the checkout redirect signature and captures the payment. */
export async function verifyOnlinePayment(params: {
  appointmentReference: string;
  orderId: string;
  paymentId: string;
  signature: string;
}) {
  if (!razorpay.isConfigured()) {
    throw new AppError(503, 'PAYMENTS_DISABLED', 'Online payments are currently unavailable');
  }
  const valid = razorpay.verifyPaymentSignature({
    orderId: params.orderId,
    paymentId: params.paymentId,
    signature: params.signature,
  });
  if (!valid) throw new AppError(400, 'INVALID_SIGNATURE', 'Payment verification failed');

  const captured = await markOnlinePaymentCaptured({
    providerOrderId: params.orderId,
    providerPaymentId: params.paymentId,
    source: 'verify',
  });
  if (!captured) throw errors.notFound('Payment record not found for this order');

  const appointment = await Appointment.findOne({ reference: params.appointmentReference.toUpperCase() })
    .select('reference paymentStatus status totalPrice')
    .lean();
  return { success: true, appointment };
}

/** Idempotent webhook processing. Trusts ONLY the signed payload. */
export async function processWebhook(rawBody: string, signature: string | undefined, eventIdHeader?: string) {
  if (!razorpay.isConfigured()) {
    throw new AppError(503, 'PAYMENTS_DISABLED', 'Online payments are currently unavailable');
  }
  const signatureValid = razorpay.verifyWebhookSignature(rawBody, signature);
  let payload: Record<string, any> = {};
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw errors.badRequest('Invalid webhook payload');
  }

  const eventId =
    eventIdHeader || (payload?.event_id as string) || `${payload?.event}:${payload?.created_at}:${payload?.payload?.payment?.entity?.id ?? ''}`;
  const type = (payload?.event as string) ?? 'unknown';

  let event;
  try {
    event = await PaymentWebhookEvent.create({
      provider: 'razorpay',
      eventId,
      type,
      payload,
      signatureValid,
      status: signatureValid ? 'received' : 'ignored',
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return { status: 'duplicate' as const };
    throw err;
  }

  if (!signatureValid) {
    event.status = 'ignored';
    event.error = 'Signature verification failed';
    await event.save();
    throw new AppError(400, 'INVALID_SIGNATURE', 'Webhook signature verification failed');
  }

  try {
    const paymentEntity = payload?.payload?.payment?.entity;
    const refundEntity = payload?.payload?.refund?.entity;
    const orderId: string | undefined = paymentEntity?.order_id ?? refundEntity?.payment_id;
    const paymentId: string | undefined = paymentEntity?.id;
    let handled = false;

    if (['payment.captured', 'order.paid'].includes(type) && orderId) {
      handled = await markOnlinePaymentCaptured({
        providerOrderId: orderId,
        providerPaymentId: paymentId,
        amount: paymentEntity?.amount ? paymentEntity.amount / 100 : undefined,
        source: 'webhook',
      });
    } else if (type === 'payment.failed' && orderId) {
      await Payment.updateOne(
        { provider: 'razorpay', providerOrderId: orderId, status: 'pending' },
        { $set: { status: 'failed', providerPaymentId: paymentId } }
      );
      handled = true;
    } else if (type === 'refund.processed' && refundEntity?.payment_id) {
      await Payment.updateOne(
        { providerPaymentId: refundEntity.payment_id },
        {
          $inc: { refundedAmount: refundEntity.amount ? refundEntity.amount / 100 : 0 },
          $set: { status: 'refunded' },
        }
      );
      handled = true;
    }

    event.status = handled ? 'processed' : 'ignored';
    event.processedAt = new Date();
    await event.save();
    return { status: event.status };
  } catch (err) {
    event.status = 'failed';
    event.error = err instanceof Error ? err.message : 'processing failed';
    await event.save();
    throw err;
  }
}

export async function sendPaymentSuccessEmail(appointmentId: string, amount: number, method: string) {
  const appointment = await Appointment.findById(appointmentId).populate('customer', 'name email').lean();
  if (!appointment) return;
  const settings = await getSettings();
  const email =
    (appointment.customer as unknown as { email?: string })?.email ?? appointment.guest?.email ?? undefined;
  const name =
    (appointment.customer as unknown as { name?: string })?.name ?? appointment.guest?.name ?? 'there';
  if (!email) return;

  const content = templates.paymentSuccess({
    appointment,
    customerName: name,
    settings,
    amount,
    method,
  });
  await enqueueEmail({
    to: email,
    toName: name,
    subject: content.subject,
    html: content.html,
    text: content.text,
    template: 'payment_success',
    relatedType: 'Appointment',
    relatedId: String(appointment._id),
    dedupeKey: `payment_success:${String(appointment._id)}:${round2(amount)}:${appointment.paymentStatus}`,
  });
}

export { loadAppointmentForPayment, payAmountFor };
