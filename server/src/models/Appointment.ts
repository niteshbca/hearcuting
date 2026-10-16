import { Schema, model, Types, Document } from 'mongoose';

export type AppointmentStatus = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
export type PaymentStatus = 'unpaid' | 'deposit_paid' | 'paid' | 'partially_paid' | 'refunded';
export type BookingSource = 'website' | 'phone' | 'walk_in' | 'admin';

export interface AppointmentSnapshot {
  name: string;
  category: string;
  price: number;
  durationMinutes: number;
}

export interface RescheduleEntry {
  fromStart: Date;
  toStart: Date;
  at: Date;
  byUserId?: Types.ObjectId;
  byRole?: string;
  reason?: string;
}

export interface AppointmentDoc extends Document {
  _id: Types.ObjectId;
  reference: string;
  customer?: Types.ObjectId;
  customerUser?: Types.ObjectId;
  guest?: { name: string; email: string; phone: string };
  managementTokenHash?: string;
  staff: Types.ObjectId;
  service: Types.ObjectId;
  serviceSnapshot: AppointmentSnapshot;
  date: string; // YYYY-MM-DD salon-local
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatus;
  paymentStatus: PaymentStatus;
  source: BookingSource;
  totalPrice: number;
  depositAmount: number;
  notes?: string;
  serviceNotes?: string;
  internalNotes?: string;
  cancelledAt?: Date;
  cancelledBy?: Types.ObjectId;
  cancelReason?: string;
  noShowAt?: Date;
  completedAt?: Date;
  invoice?: Types.ObjectId;
  rescheduleHistory: RescheduleEntry[];
  remindersSent: { type: string; at: Date }[];
  createdAt: Date;
  updatedAt: Date;
}

const snapshotSchema = new Schema<AppointmentSnapshot>(
  {
    name: { type: String, required: true },
    category: { type: String, required: true },
    price: { type: Number, required: true },
    durationMinutes: { type: Number, required: true },
  },
  { _id: false }
);

const appointmentSchema = new Schema<AppointmentDoc>(
  {
    reference: { type: String, required: true, unique: true, uppercase: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'CustomerProfile', index: true },
    customerUser: { type: Schema.Types.ObjectId, ref: 'User' },
    guest: {
      name: String,
      email: String,
      phone: String,
    },
    managementTokenHash: { type: String, select: false },
    staff: { type: Schema.Types.ObjectId, ref: 'StaffProfile', required: true, index: true },
    service: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    serviceSnapshot: { type: snapshotSchema, required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
    startsAt: { type: Date, required: true, index: true },
    endsAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'],
      default: 'pending',
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'deposit_paid', 'paid', 'partially_paid', 'refunded'],
      default: 'unpaid',
      index: true,
    },
    source: { type: String, enum: ['website', 'phone', 'walk_in', 'admin'], default: 'website' },
    totalPrice: { type: Number, required: true, min: 0 },
    depositAmount: { type: Number, default: 0, min: 0 },
    notes: { type: String, default: '' },
    serviceNotes: { type: String, default: '' },
    internalNotes: { type: String, default: '' },
    cancelledAt: Date,
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    cancelReason: String,
    noShowAt: Date,
    completedAt: Date,
    invoice: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    rescheduleHistory: { type: Schema.Types.Mixed, default: [] },
    remindersSent: { type: Schema.Types.Mixed, default: [] },
  },
  { timestamps: true }
);

// Busy-time lookup index (status filter applied in query)
appointmentSchema.index({ staff: 1, startsAt: 1 });
appointmentSchema.index({ date: 1, status: 1 });
appointmentSchema.index({ 'guest.email': 1, date: -1 });
appointmentSchema.index({ startsAt: 1, status: 1 });

export const BUSY_STATUSES: AppointmentStatus[] = ['pending', 'confirmed', 'in_progress'];

export const Appointment = model<AppointmentDoc>('Appointment', appointmentSchema);
