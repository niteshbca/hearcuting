import { Router } from 'express';
import { validate } from '../middleware/validate';
import { requireAuth, requirePermission } from '../middleware/auth';
import * as ctrl from '../controllers/invoice.controller';
import {
  createInvoiceSchema,
  invoiceStatusSchema,
  refundInvoiceSchema,
} from '../validators/invoice.validators';

export const router = Router();

router.get('/', requireAuth, requirePermission('invoices.view'), ctrl.list);
router.post(
  '/',
  requireAuth,
  requirePermission('invoices.create'),
  validate({ body: createInvoiceSchema }),
  ctrl.create
);
router.post(
  '/:id/refund',
  requireAuth,
  requirePermission('invoices.refund'),
  validate({ body: refundInvoiceSchema }),
  ctrl.refund
);
router.patch(
  '/:id/status',
  requireAuth,
  requirePermission('invoices.create'),
  validate({ body: invoiceStatusSchema }),
  ctrl.setStatus
);
router.get('/:id/print', requireAuth, ctrl.print);
router.get('/:id', requireAuth, ctrl.getOne);
