import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { actorFrom } from '../middleware/auth';
import { parsePagination } from '../utils/pagination';
import { logAudit } from '../services/audit.service';
import * as reviewService from '../services/review.service';

export const listPublic = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as { limit?: number };
  const data = await reviewService.listPublished(Number(q.limit) || 50);
  res.json({ data });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  await reviewService.createReview(req.body);
  res.status(201).json({
    data: { message: 'Thanks! Your review will appear after moderation.' },
  });
});

export const listAdmin = asyncHandler(async (req: Request, res: Response) => {
  const pagination = parsePagination(req);
  const q = req.query as { published?: boolean };
  const result = await reviewService.listAdmin(q, pagination);
  res.json(result);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const { before, after } = await reviewService.updateReview(req.params.id, req.body);
  await logAudit({
    actor,
    action: 'review.update',
    entity: 'Review',
    entityId: req.params.id,
    before,
    after: after.toObject(),
  });
  res.json({ data: after });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorFrom(req);
  const review = await reviewService.deleteReview(req.params.id);
  await logAudit({
    actor,
    action: 'review.delete',
    entity: 'Review',
    entityId: req.params.id,
    before: review.toObject(),
  });
  res.json({ data: { deleted: true } });
});
