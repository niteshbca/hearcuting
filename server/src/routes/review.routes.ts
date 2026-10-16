import { Router } from 'express';
import { validate } from '../middleware/validate';
import { requireAuth, requirePermission } from '../middleware/auth';
import { maybe, strictAuthLimiter } from '../middleware/rateLimit';
import * as ctrl from '../controllers/review.controller';
import * as validators from '../validators/review.validators';

export const router = Router();

router.get('/', validate({ query: validators.publicReviewQuerySchema }), ctrl.listPublic);
router.post(
  '/',
  maybe(strictAuthLimiter),
  validate({ body: validators.createReviewSchema }),
  ctrl.create
);

// Moderation endpoints (registered before `/:id`).
router.get(
  '/admin',
  requireAuth,
  requirePermission('reviews.manage'),
  validate({ query: validators.adminReviewQuerySchema }),
  ctrl.listAdmin
);

router.patch(
  '/:id',
  requireAuth,
  requirePermission('reviews.manage'),
  validate({ body: validators.updateReviewSchema }),
  ctrl.update
);
router.delete('/:id', requireAuth, requirePermission('reviews.manage'), ctrl.remove);
