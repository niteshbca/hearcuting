import { Router } from 'express';
import { validate } from '../middleware/validate';
import { requireAuth, requirePermission } from '../middleware/auth';
import * as ctrl from '../controllers/product.controller';
import {
  createProductSchema,
  productStatusSchema,
  updateProductSchema,
} from '../validators/product.validators';

export const router = Router();

router.get('/', requireAuth, requirePermission('products.view'), ctrl.list);
router.get('/low-stock', requireAuth, requirePermission('products.view'), ctrl.lowStock);
router.post(
  '/',
  requireAuth,
  requirePermission('products.manage'),
  validate({ body: createProductSchema }),
  ctrl.create
);
router.get('/:id', requireAuth, requirePermission('products.view'), ctrl.getOne);
router.patch(
  '/:id',
  requireAuth,
  requirePermission('products.manage'),
  validate({ body: updateProductSchema }),
  ctrl.update
);
router.patch(
  '/:id/status',
  requireAuth,
  requirePermission('products.manage'),
  validate({ body: productStatusSchema }),
  ctrl.setStatus
);
