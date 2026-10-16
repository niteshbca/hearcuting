import { Schema, model, Types, Document } from 'mongoose';

export type PaymentMethod = 'cash' | 'upi' | 'card' | 'online' | 'voucher' | 'membership';
export type PaymentRecordStatus = 'pending' | 'captured' | 'failed' | 'refunded' | 'partially_refunded';

export interface PaymentDoc extends Document {
  _id: Types.ObjectId;
  invoice?: Types.ObjectId;
  appointment?: Types.ObjectId;
  customer?: Types.ObjectId;
  amount: number;
  method: PaymentMethod;
  status: PaymentRecordStatus;
  provider: 'manual' | 'razorpay' | 'voucher' | 'membership';
  providerOrderId?: string;
  providerPaymentId?: string;
  reference?: string;
  refundedAmount: number;
  notes?: string;
  recordedBy?: Types.ObjectId;
  paidAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<PaymentDoc>(
  {
    invoice: { type: Schema.Types.ObjectId, ref: 'Invoice', index: true },
    appointment: { type: Schema.Types.ObjectId, ref: 'Appointment', index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'CustomerProfile', index: true },
    amount: { type: Number, required: true, min: 0.01 },
    method: { type: String, enum: ['cash', 'upi', 'card', 'online', 'voucher', 'membership'], required: true },
    status: {
      type: String,
      enum: ['pending', 'captured', 'failed', 'refunded', 'partially_refunded'],
      default: 'captured',
      index: true,
    },
    provider: { type: String, enum: ['manual', 'razorpay', 'voucher', 'membership'], default: 'manual' },
    providerOrderId: { type: String, index: true },
    providerPaymentId: String,
    reference: String,
    refundedAmount: { type: Number, default: 0, min: 0 },
    notes: String,
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    paidAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ providerOrderId: 1, providerPaymentId: 1 });

export const Payment = model<PaymentDoc>('Payment', paymentSchema);

export interface PaymentWebhookEventDoc extends Document {
  _id: Types.ObjectId;
  provider: string;
  eventId: string;
  type: string;
  payload: unknown;
  signatureValid: boolean;
  status: 'received' | 'processed' | 'duplicate' | 'failed' | 'ignored';
  error?: string;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const paymentWebhookEventSchema = new Schema<PaymentWebhookEventDoc>(
  {
    provider: { type: String, required: true },
    eventId: { type: String, required: true },
    type: { type: String, required: true },
    payload: Schema.Types.Mixed,
    signatureValid: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['received', 'processed', 'duplicate', 'failed', 'ignored'],
      default: 'received',
    },
    error: String,
    processedAt: Date,
  },
  { timestamps: true }
);

paymentWebhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

export const PaymentWebhookEvent = model<PaymentWebhookEventDoc>(
  'PaymentWebhookEvent',
  paymentWebhookEventSchema
);
