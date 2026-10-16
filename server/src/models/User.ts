import { Schema, model, Types, Document } from 'mongoose';
import { Role } from '../utils/permissions';

export interface SessionDoc {
  jti: string;
  refreshTokenHash: string;
  userAgent?: string;
  ip?: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
}

export interface UserDoc extends Document {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  phone?: string;
  role: Role;
  isActive: boolean;
  isEmailVerified: boolean;
  avatarUrl?: string;
  customer?: Types.ObjectId;
  staff?: Types.ObjectId;
  sessions: SessionDoc[];
  passwordReset?: { tokenHash: string; expiresAt: Date; usedAt?: Date };
  failedLoginAttempts: number;
  lockedUntil?: Date;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const sessionSchema = new Schema<SessionDoc>(
  {
    jti: { type: String, required: true },
    refreshTokenHash: { type: String, required: true },
    userAgent: String,
    ip: String,
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
  },
  { _id: false }
);

const userSchema = new Schema<UserDoc>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    role: {
      type: String,
      enum: ['owner', 'manager', 'receptionist', 'barber', 'accountant', 'customer'],
      default: 'customer',
      index: true,
    },
    isActive: { type: Boolean, default: true },
    isEmailVerified: { type: Boolean, default: false },
    avatarUrl: String,
    customer: { type: Schema.Types.ObjectId, ref: 'CustomerProfile' },
    staff: { type: Schema.Types.ObjectId, ref: 'StaffProfile' },
    sessions: { type: [sessionSchema], default: [] },
    passwordReset: {
      tokenHash: String,
      expiresAt: Date,
      usedAt: Date,
    },
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: Date,
    lastLoginAt: Date,
  },
  { timestamps: true }
);

userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ 'sessions.jti': 1 });

export const User = model<UserDoc>('User', userSchema);
