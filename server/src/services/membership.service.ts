import mongoose, { Types } from 'mongoose';
import { Request } from 'express';
import {
  Membership,
  MembershipDoc,
  MembershipPlan,
  MembershipPlanDoc,
  PackageRedemption,
  PackageRedemptionDoc,
} from '../models/Membership';
import { Invoice } from '../models/Invoice';
import { Service, serviceEffectivePrice } from '../models/Service';
import { errors } from '../utils/errors';
import { addMoney, percentOf, round2, subtractMoney } from '../utils/money';
import { addDays, localDateKey } from '../utils/time';
import { shortCode } from '../utils/reference';
import { buildListResponse, parsePagination } from '../utils/pagination';
import * as billing from './billing.service';

export interface ActorLike {
  userId?: string;
  role?: string;
  ip?: string;
  userAgent?: string;
}

function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return base || `plan-${Date.now()}`;
}

async function uniquePlanSlug(name: string): Promise<string> {
  const base = slugify(name);
  let slug = base;
  let i = 1;
  while (await MembershipPlan.exists({ slug })) {
    slug = `${base}-${i++}`;
    if (i > 50) {
      slug = `${base}-${shortCode(4).toLowerCase()}`;
      break;
    }
  }
  return slug;
}

export interface PlanIncludeInput {
  service?: string;
  serviceName?: string;
  limitTotal: number;
  discountPercent?: number;
}

export interface CreatePlanInput {
  name: string;
  type?: 'membership' | 'package';
  description?: string;
  price: number;
  validityDays: number;
  includes?: PlanIncludeInput[];
  credits?: number;
  isActive?: boolean;
  sortWeight?: number;
}

async function resolveIncludes(includes: PlanIncludeInput[] = []) {
  const resolved: {
    service?: Types.ObjectId;
    serviceName?: string;
    limitTotal: number;
    discountPercent?: number;
  }[] = [];
  for (const inc of includes) {
    let serviceName = inc.serviceName;
    let service: Types.ObjectId | undefined;
    if (inc.service) {
      if (!mongoose.isValidObjectId(inc.service)) throw errors.badRequest('Invalid service id');
      const doc = await Service.findById(inc.service).select('name').lean();
      if (!doc) throw errors.validation([{ field: 'includes.service', message: 'Service not found' }]);
      service = doc._id;
      serviceName = serviceName ?? doc.name;
    }
    resolved.push({
      service,
      serviceName,
      limitTotal: Math.max(1, Math.floor(inc.limitTotal)),
      discountPercent: inc.discountPercent,
    });
  }
  return resolved;
}

export async function listPlans() {
  const plans = await MembershipPlan.find().sort({ sortWeight: -1, name: 1 }).lean();
  return { data: plans };
}

export async function createPlan(input: CreatePlanInput, _actor?: ActorLike): Promise<MembershipPlanDoc> {
  const slug = await uniquePlanSlug(input.name);
  return MembershipPlan.create({
    name: input.name,
    slug,
    type: input.type ?? 'package',
    description: input.description ?? '',
    price: input.price,
    validityDays: input.validityDays,
    includes: await resolveIncludes(input.includes),
    credits: input.credits,
    isActive: input.isActive ?? true,
    sortWeight: input.sortWeight ?? 0,
  });
}

export async function updatePlan(id: string, patch: Record<string, unknown>): Promise<MembershipPlanDoc> {
  if (!mongoose.isValidObjectId(id)) throw errors.badRequest('Invalid plan id');
  const plan = await MembershipPlan.findById(id);
  if (!plan) throw errors.notFound('Membership plan not found');

  if (typeof patch.name === 'string' && patch.name !== plan.name) {
    plan.name = patch.name;
    plan.slug = await uniquePlanSlug(patch.name);
  }
  if (patch.type) plan.type = patch.type as MembershipPlanDoc['type'];
  if (patch.description !== undefined) plan.description = String(patch.description);
  if (patch.price !== undefined) plan.price = Number(patch.price);
  if (patch.validityDays !== undefined) plan.validityDays = Number(patch.validityDays);
  if (patch.credits !== undefined) plan.credits = Number(patch.credits);
  if (patch.isActive !== undefined) plan.isActive = Boolean(patch.isActive);
  if (patch.sortWeight !== undefined) plan.sortWeight = Number(patch.sortWeight);
  if (patch.includes !== undefined) {
    plan.set('includes', await resolveIncludes(patch.includes as PlanIncludeInput[]));
  }
  await plan.save();
  return plan;
}

export async function listMemberships(req: Request) {
  const p = parsePagination(req, '-createdAt');
  const q = req.query as Record<string, string | undefined>;
  const filter: Record<string, unknown> = {};
  if (q.customerId && mongoose.isValidObjectId(q.customerId)) {
    filter.customer = new Types.ObjectId(q.customerId);
  }
  if (q.status) filter.status = q.status;

  const [docs, total] = await Promise.all([
    Membership.find(filter)
      .sort(p.sort)
      .skip(p.skip)
      .limit(p.limit)
      .populate('customer', 'name email phone')
      .populate('plan', 'name type price validityDays')
      .lean(),
    Membership.countDocuments(filter),
  ]);
  return buildListResponse(docs, total, p);
}

export interface PurchaseMembershipInput {
  customerId: string;
  planId: string;
  paidAmount?: number;
  paymentMethod?: 'cash' | 'upi' | 'card' | 'online' | 'voucher' | 'membership';
  startDate?: string;
}

export async function purchaseMembership(input: PurchaseMembershipInput, actor?: ActorLike) {
  if (!mongoose.isValidObjectId(input.customerId)) throw errors.badRequest('Invalid customer id');
  const plan = await MembershipPlan.findById(input.planId);
  if (!plan) throw errors.notFound('Membership plan not found');
  if (!plan.isActive) throw errors.policyBlocked('This plan is no longer available');

  const validFrom = input.startDate ? new Date(input.startDate) : new Date();
  if (Number.isNaN(validFrom.getTime())) throw errors.badRequest('Invalid start date');
  const validUntil = new Date(validFrom.getTime() + plan.validityDays * 24 * 60 * 60 * 1000);

  const membership = await Membership.create({
    customer: new Types.ObjectId(input.customerId),
    plan: plan._id,
    name: plan.name,
    type: plan.type,
    code: shortCode(8),
    price: plan.price,
    validFrom,
    validUntil,
    credits: plan.credits ?? 0,
    includes: plan.includes.map((inc) => ({
      service: inc.service,
      serviceName: inc.serviceName,
      limitTotal: inc.limitTotal,
      limitUsed: 0,
      discountPercent: inc.discountPercent,
    })),
    status: 'active',
  });

  const invoice = await billing.createInvoice({
    customer: input.customerId,
    items: [{ type: 'service', name: plan.name, quantity: 1, unitPrice: plan.price }],
    notes: `Membership purchase: ${plan.name}`,
    createdBy: actor?.userId,
    payments:
      input.paidAmount && input.paidAmount > 0
        ? [{ method: input.paymentMethod ?? 'cash', amount: input.paidAmount }]
        : undefined,
  });

  membership.purchaseInvoice = invoice._id;
  await membership.save();

  return { membership, invoice };
}

export async function getCustomerMemberships(customerId: string) {
  if (!mongoose.isValidObjectId(customerId)) throw errors.badRequest('Invalid customer id');
  const memberships = await Membership.find({ customer: new Types.ObjectId(customerId) })
    .sort({ createdAt: -1 })
    .populate('plan', 'name type price validityDays')
    .lean();
  return { data: memberships };
}

export interface RedeemInput {
  membershipId: string;
  serviceId?: string;
  serviceName?: string;
  customerId?: string;
  appointmentId?: string;
  invoiceId?: string;
  applyDiscount?: boolean;
  notes?: string;
  redeemedBy?: string;
  value?: number;
}

/**
 * Consumes one session (or one credit) from a membership atomically and records
 * a PackageRedemption. Throws policyBlocked when nothing remains.
 */
export async function redeemForService(input: RedeemInput): Promise<PackageRedemptionDoc> {
  if (!mongoose.isValidObjectId(input.membershipId)) throw errors.badRequest('Invalid membership id');
  const membership = await Membership.findById(input.membershipId);
  if (!membership) throw errors.notFound('Membership not found');
  if (membership.status === 'cancelled') throw errors.policyBlocked('Membership is cancelled');
  if (membership.status !== 'active') throw errors.policyBlocked(`Membership is ${membership.status}`);
  if (membership.validUntil.getTime() <= Date.now()) {
    membership.status = 'expired';
    await membership.save();
    throw errors.policyBlocked('Membership has expired');
  }

  const serviceId =
    input.serviceId && mongoose.isValidObjectId(input.serviceId) ? input.serviceId : undefined;

  let idx = -1;
  if (serviceId) {
    idx = membership.includes.findIndex(
      (i) => i.service && String(i.service) === serviceId && i.limitUsed < i.limitTotal
    );
  }
  if (idx < 0 && input.serviceName) {
    const needle = input.serviceName.trim().toLowerCase();
    idx = membership.includes.findIndex(
      (i) => (i.serviceName ?? '').trim().toLowerCase() === needle && i.limitUsed < i.limitTotal
    );
  }

  let remainingAfter: PackageRedemptionDoc['remainingAfter'] = null;
  let fresh: MembershipDoc | null = null;

  if (idx >= 0) {
    const include = membership.includes[idx];
    const fresh1 = await Membership.findOneAndUpdate(
      {
        _id: membership._id,
        status: 'active',
        includes: {
          $elemMatch: {
            ...(include.service ? { service: include.service } : { serviceName: include.serviceName }),
            limitUsed: { $lt: include.limitTotal },
          },
        },
      },
      { $inc: { [`includes.${idx}.limitUsed`]: 1 } },
      { new: true }
    );
    if (!fresh1) throw errors.policyBlocked('No remaining sessions for this service');
    fresh = fresh1;
    const updated = fresh.includes[idx];
    remainingAfter = {
      service: include.service,
      count: Math.max(0, updated.limitTotal - updated.limitUsed),
    };
  } else if ((membership.credits ?? 0) > 0) {
    const fresh2 = await Membership.findOneAndUpdate(
      { _id: membership._id, status: 'active', credits: { $gt: 0 } },
      { $inc: { credits: -1 } },
      { new: true }
    );
    if (!fresh2) throw errors.policyBlocked('No remaining credits on this membership');
    fresh = fresh2;
    remainingAfter = { count: fresh.credits };
  } else {
    throw errors.policyBlocked('No remaining sessions for this service');
  }

  let value = input.value;
  if (value == null && serviceId) {
    const service = await Service.findById(serviceId).select('price discountPrice').lean();
    value = service ? serviceEffectivePrice(service) : 0;
  }

  const redemption = await PackageRedemption.create({
    membership: membership._id,
    customer:
      input.customerId && mongoose.isValidObjectId(input.customerId)
        ? new Types.ObjectId(input.customerId)
        : membership.customer,
    service: serviceId ? new Types.ObjectId(serviceId) : undefined,
    appointment:
      input.appointmentId && mongoose.isValidObjectId(input.appointmentId)
        ? new Types.ObjectId(input.appointmentId)
        : undefined,
    invoice:
      input.invoiceId && mongoose.isValidObjectId(input.invoiceId)
        ? new Types.ObjectId(input.invoiceId)
        : undefined,
    value: round2(value ?? 0),
    remainingAfter,
    redeemedBy: input.redeemedBy ? new Types.ObjectId(input.redeemedBy) : undefined,
    notes: input.notes,
  });

  if (fresh) {
    const totalRemaining =
      (fresh.credits ?? 0) +
      fresh.includes.reduce((sum, i) => sum + Math.max(0, i.limitTotal - i.limitUsed), 0);
    if (totalRemaining <= 0 && fresh.status === 'active') {
      fresh.status = 'exhausted';
      await fresh.save();
    }
  }

  return redemption;
}

async function findIncludeDiscount(membershipId: string, serviceId?: string): Promise<number | null> {
  if (!serviceId || !mongoose.isValidObjectId(serviceId)) return null;
  const membership = await Membership.findById(membershipId).select('plan includes').lean();
  const fromMembership = membership?.includes?.find((i) => i.service && String(i.service) === serviceId);
  if (fromMembership?.discountPercent != null) return fromMembership.discountPercent;
  if (membership?.plan) {
    const plan = await MembershipPlan.findById(membership.plan).select('includes').lean();
    const fromPlan = plan?.includes?.find((i) => i.service && String(i.service) === serviceId);
    if (fromPlan?.discountPercent != null) return fromPlan.discountPercent;
  }
  return null;
}

/** Redeem endpoint: consumes a session/credit and optionally applies the plan discount. */
export async function redeemMembership(
  membershipId: string,
  body: RedeemInput,
  actor?: ActorLike
): Promise<{ redemption: PackageRedemptionDoc; invoice?: unknown }> {
  const discount = body.applyDiscount ? await findIncludeDiscount(membershipId, body.serviceId) : null;
  const redemption = await redeemForService({
    ...body,
    membershipId,
    redeemedBy: actor?.userId,
  });

  let invoice: unknown;
  if (discount && discount > 0 && body.invoiceId && mongoose.isValidObjectId(body.invoiceId)) {
    const inv = await Invoice.findById(body.invoiceId);
    if (inv) {
      const item = inv.items.find((i) => i.refId && body.serviceId && String(i.refId) === body.serviceId);
      if (item) {
        const discounted = round2(item.unitPrice - percentOf(item.unitPrice, discount));
        item.unitPrice = discounted;
        item.total = round2(discounted * item.quantity);
        const totals = billing.computeInvoiceTotals(inv.items, inv.discount, inv.tax.rate);
        inv.subtotal = totals.subtotal;
        inv.discount.amount = totals.discountInfo.amount;
        inv.tax.amount = totals.taxAmount;
        inv.total = totals.total;
        inv.balanceDue = Math.max(0, subtractMoney(totals.total, inv.amountPaid));
        await inv.save();
        await billing.recomputeInvoice(String(inv._id));
        invoice = inv.toObject();
      }
    }
  }

  return { redemption, invoice };
}

export async function renewMembership(
  id: string,
  input: { paidAmount?: number; paymentMethod?: 'cash' | 'upi' | 'card' | 'online' | 'voucher' | 'membership' },
  actor?: ActorLike
) {
  if (!mongoose.isValidObjectId(id)) throw errors.badRequest('Invalid membership id');
  const current = await Membership.findById(id);
  if (!current) throw errors.notFound('Membership not found');

  const plan: MembershipPlanDoc | null = current.plan
    ? await MembershipPlan.findById(current.plan)
    : null;

  const validFrom = new Date();
  const validityDays = plan?.validityDays ?? Math.max(1, Math.round((current.validUntil.getTime() - current.validFrom.getTime()) / 86400000));
  const validUntil = new Date(validFrom.getTime() + validityDays * 24 * 60 * 60 * 1000);
  const includes = plan
    ? plan.includes.map((inc) => ({
        service: inc.service,
        serviceName: inc.serviceName,
        limitTotal: inc.limitTotal,
        limitUsed: 0,
        discountPercent: inc.discountPercent,
      }))
    : current.includes.map((inc) => ({
        service: inc.service,
        serviceName: inc.serviceName,
        limitTotal: inc.limitTotal,
        limitUsed: 0,
        discountPercent: inc.discountPercent,
      }));
  const price = plan?.price ?? current.price;
  const name = plan?.name ?? current.name;

  const membership = await Membership.create({
    customer: current.customer,
    plan: current.plan,
    name,
    type: plan?.type ?? current.type,
    code: shortCode(8),
    price,
    validFrom,
    validUntil,
    credits: plan?.credits ?? current.credits,
    includes,
    status: 'active',
  });

  const invoice = await billing.createInvoice({
    customer: String(current.customer),
    items: [{ type: 'service', name: `${name} (renewal)`, quantity: 1, unitPrice: price }],
    notes: `Membership renewal: ${name}`,
    createdBy: actor?.userId,
    payments:
      input.paidAmount && input.paidAmount > 0
        ? [{ method: input.paymentMethod ?? 'cash', amount: input.paidAmount }]
        : undefined,
  });

  membership.purchaseInvoice = invoice._id;
  await membership.save();

  return { membership, invoice };
}

export async function listRedemptions(req: Request) {
  const p = parsePagination(req, '-createdAt');
  const q = req.query as Record<string, string | undefined>;
  const filter: Record<string, unknown> = {};
  if (q.membershipId && mongoose.isValidObjectId(q.membershipId)) {
    filter.membership = new Types.ObjectId(q.membershipId);
  }
  if (q.customerId && mongoose.isValidObjectId(q.customerId)) {
    filter.customer = new Types.ObjectId(q.customerId);
  }

  const [docs, total] = await Promise.all([
    PackageRedemption.find(filter)
      .sort(p.sort)
      .skip(p.skip)
      .limit(p.limit)
      .populate('service', 'name price')
      .populate('customer', 'name email phone')
      .populate('membership', 'name code status')
      .lean(),
    PackageRedemption.countDocuments(filter),
  ]);
  return buildListResponse(docs, total, p);
}
