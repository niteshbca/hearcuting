import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { apiLimiter, maybe } from '../middleware/rateLimit';
import { SERVICE_CATEGORIES } from '../models/Service';
import * as ctrl from '../controllers/public.controller';

export const router = Router();

const servicesQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  category: z.enum(SERVICE_CATEGORIES).optional(),
});

const reviewsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

router.get('/settings', maybe(apiLimiter), ctrl.getSettings);
router.get('/services', maybe(apiLimiter), validate({ query: servicesQuerySchema }), ctrl.getServices);
router.get('/staff', maybe(apiLimiter), ctrl.getStaff);
router.get('/reviews', maybe(apiLimiter), validate({ query: reviewsQuerySchema }), ctrl.getReviews);
router.get('/plans', maybe(apiLimiter), ctrl.getPlans);
