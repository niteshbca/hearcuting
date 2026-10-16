import { Schema, model, Types, Document } from 'mongoose';

export interface CustomerProfileDoc extends Document {
  _id: Types.ObjectId;
  user?: Types.ObjectId;
  name: string;
  email: string;
  phone: string;
  gender?: 'male' | 'female' | 'other';
  birthday?: string;
  notes?: string;
  notesVisibility?: 'owner' | 'owner_manager';
  tags: string[];
  preferredStaff?: Types.ObjectId;
  totalVisits: number;
  totalSpent: number;
  noShowCount: number;
  lastVisitAt?: Date;
  isActive: boolean;
  marketingOptIn: boolean;
  source: 'website' | 'walk_in' | 'phone' | 'admin';
  createdAt: Date;
  updatedAt: Date;
}

const customerProfileSchema = new Schema<CustomerProfileDoc>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    phone: { type: String, required: true, trim: true, index: true },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    birthday: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    notes: { type: String, default: '' },
    notesVisibility: { type: String, enum: ['owner', 'owner_manager'], default: 'owner_manager' },
    tags: { type: [String], default: [] },
    preferredStaff: { type: Schema.Types.ObjectId, ref: 'StaffProfile' },
    totalVisits: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    noShowCount: { type: Number, default: 0 },
    lastVisitAt: Date,
    isActive: { type: Boolean, default: true },
    marketingOptIn: { type: Boolean, default: true },
    source: { type: String, enum: ['website', 'walk_in', 'phone', 'admin'], default: 'website' },
  },
  { timestamps: true }
);

customerProfileSchema.index({ user: 1 }, { unique: true, partialFilterExpression: { user: { $exists: true } } });
customerProfileSchema.index({ name: 'text', email: 'text', phone: 'text' });

export const CustomerProfile = model<CustomerProfileDoc>('CustomerProfile', customerProfileSchema);
