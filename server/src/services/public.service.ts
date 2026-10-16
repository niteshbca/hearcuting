import { FilterQuery, Types } from 'mongoose';
import { Service, ServiceDoc } from '../models/Service';
import { StaffProfile } from '../models/StaffProfile';
import { Review } from '../models/Salon';
import { MembershipPlan } from '../models/Membership';
import { getSettings, toPublicSettings, PublicSettings } from './settings.service';
import { searchRegex } from '../utils/pagination';

export interface PublicServiceQuery {
  search?: string;
  category?: string;
}

export interface PublicStaffItem {
  _id: Types.ObjectId;
  name: string;
  photoUrl?: string;
  specialties: string[];
  services: { _id: Types.ObjectId; name: string; category?: string }[];
  joiningDate?: Date;
}

export async function getPublicSettings(): Promise<PublicSettings> {
  const settings = await getSettings();
  return toPublicSettings(settings);
}

/** Active services for the public site, ordered by sortOrder then price. */
export async function listPublicServices(query: PublicServiceQuery) {
  const filter: FilterQuery<ServiceDoc> = { isActive: true };
  if (query.search) filter.name = searchRegex(query.search);
  if (query.category) filter.category = query.category;
  return Service.find(filter)
    .sort({ sortOrder: 1, price: 1 })
    .lean();
}

/**
 * Active barbers with a curated projection (never salary/commission/email/phone).
 * Falls back to every active staff member when there are no active barbers.
 */
export async function listPublicStaff(): Promise<PublicStaffItem[]> {
  const projection = 'name photoUrl specialties services joiningDate';
  const base = { isActive: true };

  const barbers = await StaffProfile.find({ ...base, role: 'barber' })
    .select(projection)
    .populate('services', 'name category')
    .sort({ name: 1 })
    .lean();

  const source = barbers.length
    ? barbers
    : await StaffProfile.find(base)
        .select(projection)
        .populate('services', 'name category')
        .sort({ name: 1 })
        .lean();

  return source as unknown as PublicStaffItem[];
}

/** Latest published reviews for the homepage / public gallery. */
export async function listPublicReviews(limit = 50) {
  const clamp = Math.min(100, Math.max(1, Number(limit) || 50));
  return Review.find({ isPublished: true })
    .sort({ createdAt: -1 })
    .limit(clamp)
    .lean();
}

/** Active membership plans for the public pricing page. */
export async function listPublicPlans() {
  return MembershipPlan.find({ isActive: true })
    .sort({ sortWeight: 1 })
    .lean();
}
