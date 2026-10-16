import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { actorFrom } from '../middleware/auth';
import { parsePagination } from '../utils/pagination';
import { logAudit } from '../services/audit.service';
import * as serviceService from '../services/service.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req);
  const q = req.query as { includeInactive?: boolean; search?: string; category?: string };
  const result = await serviceService.listServices(
    { ...q, role: req.user?.role },
    pagination
  );
  res.json(result);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const created = await serviceService.createService(req.body);
  await logAudit({
    actor,
    action: 'service.create',
    entity: 'Service',
    entityId: String(created._id),
    after: created.toObject(),
  });
  res.status(201).json({ data: created });
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  const data = await serviceService.getService(req.params.id);
  res.json({ data });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const { before, after } = await serviceService.updateService(req.params.id, req.body);
  await logAudit({
    actor,
    action: 'service.update',
    entity: 'Service',
    entityId: req.params.id,
    before,
    after: after.toObject(),
  });
  res.json({ data: after });
});

export const setStatus = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const { data, warning } = await serviceService.setStatus(req.params.id, req.body.isActive);
  await logAudit({
    actor,
    action: 'service.status',
    entity: 'Service',
    entityId: req.params.id,
    after: { isActive: data.isActive },
  });
  res.json(warning ? { data, warning } : { data });
});
