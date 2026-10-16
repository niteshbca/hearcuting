import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { errors } from '../utils/errors';
import { buildListResponse, parsePagination, searchRegex } from '../utils/pagination';
import { Notification, EmailDeliveryLog } from '../models/Salon';
import { retryEmail } from '../services/mail.service';

function scopeFilter(user: NonNullable<Request['user']>): Record<string, unknown> {
  return { $or: [{ user: new mongoose.Types.ObjectId(user.id) }, { role: user.role }] };
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw errors.unauthorized();
  const user = req.user;
  const p = parsePagination(req, '-createdAt');
  const q = req.query as Record<string, string | undefined>;
  const filter: Record<string, unknown> = scopeFilter(user);
  if (q.unreadOnly === 'true') filter.isRead = false;

  const [docs, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort(p.sort).skip(p.skip).limit(p.limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ ...scopeFilter(user), isRead: false }),
  ]);

  const response = buildListResponse(docs, total, p);
  res.json({ ...response, meta: { ...response.meta, unreadCount } });
});

export const markRead = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw errors.unauthorized();
  const filter = { _id: req.params.id, ...scopeFilter(req.user) };
  const notification = await Notification.findOneAndUpdate(
    filter,
    { $set: { isRead: true, readAt: new Date() } },
    { new: true }
  );
  if (!notification) throw errors.notFound('Notification not found');
  res.json({ data: notification });
});

export const readAll = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw errors.unauthorized();
  const result = await Notification.updateMany(
    { ...scopeFilter(req.user), isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
  res.json({ data: { modified: result.modifiedCount } });
});

export const emailLogs = asyncHandler(async (req: Request, res: Response) => {
  const p = parsePagination(req, '-createdAt');
  const q = req.query as Record<string, string | undefined>;
  const filter: Record<string, unknown> = {};
  if (q.status) filter.status = q.status;
  if (q.to && q.to.trim()) filter.to = searchRegex(q.to);
  if (q.search && q.search.trim()) {
    const regex = searchRegex(q.search);
    filter.$or = [{ to: regex }, { subject: regex }, { template: regex }];
  }

  const [docs, total] = await Promise.all([
    EmailDeliveryLog.find(filter).sort(p.sort).skip(p.skip).limit(p.limit).lean(),
    EmailDeliveryLog.countDocuments(filter),
  ]);
  res.json(buildListResponse(docs, total, p));
});

export const retryEmailLog = asyncHandler(async (req: Request, res: Response) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw errors.badRequest('Invalid email log id');
  const requeued = await retryEmail(req.params.id);
  if (!requeued) throw errors.notFound('Nothing to retry for this email log');
  res.json({ data: { id: req.params.id, status: 'queued' } });
});
