import crypto from 'crypto';
import { env, razorpayConfigured } from '../config/env';
import { AppError } from '../utils/errors';

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
  receipt?: string;
}

export function isConfigured(): boolean {
  return razorpayConfigured();
}

/** Verifies Razorpay payment signature from checkout redirect payload. */
export function verifyPaymentSignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const secret = env().RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest('hex');
  return timingSafeEqual(expected, params.signature);
}

/** Verifies a webhook payload signature (x-razorpay-signature header). */
export function verifyWebhookSignature(rawBody: string | Buffer, signature: string | undefined): boolean {
  const secret = env().RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return timingSafeEqual(expected, signature);
}

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** Creates a Razorpay order via REST API (no SDK dependency). */
export async function createOrder(params: {
  amount: number; // in rupees
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = env();
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new AppError(503, 'PAYMENTS_DISABLED', 'Online payments are not configured');
  }
  const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: Math.round(params.amount * 100), // paise
      currency: params.currency,
      receipt: params.receipt,
      notes: params.notes,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new AppError(502, 'PAYMENT_GATEWAY_ERROR', `Payment gateway error: ${text.slice(0, 200)}`);
  }
  return (await response.json()) as RazorpayOrder;
}

export function keyId(): string | undefined {
  return env().RAZORPAY_KEY_ID;
}
