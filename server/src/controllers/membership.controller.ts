import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { actorFrom } from '../middleware/auth';
import { errors } from '../utils/errors';
import { roleHasPermission } from '../utils/permissions';
import { logAudit } from '../services/audit.service';
import * as membershipService from '../services/membership.service';

export const listPlans = asyncHandler(async (_req: Request, res: Response) => {
  const result = await membershipService.listPlans();
  res.json(result);
});

export const createPlan = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const plan = await membershipService.createPlan(req.body, actor);
  await logAudit({
    actor,
    action: 'membership_plan.create',
    entity: 'MembershipPlan',
    entityId: String(plan._id),
    after: { name: plan.name, price: plan.price },
  });
  res.status(201).json({ data: plan });
});

export const updatePlan = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const plan = await membershipService.updatePlan(req.params.id, req.body);
  await logAudit({
    actor,
    action: 'membership_plan.update',
    entity: 'MembershipPlan',
    entityId: String(plan._id),
    after: req.body,
  });
  res.json({ data: plan });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await membershipService.listMemberships(req);
  res.json(result);
});

export const purchase = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const result = await membershipService.purchaseMembership(req.body, actor);
  await logAudit({
    actor,
    action: 'membership.purchase',
    entity: 'Membership',
    entityId: String(result.membership._id),
    after: { planId: req.body.planId, customerId: req.body.customerId, invoice: result.invoice.invoiceNumber },
  });
  res.status(201).json({ data: result });
});

export const customerMemberships = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw errors.unauthorized();
  const customerId = req.params.customerId;
  const allowed =
    roleHasPermission(req.user.role, 'memberships.view') || req.user.customerId === customerId;
  if (!allowed) throw errors.forbidden();
  const result = await membershipService.getCustomerMemberships(customerId);
  res.json(result);
});

export const redeem = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const result = await membershipService.redeemMembership(req.params.id, req.body, actor);
  await logAudit({
    actor,
    action: 'membership.redeem',
    entity: 'PackageRedemption',
    entityId: String(result.redemption._id),
    after: {
      membershipId: req.params.id,
      serviceId: req.body.serviceId,
      remainingAfter: result.redemption.remainingAfter,
    },
  });
  res.status(201).json({ data: result });
});

export const renew = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const result = await membershipService.renewMembership(req.params.id, req.body, actor);
  await logAudit({
    actor,
    action: 'membership.renew',
    entity: 'Membership',
    entityId: String(result.membership._id),
    after: { previousId: req.params.id, invoice: result.invoice.invoiceNumber },
  });
  res.status(201).json({ data: result });
});

export const redemptions = asyncHandler(async (req: Request, res: Response) => {
  const result = await membershipService.listRedemptions(req);
  res.json(result);
});
