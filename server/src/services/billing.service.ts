import mongoose, { ClientSession, Schema, Types } from 'mongoose';
import { Invoice, InvoiceDoc, InvoiceItem, InvoiceStatus } from '../models/Invoice';
import { Payment, PaymentMethod } from '../models/Payment';
import { Appointment } from '../models/Appointment';
import { CustomerProfile } from '../models/CustomerProfile';
import { Product } from '../models/Inventory';
import { Service } from '../models/Service';
import { AppError, errors } from '../utils/errors';
import { addMoney, discountAmount, round2, subtractMoney } from '../utils/money';
import { localDateKey } from '../utils/time';

const Counter =
  (mongoose.models.Counter as mongoose.Model<{ _id: string; seq: number }>) ??
  mongoose.model<{ _id: string; seq: number }>(
    'Counter',
    new Schema({ _id: String, seq: { type: Number, default: 0 } }),
    'counters'
  );

/** Human-readable sequential invoice number, e.g. INV-202610-0007 */
export async function nextInvoiceNumber(date = new Date()): Promise<string> {
  const dateKey = localDateKey(date);
  const monthKey = dateKey.slice(0, 7).replace('-', '');
  const counterId = `invoice-${monthKey}`;
  const counter = await Counter.findOneAndUpdate(
    { _id: counterId },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return `INV-${monthKey}-${String(counter.seq).padStart(4, '0')}`;
}

export interface InvoiceItemInput {
  type: 'service' | 'product';
  refId?: string;
  name?: string;
  description?: string;
  quantity?: number;
  unitPrice?: number;
  staff?: string;
  membershipRedemptionId?: string;
}

export interface CreateInvoiceInput {
  customer?: string;
  customerUser?: string;
  appointment?: string;
  items: InvoiceItemInput[];
  discount?: { type: 'percent' | 'fixed'; value: number };
  taxRate?: number;
  notes?: string;
  createdBy?: string;
  payments?: {
    method: PaymentMethod;
    amount: number;
    reference?: string;
    provider?: 'manual' | 'razorpay' | 'voucher' | 'membership';
    providerOrderId?: string;
    providerPaymentId?: string;
  }[];
  session?: ClientSession;
}

/**
 * Creates an invoice. Prices for catalog items are ALWAYS resolved from the
 * database — client-provided prices are ignored for referenced items.
 */
export async function createInvoice(input: CreateInvoiceInput): Promise<InvoiceDoc> {
  if (!input.items?.length) throw errors.badRequest('An invoice needs at least one item');

  const resolved: InvoiceItem[] = [];
  for (const raw of input.items) {
    const quantity = Math.max(1, Math.floor(Number(raw.quantity) || 1));
    let unitPrice: number;
    let name = raw.name ?? 'Item';
    let description = raw.description;

    if (raw.type === 'product') {
      const product = raw.refId ? await Product.findById(raw.refId).lean() : null;
      if (raw.refId && !product) throw errors.notFound('Product not found');
      const price = product?.salePrice ?? Number(raw.unitPrice);
      if (!Number.isFinite(price) || price < 0) throw errors.badRequest('Invalid product price');
      unitPrice = round2(price);
      name = product?.name ?? raw.name ?? 'Product';
      description = description ?? product?.category;
    } else {
      const service = raw.refId ? await Service.findById(raw.refId).lean() : null;
      if (raw.refId && !service) throw errors.notFound('Service not found');
      let price: number;
      if (service) {
        price =
          service.discountPrice != null && service.discountPrice > 0 && service.discountPrice < service.price
            ? service.discountPrice
            : service.price;
        name = service.name;
        description = description ?? service.category;
      } else {
        price = Number(raw.unitPrice);
      }
      if (!Number.isFinite(price) || price < 0) throw errors.badRequest('Invalid service price');
      unitPrice = round2(price);
    }

    resolved.push({
      type: raw.type,
      refId: raw.refId ? new Types.ObjectId(raw.refId) : undefined,
      name,
      description,
      quantity,
      unitPrice,
      total: round2(unitPrice * quantity),
      staff: raw.staff ? new Types.ObjectId(raw.staff) : undefined,
      membershipRedemptionId: raw.membershipRedemptionId
        ? new Types.ObjectId(raw.membershipRedemptionId)
        : undefined,
    });
  }

  const totals = computeInvoiceTotals(resolved, input.discount, input.taxRate ?? 0);
  const invoiceNumber = await nextInvoiceNumber();

  const [invoice] = await Invoice.create(
    [
      {
        invoiceNumber,
        customer: input.customer ? new Types.ObjectId(input.customer) : undefined,
        customerUser: input.customerUser ? new Types.ObjectId(input.customerUser) : undefined,
        appointment: input.appointment ? new Types.ObjectId(input.appointment) : undefined,
        items: resolved,
        subtotal: totals.subtotal,
        discount: totals.discountInfo,
        tax: { rate: input.taxRate ?? 0, amount: totals.taxAmount },
        total: totals.total,
        amountPaid: 0,
        balanceDue: totals.total,
        status: 'unpaid',
        notes: input.notes,
        createdBy: input.createdBy ? new Types.ObjectId(input.createdBy) : undefined,
        issuedAt: new Date(),
      },
    ],
    input.session ? { session: input.session } : {}
  );

  if (input.payments?.length) {
    for (const p of input.payments) {
      await recordPayment({
        invoiceId: String(invoice._id),
        appointmentId: input.appointment,
        customerId: input.customer,
        amount: p.amount,
        method: p.method,
        provider: p.provider ?? 'manual',
        reference: p.reference,
        providerOrderId: p.providerOrderId,
        providerPaymentId: p.providerPaymentId,
        recordedBy: input.createdBy,
        silent: true,
      });
    }
    const fresh = await Invoice.findById(invoice._id);
    return fresh ?? invoice;
  }

  if (input.appointment) {
    await Appointment.updateOne({ _id: input.appointment }, { $set: { invoice: invoice._id } });
  }

  return invoice;
}

export interface TotalsInput {
  subtotal: number;
  discount: ReturnType<typeof discountAmount>;
  taxAmount: number;
  total: number;
  discountInfo: { type: 'percent' | 'fixed'; value: number; amount: number };
}

export function computeInvoiceTotals(
  items: Pick<InvoiceItem, 'total'>[],
  discount?: { type: 'percent' | 'fixed'; value: number },
  taxRate = 0
): TotalsInput {
  const subtotal = addMoney(...items.map((i) => i.total));
  const discInfo = discount ?? { type: 'fixed' as const, value: 0 };
  const discAmount = discountAmount(subtotal, discInfo);
  const taxable = subtractMoney(subtotal, discAmount);
  const taxAmount = round2((taxable * (Number(taxRate) || 0)) / 100);
  return {
    subtotal,
    discount: discAmount,
    taxAmount,
    total: addMoney(taxable, taxAmount),
    discountInfo: { type: discInfo.type, value: discInfo.value, amount: discAmount },
  };
}

export interface RecordPaymentInput {
  invoiceId?: string;
  appointmentId?: string;
  customerId?: string;
  amount: number;
  method: PaymentMethod;
  provider?: 'manual' | 'razorpay' | 'voucher' | 'membership';
  status?: 'pending' | 'captured' | 'failed' | 'refunded' | 'partially_refunded';
  reference?: string;
  providerOrderId?: string;
  providerPaymentId?: string;
  notes?: string;
  recordedBy?: string;
  silent?: boolean;
  session?: ClientSession;
}

/** Records a captured payment and keeps the invoice + appointment in sync. */
export async function recordPayment(input: RecordPaymentInput) {
  const amount = round2(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw errors.badRequest('Payment amount must be positive');

  const payment = await Payment.create(
    [
      {
        invoice: input.invoiceId ? new Types.ObjectId(input.invoiceId) : undefined,
        appointment: input.appointmentId ? new Types.ObjectId(input.appointmentId) : undefined,
        customer: input.customerId ? new Types.ObjectId(input.customerId) : undefined,
        amount,
        method: input.method,
        status: input.status ?? 'captured',
        provider: input.provider ?? 'manual',
        reference: input.reference,
        providerOrderId: input.providerOrderId,
        providerPaymentId: input.providerPaymentId,
        notes: input.notes,
        recordedBy: input.recordedBy ? new Types.ObjectId(input.recordedBy) : undefined,
        paidAt: new Date(),
      },
    ],
    input.session ? { session: input.session } : {}
  );

  if (input.status === undefined || input.status === 'captured') {
    if (input.invoiceId) await recomputeInvoice(input.invoiceId);
    if (input.appointmentId) await syncAppointmentPaymentStatus(input.appointmentId);
    if (input.invoiceId && !input.silent) {
      const inv = await Invoice.findById(input.invoiceId).select('appointment').lean();
      if (inv?.appointment) await syncAppointmentPaymentStatus(String(inv.appointment));
    }
  }

  return payment[0];
}

export async function recomputeInvoice(invoiceId: string): Promise<InvoiceDoc | null> {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) return null;

  const [agg] = await Payment.aggregate<{ paid: number; refunded: number }>([
    { $match: { invoice: invoice._id, status: { $in: ['captured', 'partially_refunded', 'refunded'] } } },
    {
      $group: {
        _id: null,
        paid: { $sum: { $cond: [{ $in: ['$status', ['captured', 'partially_refunded']] }, '$amount', 0] } },
        refunded: { $sum: '$refundedAmount' },
      },
    },
  ]);

  const amountPaid = addMoney(agg?.paid ?? 0);
  const refundedAmount = addMoney(agg?.refunded ?? 0);
  const balanceDue = Math.max(0, subtractMoney(invoice.total, subtractMoney(amountPaid, refundedAmount)));

  let status: InvoiceStatus = 'unpaid';
  if (refundedAmount > 0 && refundedAmount >= amountPaid) status = 'refunded';
  else if (amountPaid >= invoice.total) status = 'paid';
  else if (amountPaid > 0) status = 'partially_paid';

  invoice.amountPaid = amountPaid;
  invoice.refundedAmount = refundedAmount;
  invoice.balanceDue = balanceDue;
  invoice.status = status;
  await invoice.save();
  return invoice;
}

/** Keeps appointment.paymentStatus derived from its payments (never client input). */
export async function syncAppointmentPaymentStatus(appointmentId: string): Promise<void> {
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) return;

  const [agg] = await Payment.aggregate<{ captured: number; refunded: number }>([
    { $match: { appointment: appointment._id } },
    {
      $group: {
        _id: null,
        captured: {
          $sum: {
            $cond: [{ $in: ['$status', ['captured', 'partially_refunded']] }, '$amount', 0],
          },
        },
        refunded: { $sum: '$refundedAmount' },
      },
    },
  ]);

  const captured = round2((agg?.captured ?? 0) - (agg?.refunded ?? 0));
  let paymentStatus: string;
  if (captured <= 0) paymentStatus = 'unpaid';
  else if (captured >= appointment.totalPrice) paymentStatus = 'paid';
  else if (appointment.depositAmount > 0 && captured < appointment.totalPrice) paymentStatus = 'deposit_paid';
  else paymentStatus = 'partially_paid';

  appointment.paymentStatus = paymentStatus as typeof appointment.paymentStatus;
  await appointment.save();
}

export async function refundPayment(input: {
  paymentId: string;
  amount?: number;
  reason?: string;
  actorId?: string;
}) {
  const payment = await Payment.findById(input.paymentId);
  if (!payment) throw errors.notFound('Payment not found');
  if (payment.status === 'refunded') throw errors.conflict('Payment is already fully refunded');

  const refundable = round2(payment.amount - payment.refundedAmount);
  const requested = input.amount ? round2(input.amount) : refundable;
  if (requested <= 0 || requested > refundable) {
    throw new AppError(422, 'INVALID_REFUND', `Refund must be between 0 and ${refundable}`);
  }

  payment.refundedAmount = round2(payment.refundedAmount + requested);
  payment.status = payment.refundedAmount >= payment.amount ? 'refunded' : 'partially_refunded';
  payment.notes = [payment.notes, input.reason ? `Refund: ${input.reason}` : 'Refund issued']
    .filter(Boolean)
    .join(' | ');
  await payment.save();

  if (payment.invoice) await recomputeInvoice(String(payment.invoice));
  if (payment.appointment) await syncAppointmentPaymentStatus(String(payment.appointment));

  return payment;
}

/** Recomputes customer lifetime totals (visits, spend) from real data. */
export async function recomputeCustomerTotals(customerId: string): Promise<void> {
  const customer = await CustomerProfile.findById(customerId);
  if (!customer) return;

  const [visitAgg] = await Appointment.aggregate<{ visits: number; last?: Date }>([
    { $match: { customer: customer._id, status: 'completed' } },
    { $group: { _id: null, visits: { $sum: 1 }, last: { $max: '$startsAt' } } },
  ]);

  const [spendAgg] = await Invoice.aggregate<{ spent: number }>([
    { $match: { customer: customer._id, status: { $in: ['paid', 'partially_paid'] } } },
    { $group: { _id: null, spent: { $sum: { $subtract: ['$amountPaid', '$refundedAmount'] } } } },
  ]);

  customer.totalVisits = visitAgg?.visits ?? 0;
  customer.lastVisitAt = visitAgg?.last;
  customer.totalSpent = addMoney(spendAgg?.spent ?? 0);
  await customer.save();
}
