import { Router } from 'express';
import { validate } from '../middleware/validate';
import { requireAuth, requirePermission } from '../middleware/auth';
import * as ctrl from '../controllers/customer.controller';
import * as validators from '../validators/customer.validators';

export const router = Router();

router.get(
  '/',
  requireAuth,
  requirePermission('customers.view'),
  validate({ query: validators.customerListQuerySchema }),
  ctrl.list
);
router.post(
  '/',
  requireAuth,
  requirePermission('customers.create'),
  validate({ body: validators.createCustomerSchema }),
  ctrl.create
);

// Registered before `/:id` so the literal segment is not captured as an id.
router.get('/segments', requireAuth, requirePermission('customers.view'), ctrl.segments);

router.get('/:id', requireAuth, ctrl.viewOrOwn, ctrl.get);
router.patch(
  '/:id',
  requireAuth,
  ctrl.updateOrOwn,
  validate({ body: validators.updateCustomerSchema }),
  ctrl.update
);
router.post(
  '/:id/notes',
  requireAuth,
  requirePermission('customers.notes'),
  validate({ body: validators.customerNotesSchema }),
  ctrl.addNotes
);
router.get(
  '/:id/bookings',
  requireAuth,
  ctrl.viewOrOwn,
  validate({ query: validators.customerPageQuerySchema }),
  ctrl.bookings
);
router.get(
  '/:id/invoices',
  requireAuth,
  ctrl.invoicesOrOwn,
  validate({ query: validators.customerPageQuerySchema }),
  ctrl.invoices
);
router.get('/:id/summary', requireAuth, ctrl.viewOrOwn, ctrl.summary);
router.get('/:id/export', requireAuth, requirePermission('customers.export'), ctrl.exportCsv);
