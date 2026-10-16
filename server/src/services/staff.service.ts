import { randomBytes } from 'crypto';
import mongoose, { FilterQuery, Types } from 'mongoose';
import { User } from '../models/User';
import { StaffProfile, StaffProfileDoc, WeeklyDay } from '../models/StaffProfile';
import { StaffLeave, StaffLeaveDoc } from '../models/Schedule';
import { Service } from '../models/Service';
import { Appointment } from '../models/Appointment';
import { Invoice } from '../models/Invoice';
import { errors } from '../utils/errors';
import { Pagination, buildListResponse, searchRegex } from '../utils/pagination';
import { round2 } from '../utils/money';
import { addDays, endOfLocalDay, localDateKey, startOfLocalDay } from '../utils/time';
import { env } from '../config/env';
import { hashPassword } from './auth.service';
import { getSettings } from './settings.service';
import { enqueueEmail } from './mail.service';
import { createNotification } from './notification.service';
import { baseEmailLayout, escapeHtml, salonFooter } from '../templates/email';

const COMP_VIEW_ROLES = ['owner', 'manager'];

export interface StaffListQuery {
  search?: string;
  role?: string;
  isActive?: boolean;
  viewerRole?: string;
}

export interface StaffCreateInput {
  name: string;
  email: string;
  phone: string;
  role: string;
  specialties?: string[];
  services?: string[];
  weeklySchedule?: WeeklyDay[];
  employmentType?: string;
  salary?: number;
  commissionPercent?: number;
  photoUrl?: string;
}

export interface StaffUpdateInput {
  name?: string;
  phone?: string;
  specialties?: string[];
  services?: string[];
  weeklySchedule?: WeeklyDay[];
  employmentType?: string;
  salary?: number;
  commissionPercent?: number;
  photoUrl?: string;
  isActive?: boolean;
}

export type LeaveStatus = 'pending' | 'approved' | 'rejected';

function generateTempPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  let out = '';
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}

async function resolveServiceIds(ids: string[]): Promise<Types.ObjectId[]> {
  if (!ids?.length) return [];
  const unique = [...new Set(ids)].map((id) => new Types.ObjectId(id));
  const count = await Service.countDocuments({ _id: { $in: unique } });
  if (count !== unique.length) throw errors.badRequest('One or more services were not found');
  return unique;
}

/**
 * Staff directory. Salary/commission are only exposed to owner & manager
 * (masked to undefined for every other viewer).
 */
export async function listStaff(query: StaffListQuery, pagination: Pagination) {
  const canSeeComp = COMP_VIEW_ROLES.includes(query.viewerRole ?? '');

  const filter: FilterQuery<StaffProfileDoc> = {};
  if (query.search) {
    const rx = searchRegex(query.search);
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }
  if (query.role) filter.role = query.role as StaffProfileDoc['role'];
  if (query.isActive !== undefined) filter.isActive = query.isActive;

  const [profiles, total] = await Promise.all([
    StaffProfile.find(filter)
      .sort(pagination.sort)
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate({ path: 'user', select: 'name email role isActive' })
      .populate('services', 'name category price')
      .lean(),
    StaffProfile.countDocuments(filter),
  ]);

  const data = profiles.map((profile) => {
    const obj = profile as unknown as Record<string, unknown>;
    if (!canSeeComp) {
      delete obj.salary;
      delete obj.commissionPercent;
    }
    return obj;
  });

  return buildListResponse(data, total, pagination);
}

async function queueStaffInvite(profile: StaffProfileDoc, invitePassword: string): Promise<void> {
  const settings = await getSettings();
  const origin = env().CLIENT_ORIGINS.split(',')[0]?.trim() || '';
  const loginUrl = `${origin}/admin/login`;
  const footer = salonFooter(settings);
  const roleLabel = profile.role.charAt(0).toUpperCase() + profile.role.slice(1);

  const html = baseEmailLayout({
    preheader: 'Your staff account is ready',
    heading: 'Welcome to the team!',
    intro: `Hi ${escapeHtml(profile.name)}, a ${escapeHtml(roleLabel)} account has been created for you at ${escapeHtml(
      footer.salonName
    )}.`,
    bodyHtml: `<p style="font-size:14px;line-height:1.6;color:#444;">Sign in with your email <strong>${escapeHtml(
      profile.email
    )}</strong> and this one-time temporary password:</p>
      <p style="font-size:18px;font-weight:700;letter-spacing:1px;color:#0B0B0C;background:#FAF7F2;border:1px solid #ECE7DC;border-radius:8px;padding:12px 16px;display:inline-block;">${escapeHtml(
        invitePassword
      )}</p>
      <p style="font-size:13px;color:#8a8a8a;">Please change your password after your first sign-in.</p>`,
    ctaText: 'Sign in to the staff panel',
    ctaUrl: loginUrl,
    footerNote: 'Keep this password private. If you were not expecting this email, contact the salon owner.',
    ...footer,
  });

  await enqueueEmail({
    to: profile.email,
    toName: profile.name,
    subject: `Your ${footer.salonName} staff account`,
    html,
    text: `Welcome ${profile.name}. Sign in at ${loginUrl} with ${profile.email} and temporary password ${invitePassword}. Change it after your first sign-in.`,
    template: 'staff_invite',
    relatedType: 'StaffProfile',
    relatedId: String(profile._id),
    dedupeKey: `staff_invite:${String(profile._id)}`,
  });
}

export async function createStaff(input: StaffCreateInput) {
  const email = input.email.toLowerCase().trim();
  const [existingUser, existingProfile] = await Promise.all([
    User.findOne({ email }).select('_id').lean(),
    StaffProfile.findOne({ email }).select('_id').lean(),
  ]);
  if (existingUser || existingProfile) {
    throw errors.conflict('A staff account with this email already exists');
  }

  const services = input.services?.length ? await resolveServiceIds(input.services) : [];
  const invitePassword = generateTempPassword();

  const user = await User.create({
    email,
    name: input.name.trim(),
    phone: input.phone.trim(),
    role: input.role,
    passwordHash: await hashPassword(invitePassword),
    isActive: true,
  });

  const profile = await StaffProfile.create({
    user: user._id,
    name: input.name.trim(),
    email,
    phone: input.phone.trim(),
    role: input.role,
    specialties: input.specialties ?? [],
    services,
    weeklySchedule: input.weeklySchedule ?? [],
    employmentType: input.employmentType ?? 'full_time',
    salary: input.salary,
    commissionPercent: input.commissionPercent ?? 0,
    photoUrl: input.photoUrl ?? '',
    isActive: true,
  });

  user.staff = profile._id;
  await user.save();

  await queueStaffInvite(profile, invitePassword);

  return { profile, invitePassword };
}

export async function getMyProfile(userId: string) {
  const profile = await StaffProfile.findOne({ user: userId })
    .populate({ path: 'user', select: 'name email role phone avatarUrl' })
    .populate('services', 'name category price')
    .lean();
  if (!profile) throw errors.notFound('Staff profile not found');
  return profile;
}

export async function getStaffById(id: string) {
  if (!mongoose.isValidObjectId(id)) throw errors.notFound('Staff member not found');
  const profile = await StaffProfile.findById(id)
    .populate({ path: 'user', select: 'name email role phone isActive' })
    .populate('services', 'name category price')
    .lean();
  if (!profile) throw errors.notFound('Staff member not found');
  return profile;
}

export async function updateStaff(
  id: string,
  patch: StaffUpdateInput,
  options: { isSelf?: boolean } = {}
): Promise<{ before: Record<string, unknown>; after: StaffProfileDoc }> {
  if (!mongoose.isValidObjectId(id)) throw errors.notFound('Staff member not found');
  const profile = await StaffProfile.findById(id);
  if (!profile) throw errors.notFound('Staff member not found');

  if (options.isSelf) {
    const allowed: Array<keyof StaffUpdateInput> = ['phone', 'photoUrl', 'specialties'];
    const filtered: StaffUpdateInput = {};
    for (const key of allowed) {
      if (patch[key] !== undefined) (filtered as Record<string, unknown>)[key as string] = patch[key];
    }
    patch = filtered;
  }

  const before = profile.toObject() as unknown as Record<string, unknown>;

  if (patch.services !== undefined) profile.services = await resolveServiceIds(patch.services);
  if (patch.name !== undefined) profile.name = patch.name;
  if (patch.phone !== undefined) profile.phone = patch.phone;
  if (patch.specialties !== undefined) profile.specialties = patch.specialties;
  if (patch.weeklySchedule !== undefined) profile.weeklySchedule = patch.weeklySchedule;
  if (patch.employmentType !== undefined) {
    profile.employmentType = patch.employmentType as StaffProfileDoc['employmentType'];
  }
  if (patch.salary !== undefined) profile.salary = patch.salary;
  if (patch.commissionPercent !== undefined) profile.commissionPercent = patch.commissionPercent;
  if (patch.photoUrl !== undefined) profile.photoUrl = patch.photoUrl;
  if (patch.isActive !== undefined) profile.isActive = patch.isActive;

  await profile.save();

  if (profile.user) {
    await User.updateOne({ _id: profile.user }, { $set: { name: profile.name, phone: profile.phone } });
  }

  return { before, after: profile };
}

export async function updateSchedule(
  id: string,
  weeklySchedule: WeeklyDay[]
): Promise<{ before: Record<string, unknown>; after: StaffProfileDoc }> {
  if (!mongoose.isValidObjectId(id)) throw errors.notFound('Staff member not found');
  const profile = await StaffProfile.findById(id);
  if (!profile) throw errors.notFound('Staff member not found');

  const before = profile.toObject() as unknown as Record<string, unknown>;
  profile.weeklySchedule = weeklySchedule;
  await profile.save();
  return { before, after: profile };
}

export async function setStatus(
  id: string,
  isActive: boolean
): Promise<{ before: Record<string, unknown>; after: StaffProfileDoc }> {
  if (!mongoose.isValidObjectId(id)) throw errors.notFound('Staff member not found');
  const profile = await StaffProfile.findById(id);
  if (!profile) throw errors.notFound('Staff member not found');

  if (!isActive && profile.user) {
    const user = await User.findById(profile.user).select('role').lean();
    if (user?.role === 'owner') {
      throw errors.forbidden('The salon owner account cannot be deactivated');
    }
  }

  const before = profile.toObject() as unknown as Record<string, unknown>;
  profile.isActive = isActive;
  await profile.save();

  if (profile.user) {
    const user = await User.findById(profile.user);
    if (user) {
      user.isActive = isActive;
      if (!isActive) {
        for (const session of user.sessions) {
          if (!session.revokedAt) session.revokedAt = new Date();
        }
      }
      await user.save();
    }
  }

  return { before, after: profile };
}

export async function listLeaves(
  query: { status?: string; staffId?: string; from?: string; to?: string },
  pagination: Pagination
) {
  const filter: FilterQuery<StaffLeaveDoc> = {};
  if (query.status) filter.status = query.status;
  if (query.staffId) filter.staff = new Types.ObjectId(query.staffId);
  if (query.from || query.to) {
    filter.startDate = { ...(query.to ? { $lte: query.to } : {}) };
    filter.endDate = { ...(query.from ? { $gte: query.from } : {}) };
  }

  const [items, total] = await Promise.all([
    StaffLeave.find(filter)
      .sort(pagination.sort)
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate('staff', 'name role photoUrl')
      .lean(),
    StaffLeave.countDocuments(filter),
  ]);

  return buildListResponse(items, total, pagination);
}

export async function createLeave(
  staffId: string | undefined,
  input: { startDate: string; endDate: string; type: string; reason?: string },
  actorRole: string
) {
  if (!staffId) throw errors.badRequest('No staff profile is linked to your account');

  const overlap = await StaffLeave.exists({
    staff: staffId,
    status: 'approved',
    startDate: { $lte: input.endDate },
    endDate: { $gte: input.startDate },
  });
  if (overlap) throw errors.conflict('You already have approved leave during this period');

  const status: LeaveStatus = actorRole === 'owner' || actorRole === 'manager' ? 'approved' : 'pending';

  return StaffLeave.create({
    staff: new Types.ObjectId(staffId),
    startDate: input.startDate,
    endDate: input.endDate,
    type: input.type,
    reason: input.reason ?? '',
    status,
  });
}

export async function reviewLeave(
  id: string,
  input: { status: 'approved' | 'rejected'; reviewNote?: string },
  actorId?: string
) {
  if (!mongoose.isValidObjectId(id)) throw errors.notFound('Leave request not found');
  const leave = await StaffLeave.findById(id);
  if (!leave) throw errors.notFound('Leave request not found');
  if (leave.status !== 'pending') throw errors.conflict('This leave request has already been reviewed');

  leave.status = input.status;
  if (input.reviewNote !== undefined) leave.reviewNote = input.reviewNote;
  if (actorId && mongoose.isValidObjectId(actorId)) leave.reviewedBy = new Types.ObjectId(actorId);
  await leave.save();

  const profile = await StaffProfile.findById(leave.staff).select('user name').lean();
  if (profile?.user) {
    await createNotification({
      user: String(profile.user),
      type: 'leave_reviewed',
      title: `Leave request ${input.status}`,
      body: `${leave.startDate} → ${leave.endDate}`,
      data: { leaveId: String(leave._id), status: input.status },
    });
  }

  return leave;
}

export async function getPerformance(staffId: string, query: { from?: string; to?: string }) {
  if (!mongoose.isValidObjectId(staffId)) throw errors.notFound('Staff member not found');
  const staff = await StaffProfile.findById(staffId).select('name commissionPercent').lean();
  if (!staff) throw errors.notFound('Staff member not found');

  const todayKey = localDateKey();
  const fromKey = query.from ?? addDays(todayKey, -30);
  const toKey = query.to ?? todayKey;
  const from = startOfLocalDay(fromKey);
  const to = endOfLocalDay(toKey);
  const oid = new Types.ObjectId(staffId);

  const [invoiceAgg] = await Invoice.aggregate<{ revenue: number; completedServices: number }>([
    { $match: { issuedAt: { $gte: from, $lte: to } } },
    { $unwind: '$items' },
    { $match: { 'items.staff': oid } },
    {
      $group: {
        _id: null,
        revenue: { $sum: '$items.total' },
        completedServices: { $sum: { $cond: [{ $eq: ['$items.type', 'service'] }, 1, 0] } },
      },
    },
  ]);

  const revenue = round2(invoiceAgg?.revenue ?? 0);
  const completedServices = invoiceAgg?.completedServices ?? 0;
  const commission = round2((revenue * (staff.commissionPercent ?? 0)) / 100);

  const statusCounts = await Appointment.aggregate<{ _id: string; count: number }>([
    { $match: { staff: oid, startsAt: { $gte: from, $lte: to } } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const byStatus = new Map(statusCounts.map((s) => [s._id, s.count]));

  const upcoming = await Appointment.countDocuments({
    staff: oid,
    status: { $in: ['pending', 'confirmed'] },
    startsAt: { $gte: new Date() },
  });

  return {
    staffId,
    period: { from: fromKey, to: toKey },
    completedServices,
    revenue,
    commission,
    appointments: {
      completed: byStatus.get('completed') ?? 0,
      cancelled: byStatus.get('cancelled') ?? 0,
      noShow: byStatus.get('no_show') ?? 0,
      upcoming,
    },
  };
}
