import mongoose, { FilterQuery, Types } from 'mongoose';
import { Service, ServiceDoc } from '../models/Service';
import { StaffProfile } from '../models/StaffProfile';
import { Appointment, BUSY_STATUSES } from '../models/Appointment';
import { errors } from '../utils/errors';
import { Pagination, buildListResponse, searchRegex } from '../utils/pagination';

export interface ServiceListQuery {
  includeInactive?: boolean;
  search?: string;
  category?: string;
  role?: string;
}

export interface ServiceWriteInput {
  name?: string;
  category?: string;
  description?: string;
  price?: number;
  discountPrice?: number | null;
  durationMinutes?: number;
  bufferMinutes?: number;
  imageUrls?: string[];
  staff?: string[];
  bookingRules?: Partial<ServiceDoc['bookingRules']>;
  isActive?: boolean;
  sortOrder?: number;
  updateSlug?: boolean;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'service';
}

async function uniqueSlug(name: string, excludeId?: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let suffix = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await Service.exists({ slug: candidate, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })) {
    candidate = `${base}-${suffix++}`;
  }
  return candidate;
}

/** Every referenced staff id must resolve to an active barber. */
async function assertActiveBarbers(staffIds?: string[]): Promise<Types.ObjectId[]> {
  if (!staffIds?.length) return [];
  const ids = [...new Set(staffIds)].map((id) => new Types.ObjectId(id));
  const found = await StaffProfile.find({ _id: { $in: ids }, role: 'barber', isActive: true })
    .select('_id')
    .lean();
  if (found.length !== ids.length) {
    throw errors.badRequest('All assigned staff must be active barbers');
  }
  return ids;
}

/**
 * Catalog listing. Staff roles (barber/accountant/receptionist) and customers
 * only ever see active services; owner/manager may request inactive ones with
 * `includeInactive=true` and get upcoming-appointment counts attached.
 */
export async function listServices(query: ServiceListQuery, pagination: Pagination) {
  const canSeeInactive =
    (query.role === 'owner' || query.role === 'manager') && query.includeInactive === true;

  const filter: FilterQuery<ServiceDoc> = {};
  if (!canSeeInactive) filter.isActive = true;
  if (query.search) filter.name = searchRegex(query.search);
  if (query.category) filter.category = query.category;

  const [items, total] = await Promise.all([
    Service.find(filter)
      .sort({ sortOrder: 1, price: 1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    Service.countDocuments(filter),
  ]);

  let data: Array<Record<string, unknown>> = items as unknown as Array<Record<string, unknown>>;

  if (canSeeInactive && items.length) {
    const ids = items.map((s) => s._id);
    const counts = await Appointment.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { service: { $in: ids }, status: { $in: BUSY_STATUSES }, startsAt: { $gte: new Date() } } },
      { $group: { _id: '$service', count: { $sum: 1 } } },
    ]);
    const byService = new Map(counts.map((c) => [String(c._id), c.count]));
    data = items.map((s) => ({
      ...(s as unknown as Record<string, unknown>),
      upcomingAppointments: byService.get(String(s._id)) ?? 0,
    }));
  }

  return buildListResponse(data, total, pagination);
}

export async function createService(input: ServiceWriteInput): Promise<ServiceDoc> {
  const staffIds = await assertActiveBarbers(input.staff);
  const slug = await uniqueSlug(input.name ?? 'service');

  const [created] = await Service.create([
    {
      name: input.name,
      slug,
      category: input.category,
      description: input.description ?? '',
      imageUrls: input.imageUrls ?? [],
      price: input.price,
      discountPrice: input.discountPrice ?? undefined,
      durationMinutes: input.durationMinutes,
      bufferMinutes: input.bufferMinutes ?? 0,
      staff: staffIds,
      bookingRules: {
        minNoticeHours: input.bookingRules?.minNoticeHours ?? 2,
        maxAdvanceDays: input.bookingRules?.maxAdvanceDays ?? 60,
        allowGuest: input.bookingRules?.allowGuest ?? true,
        requireApproval: input.bookingRules?.requireApproval ?? false,
        onlinePaymentAllowed: input.bookingRules?.onlinePaymentAllowed ?? true,
      },
      isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? 0,
    },
  ]);
  return created;
}

export async function getService(id: string): Promise<ServiceDoc> {
  if (!mongoose.isValidObjectId(id)) throw errors.notFound('Service not found');
  const service = await Service.findById(id)
    .populate('staff', 'name photoUrl role isActive')
    .lean();
  if (!service) throw errors.notFound('Service not found');
  return service as unknown as ServiceDoc;
}

export async function updateService(
  id: string,
  patch: ServiceWriteInput
): Promise<{ before: Record<string, unknown>; after: ServiceDoc }> {
  if (!mongoose.isValidObjectId(id)) throw errors.notFound('Service not found');
  const service = await Service.findById(id);
  if (!service) throw errors.notFound('Service not found');

  const before = service.toObject() as unknown as Record<string, unknown>;

  const staffIds = patch.staff !== undefined ? await assertActiveBarbers(patch.staff) : undefined;

  const nextPrice = patch.price ?? service.price;
  if (patch.discountPrice != null && patch.discountPrice >= nextPrice) {
    throw errors.badRequest('Discount price must be less than the regular price');
  }

  if (patch.name !== undefined) service.name = patch.name;
  if (patch.category !== undefined) service.category = patch.category as ServiceDoc['category'];
  if (patch.description !== undefined) service.description = patch.description;
  if (patch.imageUrls !== undefined) service.imageUrls = patch.imageUrls;
  if (patch.price !== undefined) service.price = patch.price;
  if (patch.discountPrice !== undefined) service.discountPrice = patch.discountPrice ?? undefined;
  if (patch.durationMinutes !== undefined) service.durationMinutes = patch.durationMinutes;
  if (patch.bufferMinutes !== undefined) service.bufferMinutes = patch.bufferMinutes;
  if (staffIds !== undefined) service.staff = staffIds;
  if (patch.bookingRules !== undefined) {
    service.bookingRules = { ...service.bookingRules, ...patch.bookingRules };
  }
  if (patch.isActive !== undefined) service.isActive = patch.isActive;
  if (patch.sortOrder !== undefined) service.sortOrder = patch.sortOrder;

  // Keep the old slug stable for SEO unless the caller explicitly asks to refresh it.
  if (patch.updateSlug && patch.name && patch.name !== before.name) {
    service.slug = await uniqueSlug(patch.name, id);
  }

  await service.save();
  return { before, after: service };
}

export async function setStatus(
  id: string,
  isActive: boolean
): Promise<{ data: ServiceDoc; warning?: string }> {
  if (!mongoose.isValidObjectId(id)) throw errors.notFound('Service not found');
  const service = await Service.findById(id);
  if (!service) throw errors.notFound('Service not found');

  service.isActive = isActive;
  await service.save();

  if (!isActive) {
    const upcoming = await Appointment.countDocuments({
      service: service._id,
      status: { $in: BUSY_STATUSES },
      startsAt: { $gte: new Date() },
    });
    if (upcoming > 0) {
      return {
        data: service,
        warning: `This service has ${upcoming} upcoming appointment(s). They are not cancelled automatically.`,
      };
    }
  }
  return { data: service };
}
