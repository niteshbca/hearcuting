import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { actorFrom } from '../middleware/auth';
import * as paymentService from '../services/payment.service';
import * as billing from '../services/billing.service';
import { Payment } from '../models/Payment';
import { Invoice } from '../models/Invoice';
import { buildListResponse, parsePagination } from '../utils/pagination';
import { errors } from '../utils/errors';
import { logAudit } from '../services/audit.service';
import { localDateKey, startOfLocalDay, endOfLocalDay } from '../utils/time';

export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  const { appointmentReference } = req.body;
  const data = await paymentService.createOnlineOrder(appointmentReference);
  res.status(201).json({ data });
});

export const verify = asyncHandler(async (req: Request, res: Response) => {
  const { appointmentReference, orderId, paymentId, signature } = req.body;
  const data = await paymentService.verifyOnlinePayment({
    appointmentReference,
    orderId,
    paymentId,
    signature,
  });
  res.json({ data });
});

export const webhook = asyncHandler(async (req: Request, res: Response) => {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body ?? '');
  const signature = req.get('x-razorpay-signature');
  const eventId = req.get('x-razorpay-event-id');
  const result = await paymentService.processWebhook(raw, signature, eventId);
  res.json({ data: result });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const p = parsePagination(req, '-paidAt');
  const q = req.query as Record<string, string | undefined>;
  const filter: Record<string, unknown> = {};
  if (q.method) filter.method = q.method;
  if (q.status) filter.status = q.status;
  if (q.from || q.to) {
    filter.paidAt = {};
    if (q.from) (filter.paidAt as Record<string, Date>).$gte = startOfLocalDay(q.from);
    if (q.to) (filter.paidAt as Record<string, Date>).$lt = endOfLocalDay(q.to);
  }

  const [docs, total] = await Promise.all([
    Payment.find(filter)
      .sort(p.sort)
      .skip(p.skip)
      .limit(p.limit)
      .populate('customer', 'name email phone')
      .populate('invoice', 'invoiceNumber total status')
      .lean(),
    Payment.countDocuments(filter),
  ]);
  res.json(buildListResponse(docs, total, p));
});

export const record = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const invoiceId = req.params.invoiceId;
  const { method, amount, reference, notes } = req.body;

  const invoice = await Invoice.findById(invoiceId).lean();
  if (!invoice) throw errors.notFound('Invoice not found');

  const payment = await billing.recordPayment({
    invoiceId,
    customerId: invoice.customer ? String(invoice.customer) : undefined,
    amount,
    method,
    provider: 'manual',
    reference,
    notes,
    recordedBy: actor.userId,
  });

  await logAudit({
    actor,
    action: 'payment.record',
    entity: 'Payment',
    entityId: String(payment._id),
    after: { invoiceId, amount, method },
  });

  const updated = await Invoice.findById(invoiceId).lean();
  res.status(201).json({ data: { payment, invoice: updated } });
});

export const refund = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const payment = await billing.refundPayment({
    paymentId: req.params.id,
    amount: req.body?.amount,
    reason: req.body?.reason,
    actorId: actor.userId,
  });
  await logAudit({
    actor,
    action: 'payment.refund',
    entity: 'Payment',
    entityId: String(payment._id),
    after: { refundedAmount: payment.refundedAmount, status: payment.status },
  });
  res.json({ data: { payment } });
});

export const today = asyncHandler(async (_req: Request, res: Response) => {
  const from = startOfLocalDay(localDateKey());
  const to = endOfLocalDay(localDateKey());
  const result = await Payment.aggregate([
    { $match: { status: { $in: ['captured', 'partially_refunded'] }, paidAt: { $gte: from, $lt: to } } },
    { $group: { _id: '$method', total: { $sum: '$amount' } } },
  ]);
  res.json({ data: result });
});
