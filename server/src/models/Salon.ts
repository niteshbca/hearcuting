import { Schema, model, Types, Document } from 'mongoose';

export const EXPENSE_CATEGORIES = [
  'rent',
  'electricity',
  'salaries',
  'supplies',
  'maintenance',
  'marketing',
  'other',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface ExpenseDoc extends Document {
  _id: Types.ObjectId;
  category: ExpenseCategory;
  title: string;
  amount: number;
  date: Date;
  vendor?: string;
  paymentMethod: 'cash' | 'upi' | 'card' | 'bank' | 'other';
  notes?: string;
  attachmentUrl?: string;
  recordedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const expenseSchema = new Schema<ExpenseDoc>(
  {
    category: { type: String, enum: EXPENSE_CATEGORIES, required: true, index: true },
    title: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0.01 },
    date: { type: Date, required: true, index: true },
    vendor: String,
    paymentMethod: { type: String, enum: ['cash', 'upi', 'card', 'bank', 'other'], default: 'cash' },
    notes: String,
    attachmentUrl: String,
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

expenseSchema.index({ date: -1, category: 1 });

export const Expense = model<ExpenseDoc>('Expense', expenseSchema);

export interface NotificationDoc extends Document {
  _id: Types.ObjectId;
  user?: Types.ObjectId;
  role?: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<NotificationDoc>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    role: { type: String, index: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    data: Schema.Types.Mixed,
    isRead: { type: Boolean, default: false, index: true },
    readAt: Date,
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ role: 1, isRead: 1, createdAt: -1 });

export const Notification = model<NotificationDoc>('Notification', notificationSchema);

export interface EmailDeliveryLogDoc extends Document {
  _id: Types.ObjectId;
  to: string;
  toName?: string;
  subject: string;
  template: string;
  relatedType?: string;
  relatedId?: Types.ObjectId | string;
  status: 'queued' | 'sending' | 'sent' | 'failed' | 'retrying';
  transport: 'smtp' | 'json';
  attempts: number;
  maxAttempts: number;
  dedupeKey: string;
  nextAttemptAt?: Date;
  lastError?: string;
  providerMessageId?: string;
  sentAt?: Date;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const emailDeliveryLogSchema = new Schema<EmailDeliveryLogDoc>(
  {
    to: { type: String, required: true, lowercase: true, trim: true },
    toName: String,
    subject: { type: String, required: true },
    template: { type: String, required: true },
    relatedType: String,
    relatedId: Schema.Types.Mixed,
    status: {
      type: String,
      enum: ['queued', 'sending', 'sent', 'failed', 'retrying'],
      default: 'queued',
      index: true,
    },
    transport: { type: String, enum: ['smtp', 'json'], default: 'smtp' },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },
    dedupeKey: { type: String, required: true, unique: true },
    nextAttemptAt: { type: Date, default: Date.now, index: true },
    lastError: String,
    providerMessageId: String,
    sentAt: Date,
    payload: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

emailDeliveryLogSchema.index({ status: 1, nextAttemptAt: 1 });
emailDeliveryLogSchema.index({ createdAt: -1 });

export const EmailDeliveryLog = model<EmailDeliveryLogDoc>('EmailDeliveryLog', emailDeliveryLogSchema);

export interface SalonSettingsDoc extends Document {
  _id: Types.ObjectId;
  key: string;
  salonName: string;
  tagline: string;
  logoUrl: string;
  address: { line1: string; line2?: string; city: string; state?: string; postalCode?: string; country: string; geo?: { lat: number; lng: number } };
  phone: string;
  whatsapp: string;
  email: string;
  social: { instagram?: string; facebook?: string; youtube?: string };
  currency: { code: string; symbol: string };
  timezone: string;
  aboutText: string;
  heroImages: string[];
  galleryImages: { url: string; caption?: string; category?: string }[];
  booking: {
    autoConfirm: boolean;
    allowGuest: boolean;
    maxAdvanceDays: number;
    minNoticeHours: number;
    slotIntervalMinutes: number;
    bufferMinutes: number;
    requireDeposit: boolean;
    depositPercent: number;
    rescheduleCutoffHours: number;
    cancelCutoffHours: number;
    cancellationPolicyText: string;
    noShowFeePercent: number;
  };
  notifications: { emailEnabled: boolean; remindersEnabled: boolean; remindersHoursBefore: number };
  payments: { onlinePaymentsEnabled: boolean; showPrices: boolean };
  privacyPolicyText: string;
  termsText: string;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const salonSettingsSchema = new Schema<SalonSettingsDoc>(
  {
    key: { type: String, default: 'general', unique: true },
    salonName: { type: String, default: 'SalonPro' },
    tagline: { type: String, default: 'Look Sharp. Feel Great.' },
    logoUrl: { type: String, default: '' },
    address: {
      line1: { type: String, default: '' },
      line2: String,
      city: { type: String, default: '' },
      state: String,
      postalCode: String,
      country: { type: String, default: 'India' },
      geo: {
        lat: Number,
        lng: Number,
      },
    },
    phone: { type: String, default: '' },
    whatsapp: { type: String, default: '' },
    email: { type: String, default: '' },
    social: {
      instagram: String,
      facebook: String,
      youtube: String,
    },
    currency: {
      code: { type: String, default: 'INR' },
      symbol: { type: String, default: '₹' },
    },
    timezone: { type: String, default: 'Asia/Kolkata' },
    aboutText: { type: String, default: '' },
    heroImages: { type: [String], default: [] },
    galleryImages: {
      type: [{ url: String, caption: String, category: String }],
      default: [],
    },
    booking: {
      autoConfirm: { type: Boolean, default: true },
      allowGuest: { type: Boolean, default: true },
      maxAdvanceDays: { type: Number, default: 60 },
      minNoticeHours: { type: Number, default: 2 },
      slotIntervalMinutes: { type: Number, default: 15 },
      bufferMinutes: { type: Number, default: 5 },
      requireDeposit: { type: Boolean, default: false },
      depositPercent: { type: Number, default: 20 },
      rescheduleCutoffHours: { type: Number, default: 4 },
      cancelCutoffHours: { type: Number, default: 2 },
      cancellationPolicyText: {
        type: String,
        default:
          'Appointments may be rescheduled or cancelled free of charge up to 4 hours before the start time. Cancellations inside the cutoff window or no-shows may be charged a fee of up to 50% of the service price.',
      },
      noShowFeePercent: { type: Number, default: 50 },
    },
    notifications: {
      emailEnabled: { type: Boolean, default: true },
      remindersEnabled: { type: Boolean, default: true },
      remindersHoursBefore: { type: Number, default: 3 },
    },
    payments: {
      onlinePaymentsEnabled: { type: Boolean, default: false },
      showPrices: { type: Boolean, default: true },
    },
    privacyPolicyText: { type: String, default: '' },
    termsText: { type: String, default: '' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export const SalonSettings = model<SalonSettingsDoc>('SalonSettings', salonSettingsSchema);

export interface ReviewDoc extends Document {
  _id: Types.ObjectId;
  name: string;
  rating: number;
  comment: string;
  avatarUrl?: string;
  source: 'website' | 'google' | 'manual';
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new Schema<ReviewDoc>(
  {
    name: { type: String, required: true, trim: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, trim: true, maxlength: 2000 },
    avatarUrl: String,
    source: { type: String, enum: ['website', 'google', 'manual'], default: 'website' },
    isPublished: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

export const Review = model<ReviewDoc>('Review', reviewSchema);

export interface AuditLogDoc extends Document {
  _id: Types.ObjectId;
  actor?: Types.ObjectId;
  actorRole?: string;
  action: string;
  entity: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

const auditLogSchema = new Schema<AuditLogDoc>(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    actorRole: String,
    action: { type: String, required: true, index: true },
    entity: { type: String, required: true, index: true },
    entityId: String,
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    ip: String,
    userAgent: String,
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 });

export const AuditLog = model<AuditLogDoc>('AuditLog', auditLogSchema);
