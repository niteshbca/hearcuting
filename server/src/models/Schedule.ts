import { Schema, model, Types, Document } from 'mongoose';

export interface BusinessHoursDoc extends Document {
  _id: Types.ObjectId;
  dayOfWeek: number; // 0=Sunday
  isOpen: boolean;
  openTime: string; // HH:mm
  closeTime: string;
  createdAt: Date;
  updatedAt: Date;
}

const businessHoursSchema = new Schema<BusinessHoursDoc>(
  {
    dayOfWeek: { type: Number, required: true, unique: true, min: 0, max: 6 },
    isOpen: { type: Boolean, default: true },
    openTime: { type: String, default: '10:00', match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    closeTime: { type: String, default: '21:00', match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  },
  { timestamps: true }
);

export const BusinessHours = model<BusinessHoursDoc>('BusinessHours', businessHoursSchema);

export interface StaffAvailabilityDoc extends Document {
  _id: Types.ObjectId;
  staff: Types.ObjectId;
  date?: string; // YYYY-MM-DD — when set, this is a per-date override
  dayOfWeek?: number; // recurring override when date is not set
  isAvailable: boolean;
  start?: string;
  end?: string;
  breaks: { start: string; end: string }[];
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const staffAvailabilitySchema = new Schema<StaffAvailabilityDoc>(
  {
    staff: { type: Schema.Types.ObjectId, ref: 'StaffProfile', required: true, index: true },
    date: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    dayOfWeek: { type: Number, min: 0, max: 6 },
    isAvailable: { type: Boolean, default: true },
    start: String,
    end: String,
    breaks: {
      type: [{ start: String, end: String }],
      default: [],
    },
    reason: String,
  },
  { timestamps: true }
);

staffAvailabilitySchema.index({ staff: 1, date: 1 }, { unique: true, partialFilterExpression: { date: { $type: 'string' } } });
staffAvailabilitySchema.index({ staff: 1, dayOfWeek: 1 }, { unique: true, partialFilterExpression: { dayOfWeek: { $type: 'number' } } });

export const StaffAvailability = model<StaffAvailabilityDoc>('StaffAvailability', staffAvailabilitySchema);

export interface StaffLeaveDoc extends Document {
  _id: Types.ObjectId;
  staff: Types.ObjectId;
  startDate: string;
  endDate: string;
  type: 'paid' | 'unpaid' | 'sick' | 'other';
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: Types.ObjectId;
  reviewNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const staffLeaveSchema = new Schema<StaffLeaveDoc>(
  {
    staff: { type: Schema.Types.ObjectId, ref: 'StaffProfile', required: true, index: true },
    startDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    endDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    type: { type: String, enum: ['paid', 'unpaid', 'sick', 'other'], default: 'paid' },
    reason: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewNote: String,
  },
  { timestamps: true }
);

staffLeaveSchema.index({ staff: 1, startDate: 1, endDate: 1 });

export const StaffLeave = model<StaffLeaveDoc>('StaffLeave', staffLeaveSchema);
