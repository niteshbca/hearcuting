import { NextFunction, Request, RequestHandler, Response } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { actorFrom } from '../middleware/auth';
import { errors } from '../utils/errors';
import { roleHasPermission } from '../utils/permissions';
import { parsePagination } from '../utils/pagination';
import { logAudit } from '../services/audit.service';
import * as customerService from '../services/customer.service';

function resolveCustomerId(req: Request): string {
  const raw = req.params.id;
  const id = raw === 'me' ? req.user?.customerId : raw;
  if (!id || !mongoose.isValidObjectId(id)) throw errors.notFound('Customer not found');
  return id;
}

function isOwnCustomer(req: Request): boolean {
  const raw = req.params.id;
  if (!req.user?.customerId) return false;
  return raw === 'me' || raw === req.user.customerId;
}

function guard(permission?: Parameters<typeof roleHasPermission>[1]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(errors.unauthorized());
    if (isOwnCustomer(req)) return next();
    if (permission && roleHasPermission(req.user.role, permission)) return next();
    return next(errors.forbidden());
  };
}

export const viewOrOwn = guard('customers.view');
export const updateOrOwn = guard('customers.update');
export const invoicesOrOwn = guard('invoices.view');

export const list = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req);
  const q = req.query as {
    search?: string;
    tag?: string;
    staffId?: string;
    from?: string;
    to?: string;
  };
  const result = await customerService.listCustomers(q, pagination, req.user?.role);
  res.json(result);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const { profile, existing } = await customerService.createCustomer(req.body);
  await logAudit({
    actor,
    action: existing ? 'customer.create.duplicate' : 'customer.create',
    entity: 'CustomerProfile',
    entityId: String((profile as { _id?: unknown })._id ?? ''),
    after: existing ? undefined : profile,
  });
  if (existing) {
    res.json({ data: { ...profile, existing: true } });
    return;
  }
  res.status(201).json({ data: profile });
});

export const segments = asyncHandler(async (_req: Request, res: Response) => {
  const data = await customerService.getSegments();
  res.json({ data });
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  const canSeeNotes = roleHasPermission(req.user?.role, 'customers.notes');
  const data = await customerService.getCustomer(resolveCustomerId(req), canSeeNotes);
  res.json({ data });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const customerId = resolveCustomerId(req);
  const isSelf = Boolean(req.user?.customerId && req.user.customerId === customerId);
  const { before, after } = await customerService.updateCustomer(customerId, req.body, { isSelf });
  await logAudit({
    actor,
    action: 'customer.update',
    entity: 'CustomerProfile',
    entityId: customerId,
    before,
    after: after.toObject(),
  });
  res.json({ data: after });
});

export const addNotes = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const customerId = resolveCustomerId(req);
  const profile = await customerService.writeNotes(customerId, req.body.notes, req.body.append);
  await logAudit({
    actor,
    action: 'customer.notes',
    entity: 'CustomerProfile',
    entityId: customerId,
    after: { notes: profile.notes },
  });
  res.json({ data: profile });
});

export const bookings = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req);
  const result = await customerService.listBookings(resolveCustomerId(req), pagination);
  res.json(result);
});

export const invoices = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req);
  const result = await customerService.listInvoices(resolveCustomerId(req), pagination);
  res.json(result);
});

export const summary = asyncHandler(async (req: Request, res: Response) => {
  const canSeeNotes = roleHasPermission(req.user?.role, 'customers.notes');
  const data = await customerService.getSummary(resolveCustomerId(req), canSeeNotes);
  res.json({ data });
});

export const exportCsv = asyncHandler(async (req: Request, res: Response) => {
  const { filename, csv } = await customerService.exportBookingsCsv(req.params.id);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});
