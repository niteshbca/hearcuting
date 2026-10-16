import { Schema, model, Types, Document } from 'mongoose';

export interface MembershipPlanDoc extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  type: 'membership' | 'package';
  description: string;
  price: number;
  validityDays: number;
  includes: { service?: Types.ObjectId; serviceName?: string; limitTotal: number; discountPercent?: number }[];
  credits?: number; // prepaid wallet credits for packages
  isActive: boolean;
  sortWeight: number;
  createdAt: Date;
  updatedAt: Date;
}

const planIncludeSchema = new Schema(
  {
    service: { type: Schema.Types.ObjectId, ref: 'Service' },
    serviceName: String,
    limitTotal: { type: Number, required: true, min: 1 },
    discountPercent: { type: Number, min: 0, max: 100 },
  },
  { _id: false }
);

const membershipPlanSchema = new Schema<MembershipPlanDoc>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    type: { type: String, enum: ['membership', 'package'], default: 'package' },
    description: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    validityDays: { type: Number, required: true, min: 1 },
    includes: { type: [planIncludeSchema], default: [] },
    credits: { type: Number, min: 0 },
    isActive: { type: Boolean, default: true },
    sortWeight: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const MembershipPlan = model<MembershipPlanDoc>('MembershipPlan', membershipPlanSchema);

export interface MembershipDoc extends Document {
  _id: Types.ObjectId;
  customer: Types.ObjectId;
  plan?: Types.ObjectId;
  name: string;
  type: 'membership' | 'package';
  code: string;
  price: number;
  validFrom: Date;
  validUntil: Date;
  credits: number;
  includes: { service?: Types.ObjectId; serviceName?: string; limitTotal: number; limitUsed: number; discountPercent?: number }[];
  status: 'active' | 'expired' | 'exhausted' | 'cancelled';
  purchaseInvoice?: Types.ObjectId;
  autoRenew: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const membershipIncludeSchema = new Schema(
  {
    service: { type: Schema.Types.ObjectId, ref: 'Service' },
    serviceName: String,
    limitTotal: { type: Number, required: true },
    limitUsed: { type: Number, default: 0 },
    discountPercent: Number,
  },
  { _id: false }
);

const membershipSchema = new Schema<MembershipDoc>(
  {
    customer: { type: Schema.Types.ObjectId, ref: 'CustomerProfile', required: true, index: true },
    plan: { type: Schema.Types.ObjectId, ref: 'MembershipPlan' },
    name: { type: String, required: true },
    type: { type: String, enum: ['membership', 'package'], default: 'package' },
    code: { type: String, required: true, unique: true, uppercase: true },
    price: { type: Number, required: true, min: 0 },
    validFrom: { type: Date, required: true },
    validUntil: { type: Date, required: true, index: true },
    credits: { type: Number, default: 0, min: 0 },
    includes: { type: [membershipIncludeSchema], default: [] },
    status: { type: String, enum: ['active', 'expired', 'exhausted', 'cancelled'], default: 'active', index: true },
    purchaseInvoice: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    autoRenew: { type: Boolean, default: false },
  },
  { timestamps: true }
);

membershipSchema.index({ customer: 1, status: 1 });

export const Membership = model<MembershipDoc>('Membership', membershipSchema);

export interface PackageRedemptionDoc extends Document {
  _id: Types.ObjectId;
  membership: Types.ObjectId;
  customer: Types.ObjectId;
  service?: Types.ObjectId;
  appointment?: Types.ObjectId;
  invoice?: Types.ObjectId;
  value: number;
  remainingAfter: { service?: Types.ObjectId; count: number } | null;
  redeemedBy?: Types.ObjectId;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const packageRedemptionSchema = new Schema<PackageRedemptionDoc>(
  {
    membership: { type: Schema.Types.ObjectId, ref: 'Membership', required: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'CustomerProfile', required: true, index: true },
    service: { type: Schema.Types.ObjectId, ref: 'Service' },
    appointment: { type: Schema.Types.ObjectId, ref: 'Appointment' },
    invoice: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    value: { type: Number, required: true, min: 0 },
    remainingAfter: Schema.Types.Mixed,
    redeemedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    notes: String,
  },
  { timestamps: true }
);

packageRedemptionSchema.index({ membership: 1, createdAt: -1 });

export const PackageRedemption = model<PackageRedemptionDoc>('PackageRedemption', packageRedemptionSchema);
