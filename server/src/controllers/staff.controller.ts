import { NextFunction, Request, RequestHandler, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { actorFrom } from '../middleware/auth';
import { errors } from '../utils/errors';
import { roleHasPermission } from '../utils/permissions';
import { parsePagination } from '../utils/pagination';
import { logAudit } from '../services/audit.service';
import * as staffService from '../services/staff.service';

/** Allows `staff.view` holders or the staff member viewing their own profile. */
export const viewOrSelf: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(errors.unauthorized());
  if (req.user.staffId && req.user.staffId === req.params.id) return next();
  if (roleHasPermission(req.user.role, 'staff.view')) return next();
  return next(errors.forbidden());
};

/** Allows `staff.manage` holders or the staff member editing their own profile. */
export const manageOrSelf: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(errors.unauthorized());
  if (req.user.staffId && req.user.staffId === req.params.id) return next();
  if (roleHasPermission(req.user.role, 'staff.manage')) return next();
  return next(errors.forbidden());
};

/** Allows own performance or `staff.performance.view`. */
export const performanceOrOwn: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(errors.unauthorized());
  if (req.user.staffId && req.user.staffId === req.params.id) return next();
  if (roleHasPermission(req.user.role, 'staff.performance.view')) return next();
  return next(errors.forbidden());
};

export const list = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req);
  const q = req.query as { search?: string; role?: string; isActive?: boolean };
  const result = await staffService.listStaff({ ...q, viewerRole: req.user?.role }, pagination);
  res.json(result);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const { profile, invitePassword } = await staffService.createStaff(req.body);
  await logAudit({
    actor,
    action: 'staff.create',
    entity: 'StaffProfile',
    entityId: String(profile._id),
    after: { ...profile.toObject(), invitePassword: '[REDACTED]' },
  });
  res.status(201).json({ data: { staff: profile, invitePassword } });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const data = await staffService.getMyProfile(actor.userId);
  res.json({ data });
});

export const listLeaves = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req);
  const q = req.query as { status?: string; staffId?: string; from?: string; to?: string };
  const result = await staffService.listLeaves(q, pagination);
  res.json(result);
});

export const createLeave = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const leave = await staffService.createLeave(req.user?.staffId, req.body, actor.role);
  await logAudit({
    actor,
    action: 'staff.leave.create',
    entity: 'StaffLeave',
    entityId: String(leave._id),
    after: leave.toObject(),
  });
  res.status(201).json({ data: leave });
});

export const reviewLeave = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const leave = await staffService.reviewLeave(req.params.id, req.body, actor.userId);
  await logAudit({
    actor,
    action: 'staff.leave.review',
    entity: 'StaffLeave',
    entityId: String(leave._id),
    after: { status: leave.status, reviewNote: leave.reviewNote },
  });
  res.json({ data: leave });
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  const data = (await staffService.getStaffById(req.params.id)) as unknown as Record<string, unknown>;
  const canSeeComp =
    req.user?.role === 'owner' || req.user?.role === 'manager' || req.user?.staffId === req.params.id;
  if (!canSeeComp) {
    delete data.salary;
    delete data.commissionPercent;
  }
  res.json({ data });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const isSelf = Boolean(req.user?.staffId && req.user.staffId === req.params.id);
  const { before, after } = await staffService.updateStaff(req.params.id, req.body, { isSelf });
  await logAudit({
    actor,
    action: 'staff.update',
    entity: 'StaffProfile',
    entityId: req.params.id,
    before,
    after: after.toObject(),
  });
  res.json({ data: after });
});

export const updateSchedule = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const { before, after } = await staffService.updateSchedule(req.params.id, req.body.weeklySchedule);
  await logAudit({
    actor,
    action: 'staff.schedule',
    entity: 'StaffProfile',
    entityId: req.params.id,
    before: { weeklySchedule: before.weeklySchedule },
    after: { weeklySchedule: after.weeklySchedule },
  });
  res.json({ data: after });
});

export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const { before, after } = await staffService.setStatus(req.params.id, req.body.isActive);
  await logAudit({
    actor,
    action: 'staff.status',
    entity: 'StaffProfile',
    entityId: req.params.id,
    before: { isActive: before.isActive },
    after: { isActive: after.isActive },
  });
  res.json({ data: after });
});

export const performance = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as { from?: string; to?: string };
  const data = await staffService.getPerformance(req.params.id, q);
  res.json({ data });
});
