import { Schema, model, Types, Document } from 'mongoose';

export interface ShiftBreak {
  start: string; // HH:mm
  end: string;
}

export interface WeeklyDay {
  day: number; // 0=Sunday
  isWorking: boolean;
  start: string;
  end: string;
  breaks: ShiftBreak[];
}

export interface StaffProfileDoc extends Document {
  _id: Types.ObjectId;
  user?: Types.ObjectId;
  name: string;
  email: string;
  phone: string;
  photoUrl?: string;
  role: 'barber' | 'manager' | 'receptionist' | 'accountant';
  specialties: string[];
  services: Types.ObjectId[];
  weeklySchedule: WeeklyDay[];
  employmentType: 'full_time' | 'part_time' | 'contract';
  salary?: number;
  commissionPercent?: number;
  isActive: boolean;
  joiningDate?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const breakSchema = new Schema<ShiftBreak>(
  { start: { type: String, required: true }, end: { type: String, required: true } },
  { _id: false }
);

const weeklyDaySchema = new Schema<WeeklyDay>(
  {
    day: { type: Number, required: true, min: 0, max: 6 },
    isWorking: { type: Boolean, default: true },
    start: { type: String, default: '10:00' },
    end: { type: String, default: '20:00' },
    breaks: { type: [breakSchema], default: [] },
  },
  { _id: false }
);

const staffProfileSchema = new Schema<StaffProfileDoc>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    phone: { type: String, required: true, trim: true },
    photoUrl: { type: String, default: '' },
    role: { type: String, enum: ['barber', 'manager', 'receptionist', 'accountant'], default: 'barber', index: true },
    specialties: { type: [String], default: [] },
    services: { type: [Schema.Types.ObjectId], ref: 'Service', default: [] },
    weeklySchedule: { type: [weeklyDaySchema], default: [] },
    employmentType: { type: String, enum: ['full_time', 'part_time', 'contract'], default: 'full_time' },
    salary: { type: Number, min: 0 },
    commissionPercent: { type: Number, min: 0, max: 100, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    joiningDate: Date,
    notes: String,
  },
  { timestamps: true }
);

staffProfileSchema.index({ isActive: 1, role: 1 });

export const StaffProfile = model<StaffProfileDoc>('StaffProfile', staffProfileSchema);
