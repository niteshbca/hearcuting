import { Schema, model, Types, Document } from 'mongoose';

export interface ServiceDoc extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  category: string;
  description: string;
  imageUrls: string[];
  price: number;
  discountPrice?: number;
  durationMinutes: number;
  bufferMinutes: number;
  isActive: boolean;
  staff: Types.ObjectId[];
  bookingRules: {
    minNoticeHours: number;
    maxAdvanceDays: number;
    allowGuest: boolean;
    requireApproval: boolean;
    onlinePaymentAllowed: boolean;
  };
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export const SERVICE_CATEGORIES = [
  'Haircut',
  'Beard',
  'Hair Care',
  'Facial',
  'Coloring',
  'Styling',
  'Spa',
  'Other',
] as const;

const serviceSchema = new Schema<ServiceDoc>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, index: true },
    category: { type: String, required: true, enum: SERVICE_CATEGORIES, index: true },
    description: { type: String, default: '' },
    imageUrls: { type: [String], default: [] },
    price: { type: Number, required: true, min: 0 },
    discountPrice: { type: Number, min: 0 },
    durationMinutes: { type: Number, required: true, min: 5, max: 480 },
    bufferMinutes: { type: Number, default: 0, min: 0, max: 120 },
    isActive: { type: Boolean, default: true, index: true },
    staff: { type: [Schema.Types.ObjectId], ref: 'StaffProfile', default: [] },
    bookingRules: {
      minNoticeHours: { type: Number, default: 2 },
      maxAdvanceDays: { type: Number, default: 60 },
      allowGuest: { type: Boolean, default: true },
      requireApproval: { type: Boolean, default: false },
      onlinePaymentAllowed: { type: Boolean, default: true },
    },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

serviceSchema.index({ isActive: 1, category: 1 });

export function serviceEffectivePrice(service: { price: number; discountPrice?: number | null }): number {
  return service.discountPrice != null && service.discountPrice > 0 && service.discountPrice < service.price
    ? service.discountPrice
    : service.price;
}

export const Service = model<ServiceDoc>('Service', serviceSchema);
