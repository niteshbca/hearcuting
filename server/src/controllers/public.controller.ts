import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as publicService from '../services/public.service';

export const getSettings = asyncHandler(async (_req: Request, res: Response) => {
  const data = await publicService.getPublicSettings();
  res.json({ data });
});

export const getServices = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as { search?: string; category?: string };
  const data = await publicService.listPublicServices({ search: q.search, category: q.category });
  res.json({ data });
});

export const getStaff = asyncHandler(async (_req: Request, res: Response) => {
  const data = await publicService.listPublicStaff();
  res.json({ data });
});

export const getReviews = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as { limit?: number | string };
  const data = await publicService.listPublicReviews(Number(q.limit) || 50);
  res.json({ data });
});

export const getPlans = asyncHandler(async (_req: Request, res: Response) => {
  const data = await publicService.listPublicPlans();
  res.json({ data });
});
