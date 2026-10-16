import mongoose, { FilterQuery, Types } from 'mongoose';
import { CustomerProfile, CustomerProfileDoc } from '../models/CustomerProfile';
import { Appointment } from '../models/Appointment';
import { Invoice } from '../models/Invoice';
import { Membership } from '../models/Membership';
import { errors } from '../utils/errors';
import { Pagination, buildListResponse, searchRegex } from '../utils/pagination';
import { addDays, endOfLocalDay, localDateKey, localTimeHHMM, startOfLocalDay } from '../utils/time';

const VIP_SPEND = 5000;
const VIP_VISITS = 10;
const REGULAR_VISITS = 3;

export interface CustomerListQuery {
  search?: string;
  tag?: string;
  staffId?: string;
  from?: string;
  to?: string;
}

export interface CustomerCreateInput {
  name: string;
  email: string;
  phone: string;
  gender?: 'male' | 'female' | 'other';
  birthday?: string;
  tags?: string[];
  notes?: string;
  marketingOptIn?: boolean;
}

export interface CustomerUpdateInput {
  name?: string;
  phone?: string;
  gender?: 'male' | 'female' | 'other';
  birthday?: string;
  tags?: string[];
  notes?: string;
  marketingOptIn?: boolean;
  preferredStaff?: string;
}

function assertObjectId(id: string, message = 'Customer not found'): Types.ObjectId {
  if (!mongoose.isValidObjectId(id)) throw errors.notFound(message);
  return new Types.ObjectId(id);
}

/** CRM directory with computed upcoming-appointment counts. */
export async function listCustomers(
  query: CustomerListQuery,
  pagination: Pagination,
  viewerRole?: string
) {
  const filter: FilterQuery<CustomerProfileDoc> = {};
  if (query.search) {
    const rx = searchRegex(query.search);
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }
  if (query.tag) filter.tags = query.tag;
  if (query.staffId) filter.preferredStaff = new Types.ObjectId(query.staffId);
  if (query.from || query.to) {
    filter.lastVisitAt = {
      ...(query.from ? { $gte: startOfLocalDay(query.from) } : {}),
      ...(query.to ? { $lte: endOfLocalDay(query.to) } : {}),
    };
  }

  const [profiles, total] = await Promise.all([
    CustomerProfile.find(filter)
      .sort(pagination.sort)
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    CustomerProfile.countDocuments(filter),
  ]);

  let data = profiles as unknown as Array<Record<string, unknown>>;

  if (viewerRole === 'accountant') {
    data = data.map((profile) => {
      const clone = { ...profile };
      delete clone.notes;
      return clone;
    });
  }

  if (profiles.length) {
    const ids = profiles.map((p) => p._id);
    const counts = await Appointment.aggregate<{ _id: Types.ObjectId; count: number }>([
      {
        $match: {
          customer: { $in: ids },
          status: { $in: ['pending', 'confirmed'] },
          startsAt: { $gte: new Date() },
        },
      },
      { $group: { _id: '$customer', count: { $sum: 1 } } },
    ]);
    const byCustomer = new Map(counts.map((c) => [String(c._id), c.count]));
    data = data.map((profile) => ({
      ...profile,
      upcomingAppointments: byCustomer.get(String(profile._id)) ?? 0,
    }));
  }

  return buildListResponse(data, total, pagination);
}

/** Creates an admin-sourced profile; returns the existing one on exact email match. */
export async function createCustomer(
  input: CustomerCreateInput
): Promise<{ profile: Record<string, unknown>; existing: boolean }> {
  const existing = await CustomerProfile.findOne({ email: input.email.toLowerCase() }).lean();
  if (existing) {
    return { profile: existing as unknown as Record<string, unknown>, existing: true };
  }

  const created = await CustomerProfile.create({
    name: input.name,
    email: input.email.toLowerCase(),
    phone: input.phone,
    gender: input.gender,
    birthday: input.birthday,
    tags: input.tags ?? [],
    notes: input.notes ?? '',
    marketingOptIn: input.marketingOptIn ?? true,
    source: 'admin',
  });

  return { profile: created.toObject() as unknown as Record<string, unknown>, existing: false };
}

export async function getCustomer(customerId: string, canSeeNotes: boolean) {
  const oid = assertObjectId(customerId);
  const profile = await CustomerProfile.findById(oid).lean();
  if (!profile) throw errors.notFound('Customer not found');

  const data = profile as unknown as Record<string, unknown>;
  if (!canSeeNotes) delete data.notes;
  return data;
}

export async function updateCustomer(
  customerId: string,
  patch: CustomerUpdateInput,
  options: { isSelf?: boolean } = {}
): Promise<{ before: Record<string, unknown>; after: CustomerProfileDoc }> {
  const oid = assertObjectId(customerId);
  const profile = await CustomerProfile.findById(oid);
  if (!profile) throw errors.notFound('Customer not found');

  if (options.isSelf) {
    const allowed: Array<keyof CustomerUpdateInput> = ['name', 'phone', 'gender', 'birthday', 'marketingOptIn'];
    const filtered: CustomerUpdateInput = {};
    for (const key of allowed) {
      if (patch[key] !== undefined) (filtered as Record<string, unknown>)[key as string] = patch[key];
    }
    patch = filtered;
  }

  const before = profile.toObject() as unknown as Record<string, unknown>;

  if (patch.name !== undefined) profile.name = patch.name;
  if (patch.phone !== undefined) profile.phone = patch.phone;
  if (patch.gender !== undefined) profile.gender = patch.gender;
  if (patch.birthday !== undefined) profile.birthday = patch.birthday;
  if (patch.tags !== undefined) profile.tags = patch.tags;
  if (patch.notes !== undefined) profile.notes = patch.notes;
  if (patch.marketingOptIn !== undefined) profile.marketingOptIn = patch.marketingOptIn;
  if (patch.preferredStaff !== undefined) profile.preferredStaff = new Types.ObjectId(patch.preferredStaff);

  await profile.save();
  return { before, after: profile };
}

/** Replaces notes, or appends a timestamped line when `append` is true. */
export async function writeNotes(customerId: string, notes: string, append?: boolean): Promise<CustomerProfileDoc> {
  const oid = assertObjectId(customerId);
  const profile = await CustomerProfile.findById(oid);
  if (!profile) throw errors.notFound('Customer not found');

  if (append) {
    const line = `[${localDateKey()} ${localTimeHHMM()}] ${notes}`.trim();
    profile.notes = profile.notes ? `${profile.notes}\n${line}` : line;
  } else {
    profile.notes = notes;
  }
  await profile.save();
  return profile;
}

export async function listBookings(customerId: string, pagination: Pagination) {
  const oid = assertObjectId(customerId);
  const filter = { customer: oid };
  const [items, total] = await Promise.all([
    Appointment.find(filter)
      .sort({ startsAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .select('reference serviceSnapshot date startsAt status paymentStatus totalPrice staff')
      .populate('staff', 'name photoUrl')
      .lean(),
    Appointment.countDocuments(filter),
  ]);
  return buildListResponse(items, total, pagination);
}

export async function listInvoices(customerId: string, pagination: Pagination) {
  const oid = assertObjectId(customerId);
  const filter = { customer: oid };
  const [items, total] = await Promise.all([
    Invoice.find(filter)
      .sort(pagination.sort)
      .skip(pagination.skip)
      .limit(pagination.limit)
      .select('-createdBy -__v')
      .lean(),
    Invoice.countDocuments(filter),
  ]);
  return buildListResponse(items, total, pagination);
}

export async function getSummary(customerId: string, canSeeNotes: boolean) {
  const oid = assertObjectId(customerId);

  const [profile, favourite, recentAppointments, memberships] = await Promise.all([
    CustomerProfile.findById(oid).populate('preferredStaff', 'name photoUrl').lean(),
    Appointment.aggregate<{ _id: string; count: number }>([
      { $match: { customer: oid, status: 'completed' } },
      { $group: { _id: '$serviceSnapshot.name', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1 },
    ]),
    Appointment.find({ customer: oid })
      .sort({ startsAt: -1 })
      .limit(5)
      .select('reference serviceSnapshot date startsAt status paymentStatus totalPrice staff')
      .populate('staff', 'name')
      .lean(),
    Membership.find({ customer: oid, status: 'active' })
      .select('name type code validFrom validUntil credits includes status')
      .lean(),
  ]);

  if (!profile) throw errors.notFound('Customer not found');

  const profileData = profile as unknown as Record<string, unknown>;
  if (!canSeeNotes) delete profileData.notes;

  return {
    profile: profileData,
    stats: {
      totalVisits: profile.totalVisits,
      totalSpent: profile.totalSpent,
      noShowCount: profile.noShowCount,
      lastVisitAt: profile.lastVisitAt ?? null,
      favouriteService: favourite[0]?._id ?? null,
      preferredStaff: profile.preferredStaff ?? null,
    },
    recentAppointments,
    memberships,
  };
}

function csvCell(value: unknown): string {
  const str = value == null ? '' : String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/** Full booking history as CSV for owner/manager export. */
export async function exportBookingsCsv(
  customerId: string
): Promise<{ filename: string; csv: string }> {
  const oid = assertObjectId(customerId);
  const profile = await CustomerProfile.findById(oid).select('name email phone').lean();
  if (!profile) throw errors.notFound('Customer not found');

  const appointments = await Appointment.find({ customer: oid })
    .sort({ startsAt: 1 })
    .select('reference date startsAt serviceSnapshot status paymentStatus totalPrice staff')
    .populate('staff', 'name')
    .lean();

  const header = ['Reference', 'Date', 'Time', 'Service', 'Staff', 'Status', 'Payment status', 'Total'];
  const lines = [header.join(',')];
  for (const appt of appointments) {
    const staffName = (appt.staff as unknown as { name?: string } | null)?.name ?? '';
    lines.push(
      [
        appt.reference,
        appt.date,
        appt.startsAt ? localTimeHHMM(appt.startsAt) : '',
        appt.serviceSnapshot?.name ?? '',
        staffName,
        appt.status,
        appt.paymentStatus,
        appt.totalPrice,
      ]
        .map(csvCell)
        .join(',')
    );
  }

  const safeName = profile.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'customer';
  return { filename: `customer-${safeName}-bookings.csv`, csv: lines.join('\r\n') };
}

export async function getSegments() {
  const today = localDateKey();
  const createdFrom = startOfLocalDay(addDays(today, -30));
  const inactiveFrom = startOfLocalDay(addDays(today, -90));

  const vipFilter: FilterQuery<CustomerProfileDoc> = {
    $or: [{ totalSpent: { $gte: VIP_SPEND } }, { totalVisits: { $gte: VIP_VISITS } }],
  };
  const regularFilter: FilterQuery<CustomerProfileDoc> = { totalVisits: { $gte: REGULAR_VISITS } };
  const newFilter: FilterQuery<CustomerProfileDoc> = { createdAt: { $gte: createdFrom } };
  const inactiveFilter: FilterQuery<CustomerProfileDoc> = {
    $or: [
      { lastVisitAt: { $lt: inactiveFrom } },
      { lastVisitAt: null },
      { lastVisitAt: { $exists: false }, createdAt: { $lt: inactiveFrom } },
    ],
  };

  const projection = 'name email phone totalVisits totalSpent lastVisitAt createdAt';

  async function build(filter: FilterQuery<CustomerProfileDoc>) {
    const [count, sample] = await Promise.all([
      CustomerProfile.countDocuments(filter),
      CustomerProfile.find(filter).sort({ totalSpent: -1 }).limit(5).select(projection).lean(),
    ]);
    return { count, sample };
  }

  const [vip, regular, newCustomers, inactive] = await Promise.all([
    build(vipFilter),
    build(regularFilter),
    build(newFilter),
    build(inactiveFilter),
  ]);

  return { vip, regular, new: newCustomers, inactive };
}
