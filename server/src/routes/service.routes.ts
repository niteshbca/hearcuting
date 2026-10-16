import { Router } from 'express';
import { validate } from '../middleware/validate';
import { requireAuth, requirePermission } from '../middleware/auth';
import * as ctrl from '../controllers/service.controller';
import * as validators from '../validators/service.validators';

export const router = Router();

router.get('/', requireAuth, validate({ query: validators.serviceListQuerySchema }), ctrl.list);
router.post(
  '/',
  requireAuth,
  requirePermission('services.manage'),
  validate({ body: validators.createServiceSchema }),
  ctrl.create
);
router.get('/:id', requireAuth, ctrl.get);
router.patch(
  '/:id/status',
  requireAuth,
  requirePermission('services.manage'),
  validate({ body: validators.serviceStatusSchema }),
  ctrl.setStatus
);
router.patch(
  '/:id',
  requireAuth,
  requirePermission('services.manage'),
  validate({ body: validators.updateServiceSchema }),
  ctrl.update
);
