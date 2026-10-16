import mongoose, { Types } from 'mongoose';
import { Appointment, BUSY_STATUSES } from '../models/Appointment';
import { Service, ServiceDoc } from '../models/Service';
import { StaffProfile, StaffProfileDoc } from '../models/StaffProfile';
import { BusinessHours, StaffAvailability, StaffLeave } from '../models/Schedule';
import { getSettings, ensureBusinessHours } from './settings.service';
import { errors } from '../utils/errors';
import { env } from '../config/env';
import {
  addDays,
  addMinutes,
  isValidDateKey,
  localDateKey,
  localWeekday,
  overlaps,
  timeToMinutes,
  minutesToTime,
  zonedTimeToUTC,
} from '../utils/time';

export interface TimeWindow {
  start: string; // HH:mm
  end: string;
}

interface MinuteWindow {
  start: number;
  end: number;
}

/* ------------------------------------------------------------------ */
/* HH:mm window algebra                                                */
/* ------------------------------------------------------------------ */

function toMinuteWindows(intervals: { start?: string; end?: string }[]): MinuteWindow[] {
  const out: MinuteWindow[] = [];
  for (const iv of intervals) {
    if (!iv?.start || !iv?.end) continue;
    const start = timeToMinutes(iv.start);
    const end = timeToMinutes(iv.end);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) out.push({ start, end });
  }
  return out.sort((a, b) => a.start - b.start);
}

function intersectMinuteWindows(a: MinuteWindow[], b: MinuteWindow[]): MinuteWindow[] {
  const out: MinuteWindow[] = [];
  for (const x of a) {
    for (const y of b) {
      const start = Math.max(x.start, y.start);
      const end = Math.min(x.end, y.end);
      if (end > start) out.push({ start, end });
    }
  }
  return out.sort((p, q) => p.start - q.start);
}

function subtractMinuteWindows(windows: MinuteWindow[], cuts: MinuteWindow[]): MinuteWindow[] {
  let out = windows;
  for (const cut of cuts) {
    const next: MinuteWindow[] = [];
    for (const w of out) {
      if (cut.end <= w.start || cut.start >= w.end) {
        next.push(w);
        continue;
      }
      if (cut.start > w.start) next.push({ start: w.start, end: cut.start });
      if (cut.end < w.end) next.push({ start: cut.end, end: w.end });
    }
    out = next;
  }
  return out.sort((p, q) => p.start - q.start);
}

function toTimeWindows(windows: MinuteWindow[]): TimeWindow[] {
  return windows
    .filter((w) => w.end > w.start)
    .map((w) => ({ start: minutesToTime(w.start), end: minutesToTime(w.end) }));
}

/* ------------------------------------------------------------------ */
/* Working windows                                                     */
/* ------------------------------------------------------------------ */

/**
 * Computes the staff member's bookable HH:mm windows for a salon-local date:
 * business hours ∩ weekly shift − shift breaks, then availability overrides
 * (exact-date wins over recurring; `isAvailable:false` disables the day),
 * and approved leave blacks out the date entirely.
 */
export async function getWorkingWindows(
  staffId: string,
  dateKey: string,
  _tz: string = env().TIMEZONE
): Promise<TimeWindow[]> {
  if (!mongoose.isValidObjectId(staffId) || !isValidDateKey(dateKey)) return [];

  const onLeave = await StaffLeave.findOne({
    staff: staffId,
    status: 'approved',
    startDate: { $lte: dateKey },
    endDate: { $gte: dateKey },
  })
    .select('_id')
    .lean();
  if (onLeave) return [];

  await ensureBusinessHours();
  const day = localWeekday(dateKey);
  const bh = await BusinessHours.findOne({ dayOfWeek: day }).lean();
  if (!bh?.isOpen) return [];

  let windows = toMinuteWindows([{ start: bh.openTime, end: bh.closeTime }]);

  const profile = await StaffProfile.findById(staffId).select('weeklySchedule').lean();
  const weeklyDay = profile?.weeklySchedule?.find((w) => w.day === day);
  if (weeklyDay && !weeklyDay.isWorking) return [];
  if (weeklyDay) {
    windows = intersectMinuteWindows(
      windows,
      toMinuteWindows([{ start: weeklyDay.start || bh.openTime, end: weeklyDay.end || bh.closeTime }])
    );
    windows = subtractMinuteWindows(windows, toMinuteWindows(weeklyDay.breaks ?? []));
  }
  if (!windows.length) return [];

  const overrides = await StaffAvailability.find({
    staff: staffId,
    $or: [{ date: dateKey }, { date: { $exists: false }, dayOfWeek: day }],
  }).lean();
  for (const override of overrides) {
    if (!override.isAvailable) return [];
    if (override.start && override.end) {
      windows = intersectMinuteWindows(windows, toMinuteWindows([{ start: override.start, end: override.end }]));
    }
    windows = subtractMinuteWindows(windows, toMinuteWindows(override.breaks ?? []));
    if (!windows.length) return [];
  }

  return toTimeWindows(windows);
}

/* ------------------------------------------------------------------ */
/* Busy intervals                                                      */
/* ------------------------------------------------------------------ */

export async function getBusyIntervals(
  staffId: string,
  dateKey: string,
  excludeAppointmentId?: string
): Promise<{ start: Date; end: Date }[]> {
  if (!mongoose.isValidObjectId(staffId)) return [];
  const filter: Record<string, unknown> = {
    staff: staffId,
    date: dateKey,
    status: { $in: BUSY_STATUSES },
  };
  if (excludeAppointmentId && mongoose.isValidObjectId(excludeAppointmentId)) {
    filter._id = { $ne: excludeAppointmentId };
  }
  const rows = await Appointment.find(filter).select('startsAt endsAt').lean();
  return rows.map((r) => ({ start: r.startsAt, end: r.endsAt }));
}

/* ------------------------------------------------------------------ */
/* Eligible staff                                                      */
/* ------------------------------------------------------------------ */

async function loadService(serviceId: string, requireActive: boolean): Promise<ServiceDoc> {
  if (!mongoose.isValidObjectId(serviceId)) throw errors.notFound('Service not found');
  const service = await Service.findById(serviceId);
  if (!service) throw errors.notFound('Service not found');
  if (requireActive && !service.isActive) throw errors.notFound('Service is not available');
  return service;
}

function staffOffersService(service: ServiceDoc, staff: Pick<StaffProfileDoc, '_id' | 'services'>): boolean {
  const inServiceList = service.staff.some((id) => String(id) === String(staff._id));
  const staffListsService = (staff.services ?? []).some((id) => String(id) === String(service._id));
  return inServiceList || staffListsService;
}

async function getEligibleStaff(service: ServiceDoc, staffParam?: string): Promise<StaffProfileDoc[]> {
  const baseFilter = { isActive: true, role: 'barber' as const };

  if (staffParam && staffParam !== 'any') {
    if (!mongoose.isValidObjectId(staffParam)) throw errors.notFound('Staff not found');
    const doc = await StaffProfile.findOne({ _id: staffParam, ...baseFilter });
    if (!doc) throw errors.notFound('Staff not found');
    if (!staffOffersService(service, doc)) {
      throw errors.badRequest('This staff member does not offer the selected service');
    }
    return [doc];
  }

  const all = await StaffProfile.find(baseFilter);
  let eligible = all.filter((s) => staffOffersService(service, s));
  if (!eligible.length) {
    eligible = all.filter((s) => (s.specialties ?? []).includes(service.category));
  }
  return eligible;
}

/* ------------------------------------------------------------------ */
/* Available slots                                                     */
/* ------------------------------------------------------------------ */

export interface AvailableSlot {
  startsAt: string; // ISO UTC
  time: string; // HH:mm salon-local
  staffIds: string[];
}

export interface AvailableSlotsResult {
  slots: AvailableSlot[];
  staffId: string | 'any';
  serviceId: string;
  durationMinutes: number;
  date: string;
  reason?: string;
}

export async function getAvailableSlots(params: {
  serviceId: string;
  date: string;
  staffId?: string; // 'any' | staff id | empty/undefined
  now?: Date;
}): Promise<AvailableSlotsResult> {
  const { serviceId, date, now = new Date() } = params;
  const staffParam = params.staffId && params.staffId !== 'any' ? params.staffId : 'any';

  const service = await loadService(serviceId, true);
  const settings = await getSettings();
  const tz = settings.timezone || env().TIMEZONE;
  const slotInterval = Math.max(5, settings.booking.slotIntervalMinutes || 15);
  const bufferMinutes = Math.max(settings.booking.bufferMinutes ?? 0, service.bufferMinutes ?? 0);
  const minNoticeHours = Math.max(settings.booking.minNoticeHours ?? 0, service.bookingRules?.minNoticeHours ?? 0);
  const maxAdvanceDays = Math.min(
    settings.booking.maxAdvanceDays || 60,
    service.bookingRules?.maxAdvanceDays || 60
  );
  const duration = service.durationMinutes;

  const todayKey = localDateKey(now, tz);
  if (date < todayKey) throw errors.badRequest('Cannot book a date in the past');
  if (date > addDays(todayKey, maxAdvanceDays)) {
    throw errors.badRequest(`Bookings can only be made up to ${maxAdvanceDays} days in advance`);
  }
  const earliest = addMinutes(now, minNoticeHours * 60);
  if (localDateKey(earliest, tz) > date) {
    throw errors.badRequest(`Bookings require at least ${minNoticeHours} hour(s) notice`);
  }

  const eligible = await getEligibleStaff(service, staffParam === 'any' ? undefined : staffParam);
  if (!eligible.length) {
    return {
      slots: [],
      staffId: staffParam,
      serviceId,
      durationMinutes: duration,
      date,
      reason: 'no_eligible_staff',
    };
  }

  const slotsByTime = new Map<string, AvailableSlot>();

  for (const staff of eligible) {
    const staffId = String(staff._id);
    const [windows, busy] = await Promise.all([
      getWorkingWindows(staffId, date, tz),
      getBusyIntervals(staffId, date),
    ]);

    for (const window of windows) {
      const windowStart = timeToMinutes(window.start);
      const windowEnd = timeToMinutes(window.end);
      for (let m = windowStart; m + duration + bufferMinutes <= windowEnd; m += slotInterval) {
        const time = minutesToTime(m);
        const startsAt = zonedTimeToUTC(date, time, tz);
        if (startsAt.getTime() < earliest.getTime()) continue;
        const candidateEnd = addMinutes(startsAt, duration + bufferMinutes);
        if (busy.some((b) => overlaps(startsAt, candidateEnd, b.start, b.end))) continue;

        const existing = slotsByTime.get(time);
        if (existing) existing.staffIds.push(staffId);
        else slotsByTime.set(time, { startsAt: startsAt.toISOString(), time, staffIds: [staffId] });
      }
    }
  }

  const slots = [...slotsByTime.values()].sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
  return {
    slots,
    staffId: staffParam,
    serviceId,
    durationMinutes: duration,
    date,
    reason: slots.length ? undefined : 'no_open_slots',
  };
}

/* ------------------------------------------------------------------ */
/* Assignment / bookability                                            */
/* ------------------------------------------------------------------ */

/**
 * Resolves the staff member a booking should be assigned to:
 * the requested barber when free, otherwise (for 'any') the eligible free
 * barber with the fewest appointments that day (ties broken by id, ascending).
 * Throws `slotTaken` when nobody can take the slot.
 */
export async function resolveAssignment(params: {
  serviceId: string;
  date: string;
  startsAt: Date;
  requestedStaffId?: string; // specific id, 'any', or empty
  excludeAppointmentId?: string; // for reschedules: ignore this appointment's occupancy
}): Promise<string> {
  const service = await loadService(params.serviceId, false);
  const settings = await getSettings();
  const bufferMinutes = Math.max(settings.booking.bufferMinutes ?? 0, service.bufferMinutes ?? 0);
  const slotEnd = addMinutes(params.startsAt, service.durationMinutes + bufferMinutes);

  const requested = params.requestedStaffId && params.requestedStaffId !== 'any' ? params.requestedStaffId : undefined;
  const eligible = await getEligibleStaff(service, requested);

  const free: string[] = [];
  for (const staff of eligible) {
    const staffId = String(staff._id);
    const busy = await getBusyIntervals(staffId, params.date, params.excludeAppointmentId);
    if (!busy.some((b) => overlaps(params.startsAt, slotEnd, b.start, b.end))) free.push(staffId);
  }
  if (!free.length) throw errors.slotTaken();

  if (requested) return free[0]; // getEligibleStaff guaranteed it is the requested barber

  const counts = await Appointment.aggregate<{ _id: Types.ObjectId; n: number }>([
    {
      $match: {
        staff: { $in: free.map((id) => new Types.ObjectId(id)) },
        date: params.date,
        status: { $in: BUSY_STATUSES },
      },
    },
    { $group: { _id: '$staff', n: { $sum: 1 } } },
  ]);
  const countByStaff = new Map(counts.map((c) => [String(c._id), c.n]));
  free.sort((a, b) => {
    const diff = (countByStaff.get(a) ?? 0) - (countByStaff.get(b) ?? 0);
    if (diff !== 0) return diff;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return free[0];
}

/** Booking-flow guard: verifies the slot is still free and returns the staffId to assign. */
export async function assertSlotBookable(params: {
  serviceId: string;
  date: string;
  startsAt: Date;
  requestedStaffId?: string;
  excludeAppointmentId?: string;
}): Promise<string> {
  return resolveAssignment(params);
}

export { loadService as loadBookingService };
