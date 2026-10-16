import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { requireAuth, requirePermission } from '../middleware/auth';
import { maybe, writeLimiter } from '../middleware/rateLimit';
import * as ctrl from '../controllers/payment.controller';

export const router = Router();

const orderSchema = z.object({ appointmentReference: z.string().min(4).max(32) });
const verifySchema = z.object({
  appointmentReference: z.string().min(4).max(32),
  orderId: z.string().min(4).max(120),
  paymentId: z.string().min(4).max(120),
  signature: z.string().min(8).max(256),
});
const recordSchema = z.object({
  method: z.enum(['cash', 'upi', 'card', 'online', 'voucher', 'membership']),
  amount: z.number().positive(),
  reference: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
});
const refundSchema = z.object({
  amount: z.number().positive().optional(),
  reason: z.string().max(500).optional(),
});

// Public (rate-limited) online payment endpoints
router.post('/online/create-order', maybe(writeLimiter), validate({ body: orderSchema }), ctrl.createOrder);
router.post('/online/verify', maybe(writeLimiter), validate({ body: verifySchema }), ctrl.verify);

// Authenticated payments
router.get('/', requireAuth, requirePermission('payments.view'), ctrl.list);
router.get('/today', requireAuth, requirePermission('payments.view'), ctrl.today);
router.post(
  '/:invoiceId',
  requireAuth,
  requirePermission('payments.record'),
  validate({ body: recordSchema }),
  ctrl.record
);
router.post(
  '/:id/refund',
  requireAuth,
  requirePermission('payments.refund'),
  validate({ body: refundSchema }),
  ctrl.refund
);
