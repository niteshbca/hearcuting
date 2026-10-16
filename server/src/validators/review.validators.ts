import { z } from 'zod';

const boolish = z.enum(['true', 'false']).transform((v) => v === 'true');

export const publicReviewQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const adminReviewQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  sort: z.string().max(120).optional(),
  published: boolish.optional(),
});

export const createReviewSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name').max(80),
  rating: z.number().int().min(1, 'Rating must be between 1 and 5').max(5, 'Rating must be between 1 and 5'),
  comment: z.string().trim().min(3, 'Please write a short review').max(2000),
});

export const updateReviewSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().trim().min(3).max(2000).optional(),
  isPublished: z.boolean().optional(),
});
