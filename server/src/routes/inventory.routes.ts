import { Router } from 'express';
import { validate } from '../middleware/validate';
import { requireAuth, requirePermission } from '../middleware/auth';
import * as ctrl from '../controllers/inventory.controller';
import {
  createSupplierSchema,
  stockSchema,
  updateSupplierSchema,
} from '../validators/inventory.validators';

export const router = Router();

router.get('/suppliers', requireAuth, requirePermission('inventory.view'), ctrl.listSuppliers);
router.post(
  '/suppliers',
  requireAuth,
  requirePermission('inventory.manage'),
  validate({ body: createSupplierSchema }),
  ctrl.createSupplier
);
router.patch(
  '/suppliers/:id',
  requireAuth,
  requirePermission('inventory.manage'),
  validate({ body: updateSupplierSchema }),
  ctrl.updateSupplier
);
router.get('/transactions', requireAuth, requirePermission('inventory.view'), ctrl.listTransactions);
router.get('/stock-report', requireAuth, requirePermission('inventory.view'), ctrl.stockReportHandler);
router.post(
  '/stock',
  requireAuth,
  requirePermission('inventory.manage'),
  validate({ body: stockSchema }),
  ctrl.stock
);
