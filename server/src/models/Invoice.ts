import { Schema, model, Types, Document } from 'mongoose';

export type InvoiceStatus = 'draft' | 'unpaid' | 'partially_paid' | 'paid' | 'refunded' | 'void';

export interface InvoiceItem {
  type: 'service' | 'product';
  refId?: Types.ObjectId;
  name: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  total: number;
  staff?: Types.ObjectId;
  membershipRedemptionId?: Types.ObjectId;
}

export interface InvoiceDoc extends Document {
  _id: Types.ObjectId;
  invoiceNumber: string;
  customer?: Types.ObjectId;
  customerUser?: Types.ObjectId;
  appointment?: Types.ObjectId;
  items: InvoiceItem[];
  subtotal: number;
  discount: { type: 'percent' | 'fixed'; value: number; amount: number };
  tax: { rate: number; amount: number };
  total: number;
  amountPaid: number;
  balanceDue: number;
  refundedAmount: number;
  status: InvoiceStatus;
  notes?: string;
  createdBy?: Types.ObjectId;
  issuedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const invoiceItemSchema = new Schema<InvoiceItem>(
  {
    type: { type: String, enum: ['service', 'product'], required: true },
    refId: { type: Schema.Types.ObjectId },
    name: { type: String, required: true },
    description: String,
    quantity: { type: Number, required: true, min: 1, default: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    staff: { type: Schema.Types.ObjectId, ref: 'StaffProfile' },
    membershipRedemptionId: { type: Schema.Types.ObjectId, ref: 'PackageRedemption' },
  },
  { _id: false }
);

const invoiceSchema = new Schema<InvoiceDoc>(
  {
    invoiceNumber: { type: String, required: true, unique: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'CustomerProfile', index: true },
    customerUser: { type: Schema.Types.ObjectId, ref: 'User' },
    appointment: { type: Schema.Types.ObjectId, ref: 'Appointment', index: true },
    items: { type: [invoiceItemSchema], default: [] },
    subtotal: { type: Number, required: true, min: 0 },
    discount: {
      type: {
        type: String,
        enum: ['percent', 'fixed'],
        default: 'fixed',
      },
      value: { type: Number, default: 0 },
      amount: { type: Number, default: 0 },
    },
    tax: {
      rate: { type: Number, default: 0 },
      amount: { type: Number, default: 0 },
    },
    total: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
    balanceDue: { type: Number, default: 0 },
    refundedAmount: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['draft', 'unpaid', 'partially_paid', 'paid', 'refunded', 'void'], default: 'unpaid', index: true },
    notes: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    issuedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

invoiceSchema.index({ createdAt: -1 });
invoiceSchema.index({ customer: 1, createdAt: -1 });

export const Invoice = model<InvoiceDoc>('Invoice', invoiceSchema);
