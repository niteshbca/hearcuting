import mongoose, { Types } from 'mongoose';
import { Request } from 'express';
import { Invoice, InvoiceDoc, InvoiceStatus } from '../models/Invoice';
import { Payment } from '../models/Payment';
import { Appointment, AppointmentDoc } from '../models/Appointment';
import { CustomerProfile } from '../models/CustomerProfile';
import { Product } from '../models/Inventory';
import { Membership } from '../models/Membership';
import { errors } from '../utils/errors';
import { buildListResponse, parsePagination, searchRegex } from '../utils/pagination';
import { endOfLocalDay, startOfLocalDay } from '../utils/time';
import { roleHasPermission } from '../utils/permissions';
import { AuthUser } from '../middleware/auth';
import * as billing from './billing.service';
import { adjustStock } from './inventory.service';
import { redeemForService } from './membership.service';

export interface ActorLike {
  userId?: string;
  role?: string;
  ip?: string;
  userAgent?: string;
}

export interface InvoiceItemPayload {
  type: 'service' | 'product';
  refId?: string;
  name?: string;
  quantity: number;
  unitPrice?: number;
  staff?: string;
}

export interface CreateInvoicePayload {
  appointmentId?: string;
  customerId?: string;
  customer?: { name: string; email?: string; phone: string };
  items: InvoiceItemPayload[];
  discount?: { type: 'percent' | 'fixed'; value: number };
  taxRate?: number;
  payments?: {
    method: 'cash' | 'upi' | 'card' | 'online' | 'voucher' | 'membership';
    amount: number;
    reference?: string;
  }[];
  notes?: string;
  redeemMembershipId?: string;
  reissue?: boolean;
}

const CAPTURED_STATUSES = ['captured', 'partially_refunded'] as const;

async function loadPopulated(invoiceId: string) {
  const [invoice, payments] = await Promise.all([
    Invoice.findById(invoiceId)
      .populate('customer', 'name email phone')
      .populate({ path: 'appointment', select: 'reference date startsAt status serviceSnapshot' })
      .populate('createdBy', 'name')
      .lean(),
    Payment.find({ invoice: invoiceId, status: { $in: CAPTURED_STATUSES } }).sort({ paidAt: 1 }).lean(),
  ]);
  return { invoice, payments };
}

export function canAccessInvoice(user: AuthUser, invoice: { customer?: Types.ObjectId | string }): boolean {
  if (roleHasPermission(user.role, 'invoices.view')) return true;
  if (user.role === 'customer' && user.customerId && invoice.customer) {
    return String(invoice.customer) === user.customerId;
  }
  return false;
}

export async function listInvoices(req: Request) {
  const p = parsePagination(req, '-createdAt');
  const q = req.query as Record<string, string | undefined>;
  const filter: Record<string, unknown> = {};

  if (q.status) filter.status = q.status;
  if (q.staffId && mongoose.isValidObjectId(q.staffId)) filter['items.staff'] = new Types.ObjectId(q.staffId);
  if (q.customerId && mongoose.isValidObjectId(q.customerId)) {
    filter.customer = new Types.ObjectId(q.customerId);
  }
  if (q.from || q.to) {
    const range: Record<string, Date> = {};
    if (q.from) range.$gte = startOfLocalDay(q.from);
    if (q.to) range.$lt = endOfLocalDay(q.to);
    filter.createdAt = range;
  }
  if (q.search && q.search.trim()) {
    const regex = searchRegex(q.search);
    const customers = await CustomerProfile.find({
      $or: [{ name: regex }, { phone: regex }, { email: regex }],
    })
      .select('_id')
      .lean();
    filter.$or = [
      { invoiceNumber: regex },
      { customer: { $in: customers.map((c) => c._id) } },
    ];
  }

  const [docs, total] = await Promise.all([
    Invoice.find(filter)
      .sort(p.sort)
      .skip(p.skip)
      .limit(p.limit)
      .populate('customer', 'name email phone')
      .populate({ path: 'appointment', select: 'reference date startsAt status serviceSnapshot' })
      .lean(),
    Invoice.countDocuments(filter),
  ]);
  return buildListResponse(docs, total, p);
}

export async function getInvoiceForUser(id: string, user: AuthUser) {
  if (!mongoose.isValidObjectId(id)) throw errors.badRequest('Invalid invoice id');
  const invoice = await Invoice.findById(id)
    .populate('customer', 'name email phone')
    .populate({ path: 'appointment', select: 'reference date startsAt status serviceSnapshot' })
    .populate('createdBy', 'name')
    .lean();
  if (!invoice) throw errors.notFound('Invoice not found');
  if (!canAccessInvoice(user, invoice)) throw errors.forbidden();

  const payments = await Payment.find({ invoice: invoice._id, status: { $in: CAPTURED_STATUSES } })
    .sort({ paidAt: 1 })
    .lean();
  return { invoice, payments };
}

async function findOrCreateWalkInCustomer(customer: {
  name: string;
  email?: string;
  phone: string;
}): Promise<{ _id: Types.ObjectId }> {
  const email = customer.email?.trim().toLowerCase();
  const phone = customer.phone?.trim();
  const or: Record<string, unknown>[] = [];
  if (email) or.push({ email });
  if (phone) or.push({ phone });

  if (or.length) {
    const existing = await CustomerProfile.findOne({ $or: or }).select('_id').lean();
    if (existing) return existing;
  }

  const safePhone = phone || '0000000000';
  const finalEmail = email || `${safePhone.replace(/\D/g, '') || 'walkin'}@walk-in.local`;
  const created = await CustomerProfile.create({
    name: customer.name,
    email: finalEmail,
    phone: safePhone,
    source: 'walk_in',
  });
  return created;
}

export async function createInvoiceFromPayload(payload: CreateInvoicePayload, actor: ActorLike) {
  let appointment: AppointmentDoc | null = null;
  let customerId = payload.customerId;

  if (payload.appointmentId) {
    if (!mongoose.isValidObjectId(payload.appointmentId)) throw errors.badRequest('Invalid appointment id');
    appointment = await Appointment.findById(payload.appointmentId);
    if (!appointment) throw errors.notFound('Appointment not found');
    if (appointment.invoice) {
      if (!payload.reissue) throw errors.conflict('This appointment has already been invoiced');
      const old = await Invoice.findById(appointment.invoice);
      if (old && old.status !== 'void') {
        old.status = 'void';
        await old.save();
      }
    }
    if (appointment.customer) customerId = String(appointment.customer);
  }

  if (customerId) {
    if (!mongoose.isValidObjectId(customerId)) throw errors.badRequest('Invalid customer id');
    const customer = await CustomerProfile.findById(customerId).select('_id').lean();
    if (!customer) throw errors.notFound('Customer not found');
  } else if (payload.customer) {
    const customer = await findOrCreateWalkInCustomer(payload.customer);
    customerId = String(customer._id);
  }

  // Validate inventory availability BEFORE creating the invoice.
  const neededProducts = new Map<string, number>();
  for (const item of payload.items) {
    if (item.type !== 'product' || !item.refId) continue;
    if (!mongoose.isValidObjectId(item.refId)) throw errors.badRequest('Invalid product reference');
    neededProducts.set(item.refId, (neededProducts.get(item.refId) ?? 0) + Math.max(1, Math.floor(item.quantity || 1)));
  }
  if (neededProducts.size) {
    const products = await Product.find({ _id: { $in: [...neededProducts.keys()] } }).lean();
    const map = new Map(products.map((p) => [String(p._id), p]));
    for (const [productId, qty] of neededProducts) {
      const product = map.get(productId);
      if (!product) throw errors.notFound('Product not found');
      if (product.stockQuantity < qty) throw errors.conflict(`Insufficient stock for ${product.name}`);
    }
  }

  // Validate membership eligibility BEFORE creating the invoice.
  if (payload.redeemMembershipId) {
    if (!mongoose.isValidObjectId(payload.redeemMembershipId)) {
      throw errors.badRequest('Invalid membership id');
    }
    const membership = await Membership.findById(payload.redeemMembershipId);
    if (!membership) throw errors.notFound('Membership not found');
    if (membership.status !== 'active') throw errors.policyBlocked(`Membership is ${membership.status}`);
    if (membership.validUntil.getTime() <= Date.now()) {
      membership.status = 'expired';
      await membership.save();
      throw errors.policyBlocked('Membership has expired');
    }
  }

  const invoice = await billing.createInvoice({
    customer: customerId,
    appointment: payload.appointmentId,
    items: payload.items.map((item) => ({
      type: item.type,
      refId: item.refId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      staff: item.staff,
    })),
    discount: payload.discount,
    taxRate: payload.taxRate,
    notes: payload.notes,
    createdBy: actor.userId,
    payments: payload.payments?.map((p) => ({
      method: p.method,
      amount: p.amount,
      reference: p.reference,
    })),
  });

  try {
    // Redeem membership sessions/credits for each service item it covers.
    if (payload.redeemMembershipId) {
      for (const item of invoice.items) {
        if (item.type !== 'service' || !item.refId) continue;
        try {
          const redemption = await redeemForService({
            membershipId: payload.redeemMembershipId,
            serviceId: String(item.refId),
            customerId,
            appointmentId: payload.appointmentId,
            invoiceId: String(invoice._id),
            redeemedBy: actor.userId,
          });
          item.membershipRedemptionId = redemption._id;
        } catch {
          // Service not covered by this membership — leave it payable.
        }
      }
      await invoice.save();
    }

    // Decrement stock for sold products.
    for (const item of invoice.items) {
      if (item.type !== 'product' || !item.refId) continue;
      await adjustStock({
        productId: String(item.refId),
        type: 'out',
        quantity: item.quantity,
        refType: 'sale',
        refId: String(invoice._id),
        performedBy: actor.userId,
        notes: `Invoice ${invoice.invoiceNumber}`,
      });
    }
  } catch (err) {
    const fresh = await Invoice.findById(invoice._id);
    if (fresh && fresh.status !== 'void') {
      fresh.status = 'void';
      await fresh.save();
    }
    throw err;
  }

  if (appointment) {
    const wasActive = appointment.status === 'confirmed' || appointment.status === 'in_progress';
    if (wasActive) {
      appointment.status = 'completed';
      appointment.completedAt = new Date();
    }
    appointment.invoice = invoice._id;
    await appointment.save();
    if (wasActive && customerId) await billing.recomputeCustomerTotals(customerId);
  }

  return loadPopulated(String(invoice._id));
}

export async function refundInvoice(
  id: string,
  body: { amount?: number; reason?: string; paymentId?: string },
  actor: ActorLike
) {
  if (!mongoose.isValidObjectId(id)) throw errors.badRequest('Invalid invoice id');
  const invoice = await Invoice.findById(id);
  if (!invoice) throw errors.notFound('Invoice not found');

  let payment = null;
  if (body.paymentId) {
    if (!mongoose.isValidObjectId(body.paymentId)) throw errors.badRequest('Invalid payment id');
    payment = await Payment.findById(body.paymentId);
    if (!payment) throw errors.notFound('Payment not found');
    if (!payment.invoice || String(payment.invoice) !== id) {
      throw errors.badRequest('Payment does not belong to this invoice');
    }
  } else {
    payment = await Payment.findOne({
      invoice: invoice._id,
      status: { $in: CAPTURED_STATUSES },
    }).sort({ paidAt: -1 });
    if (!payment) throw errors.notFound('No captured payment to refund');
  }

  const refunded = await billing.refundPayment({
    paymentId: String(payment._id),
    amount: body.amount,
    reason: body.reason,
    actorId: actor.userId,
  });
  const updated = await billing.recomputeInvoice(id);
  return { payment: refunded, invoice: updated };
}

export async function setInvoiceStatus(id: string, status: 'void' | 'draft' | 'unpaid') {
  if (!mongoose.isValidObjectId(id)) throw errors.badRequest('Invalid invoice id');
  const invoice = await Invoice.findById(id);
  if (!invoice) throw errors.notFound('Invoice not found');

  const capturedCount = await Payment.countDocuments({
    invoice: invoice._id,
    status: { $in: CAPTURED_STATUSES },
  });

  if (status === 'void') {
    if (invoice.status !== 'draft' && invoice.status !== 'unpaid') {
      throw errors.conflict('Only draft or unpaid invoices can be voided');
    }
    if (capturedCount > 0) throw errors.conflict('Cannot void an invoice with captured payments');
  } else if (capturedCount > 0) {
    throw errors.conflict('Cannot change the status of an invoice with captured payments');
  }

  invoice.status = status as InvoiceStatus;
  await invoice.save();
  return invoice;
}
