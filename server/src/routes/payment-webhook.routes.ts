import { Router } from 'express';
import express from 'express';
import * as ctrl from '../controllers/payment.controller';

/**
 * Razorpay webhook — mounted BEFORE the JSON body parser so the raw body is
 * available for signature verification. Idempotent via PaymentWebhookEvent.
 */
export const router = Router();

router.post('/razorpay', express.raw({ type: '*/*', limit: '1mb' }), ctrl.webhook);
