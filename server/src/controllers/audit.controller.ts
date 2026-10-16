import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuditLog } from '../models/Salon';
import { buildListResponse, parsePagination } from '../utils/pagination';
import { endOfLocalDay, startOfLocalDay } from '../utils/time';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const p = parsePagination(req, '-createdAt');
  const q = req.query as Record<string, string | undefined>;
  const filter: Record<string, unknown> = {};
  if (q.action) filter.action = q.action;
  if (q.entity) filter.entity = q.entity;
  if (q.actor) filter.actor = q.actor;
  if (q.from || q.to) {
    filter.createdAt = {};
    if (q.from) (filter.createdAt as Record<string, Date>).$gte = startOfLocalDay(q.from);
    if (q.to) (filter.createdAt as Record<string, Date>).$lt = endOfLocalDay(q.to);
  }
  const [docs, total] = await Promise.all([
    AuditLog.find(filter)
      .sort(p.sort)
      .skip(p.skip)
      .limit(p.limit)
      .populate('actor', 'name email role')
      .lean(),
    AuditLog.countDocuments(filter),
  ]);
  res.json(buildListResponse(docs, total, p));
});
