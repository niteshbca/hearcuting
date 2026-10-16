import mongoose, { ClientSession, Types } from 'mongoose';
import { Appointment, AppointmentDoc, AppointmentStatus } from '../models/Appointment';
import { CustomerProfile } from '../models/CustomerProfile';
import { Service } from '../models/Service';
import { StaffProfile } from '../models/StaffProfile';
import { User } from '../models/User';
import { AuditLog } from '../models/Salon';
import { runWithOptionalTx, txOpts } from '../utils/tx';
import { errors, isAppError } from '../utils/errors';
import { round2 } from '../utils/money';
import { hashToken, randomToken } from '../utils/tokens';
import {
  addMinutes,
  isValidDateKey,
  isValidTime,
  minutesBetween,
  overlaps,
  zonedTimeToUTC,
} from '../utils/time';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { isStaffRole, Role } from '../utils/permissions';
import { getSettings } from './settings.service';
import { enqueueEmail } from './mail.service';
import { templates } from '../templates/email';
import { createNotification, notifyStaffAssignment } from './notification.service';
import { logAudit, AuditActor } from './audit.service';
import * as paymentService from './payment.service';
import * as razorpay from './razorpay.service';
import { serviceEffectivePrice } from '../models/Service';
import {
  assertSlotBookable,
  getBusyIntervals,
  loadBookingService,
  resolveAssignment,
} from './availability.service';
import crypto from 'crypto';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Human-friendly unique booking reference, e.g. BK-9F3A2C1B04. */
export function bookingReference(): string {
  return `BK-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

function clientOrigin(): string {
  return env().CLIENT_ORIGINS.split(',')[0]?.trim().replace(/\/$/, '') || 'http://localhost:5173';
}

async function ownerEmails(settings: { email?: string }): Promise<{ email: string; name?: string }[]> {
  const seen = new Set<string>();
  const out: { email: string; name?: string }[] = [];
  const push = (email?: string | null, name?: string) => {
    const e = (email || '').trim().toLowerCase();
    if (!e || seen.has(e)) return;
    seen.add(e);
    out.push({ email: e, name });
  };
  push(settings.email);
  const owners = await User.find({ role: 'owner', isActive: true }).select('email name').lean();
  for (const o of owners) push(o.email, o.name);
  return out;
}

interface PopulatedStaff {
  _id: Types.ObjectId | string;
  name?: string;
  email?: string;
  user?: Types.ObjectId | string;
  role?: string;
}

interface PopulatedCustomer {
  _id: Types.ObjectId | string;
  name?: string;
  email?: string;
  phone?: string;
  user?: Types.ObjectId | string;
}

type LeanAppointment = Omit<AppointmentDoc, 'staff' | 'customer'> & {
  staff?: PopulatedStaff | Types.ObjectId | string;
  customer?: PopulatedCustomer | Types.ObjectId | string;
  customerUser?: Types.ObjectId | string;
  managementTokenHash?: string;
};

async function loadForNotify(id: string): Promise<LeanAppointment | null> {
  const doc = await Appointment.findById(id)
    .populate('staff', 'name email user role')
    .populate('customer', 'name email phone user')
    .lean();
  return doc as unknown as LeanAppointment | null;
}

function staffDoc(appt: LeanAppointment): PopulatedStaff | undefined {
  const s = appt.staff as PopulatedStaff | undefined;
  return s && typeof s === 'object' && '_id' in s ? s : undefined;
}

function customerDoc(appt: LeanAppointment): PopulatedCustomer | undefined {
  const c = appt.customer as PopulatedCustomer | undefined;
  return c && typeof c === 'object' && '_id' in c ? c : undefined;
}

function customerNameOf(appt: LeanAppointment): string {
  return customerDoc(appt)?.name || appt.guest?.name || 'there';
}

function customerEmailOf(appt: LeanAppointment): string | undefined {
  return customerDoc(appt)?.email || appt.guest?.email || undefined;
}

function emailContext(appt: LeanAppointment, manageUrl?: string) {
  return {
    appointment: appt as unknown as Pick<
      AppointmentDoc,
      'reference' | 'date' | 'startsAt' | 'totalPrice' | 'depositAmount' | 'serviceSnapshot' | 'paymentStatus' | 'guest' | 'notes'
    >,
    customerName: customerNameOf(appt),
    staffName: staffDoc(appt)?.name,
    manageUrl,
  };
}

/* ------------------------------------------------------------------ */
/* Customer profile resolution                                         */
/* ------------------------------------------------------------------ */

export async function findOrCreateCustomerProfile(input: {
  userId?: string;
  customerId?: string;
  name?: string;
  email?: string;
  phone?: string;
  source?: 'website' | 'phone' | 'walk_in' | 'admin';
  allowCreate?: boolean;
}): Promise<{ customerId: string; customerUser?: string } | undefined> {
  if (input.customerId) {
    if (!mongoose.isValidObjectId(input.customerId)) throw errors.notFound('Customer not found');
    const existing = await CustomerProfile.findById(input.customerId);
    if (!existing) throw errors.notFound('Customer not found');
    return { customerId: String(existing._id), customerUser: existing.user ? String(existing.user) : input.userId };
  }
  if (input.userId) {
    if (!mongoose.isValidObjectId(input.userId)) return undefined;
    const byUser = await CustomerProfile.findOne({ user: input.userId });
    if (byUser) {
      return { customerId: String(byUser._id), customerUser: byUser.user ? String(byUser.user) : input.userId };
    }
  }
  if (input.email || input.phone) {
    const or: Record<string, string>[] = [];
    if (input.email) or.push({ email: input.email.toLowerCase() });
    if (input.phone) or.push({ phone: input.phone });
    const byContact = await CustomerProfile.findOne({ $or: or });
    if (byContact) {
      if (input.userId && !byContact.user) {
        byContact.user = new Types.ObjectId(input.userId);
        await byContact.save();
      }
      return { customerId: String(byContact._id), customerUser: byContact.user ? String(byContact.user) : input.userId };
    }
  }
  if ((input.userId || input.allowCreate) && input.name && input.email && input.phone) {
    const created = await CustomerProfile.create({
      user: input.userId ? new Types.ObjectId(input.userId) : undefined,
      name: input.name,
      email: input.email.toLowerCase(),
      phone: input.phone,
      source: input.source ?? 'website',
    });
    return { customerId: String(created._id), customerUser: input.userId };
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Post-write race guard                                               */
/* ------------------------------------------------------------------ */

/**
 * Optimistic overlap resolution for standalone (non-transactional) writes.
 *
 * After our appointment is inserted we re-query every other BUSY appointment
 * for the same staff whose [startsAt, endsAt + buffer) intersects ours.
 * If conflicts exist, the deterministic winner is the one with the earliest
 * (createdAt, _id) — ascending, _id as the tiebreaker. If we lost, our own
 * insert is deleted and `slotTaken` is thrown. If we won, every loser is
 * deleted and an `appointment.conflict_resolved` audit entry records both
 * references.
 */
async function resolveOverlapsAfterWrite(params: {
  appointment: AppointmentDoc;
  bufferMinutes: number;
  actor?: AuditActor;
}): Promise<void> {
  const mine = params.appointment;
  const horizon = addMinutes(mine.endsAt, params.bufferMinutes);

  const conflicts = await Appointment.find({
    staff: mine.staff,
    _id: { $ne: mine._id },
    status: { $in: ['pending', 'confirmed', 'in_progress'] },
    startsAt: { $lt: horizon },
    endsAt: { $gt: mine.startsAt },
  })
    .select('reference startsAt endsAt createdAt')
    .lean();
  if (!conflicts.length) return;

  interface Candidate {
    _id: string;
    reference: string;
    createdAt: Date;
  }
  const all: Candidate[] = [
    ...conflicts.map((c) => ({ _id: String(c._id), reference: c.reference, createdAt: c.createdAt })),
    { _id: String(mine._id), reference: mine.reference, createdAt: mine.createdAt },
  ];
  all.sort((a, b) => {
    const diff = a.createdAt.getTime() - b.createdAt.getTime();
    if (diff !== 0) return diff;
    return a._id < b._id ? -1 : a._id > b._id ? 1 : 0;
  });

  const winner = all[0];
  if (winner._id !== String(mine._id)) {
    // Only delete our own insert (guard on reference in case of id reuse).
    await Appointment.deleteOne({ _id: mine._id, reference: mine.reference });
    throw errors.slotTaken();
  }

  const losers = all.slice(1);
  for (const loser of losers) {
    if (loser._id === String(mine._id)) continue;
    await Appointment.deleteOne({ _id: loser._id });
  }
  await logAudit({
    actor: params.actor,
    action: 'appointment.conflict_resolved',
    entity: 'Appointment',
    entityId: String(mine._id),
    before: { losers: losers.map((l) => l.reference) },
    after: { winner: winner.reference, kept: mine.reference },
  });
}

/* ------------------------------------------------------------------ */
/* Create booking                                                      */
/* ------------------------------------------------------------------ */

export interface CreateBookingInput {
  serviceId: string;
  staffId?: string; // specific id, 'any', or empty
  date: string;
  time: string;
  name: string;
  email: string;
  phone: string;
  notes?: string;
  guest?: boolean;
}

export interface CreateBookingOpts {
  actorUserId?: string;
  customerId?: string;
  source: 'website' | 'phone' | 'walk_in' | 'admin';
  autoConfirmOverride?: boolean;
  isGuestAllowedEditor?: boolean;
  actor?: AuditActor;
}

async function insertAppointment(
  doc: Record<string, unknown>,
  session: ClientSession | undefined,
  retryOnce = true
): Promise<AppointmentDoc> {
  try {
    const [created] = await Appointment.create([doc], txOpts(session));
    return created;
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code === 11000 && retryOnce) {
      const [created] = await Appointment.create([{ ...doc, reference: bookingReference() }], txOpts(session));
      return created;
    }
    throw err;
  }
}

export async function createBooking(
  input: CreateBookingInput,
  opts: CreateBookingOpts
): Promise<{
  appointment: AppointmentDoc;
  bookingReference: string;
  managementToken?: string;
  payment?: Awaited<ReturnType<typeof paymentService.createOnlineOrder>>;
}> {
  if (!isValidDateKey(input.date) || !isValidTime(input.time)) {
    throw errors.badRequest('Invalid date or time');
  }

  const service = await loadBookingService(input.serviceId, true);
  const settings = await getSettings();
  const tz = settings.timezone || env().TIMEZONE;

  const isGuestBooking = !opts.customerId && !opts.actorUserId;
  if (isGuestBooking) {
    if (!settings.booking.allowGuest || !service.bookingRules.allowGuest) {
      throw errors.forbidden('Guest bookings are not allowed for this service');
    }
    if (!input.name || !input.email || !input.phone) {
      throw errors.badRequest('Name, email and phone are required for guest bookings');
    }
  }

  // Link / reuse the customer profile (never trust client-provided ids blindly).
  const linked = await findOrCreateCustomerProfile({
    userId: opts.actorUserId,
    customerId: opts.customerId,
    name: input.name,
    email: input.email,
    phone: input.phone,
    source: opts.source,
    allowCreate: false,
  });

  const startsAt = zonedTimeToUTC(input.date, input.time, tz);
  const endsAt = addMinutes(startsAt, service.durationMinutes);

  // Resolve the assigned barber and verify the slot is still free.
  const staffId = await assertSlotBookable({
    serviceId: String(service._id),
    date: input.date,
    startsAt,
    requestedStaffId: input.staffId,
  });
  const bufferMinutes = Math.max(settings.booking.bufferMinutes ?? 0, service.bufferMinutes ?? 0);

  let status: AppointmentStatus =
    settings.booking.autoConfirm && !service.bookingRules.requireApproval ? 'confirmed' : 'pending';
  if (opts.autoConfirmOverride) status = 'confirmed';

  const price = round2(serviceEffectivePrice(service));
  let depositAmount = 0;
  if (settings.booking.requireDeposit && settings.payments.onlinePaymentsEnabled && service.bookingRules.onlinePaymentAllowed) {
    depositAmount = round2((price * settings.booking.depositPercent) / 100);
  }

  const managementToken = isGuestBooking ? randomToken(24) : undefined;
  const reference = bookingReference();

  const appointment = await runWithOptionalTx(async (session) => {
    // In-tx re-check: another writer may have inserted between resolution and now.
    const busy = await getBusyIntervals(staffId, input.date);
    if (busy.some((b) => overlaps(startsAt, addMinutes(startsAt, service.durationMinutes + bufferMinutes), b.start, b.end))) {
      throw errors.slotTaken();
    }
    return insertAppointment(
      {
        reference,
        customer: linked ? new Types.ObjectId(linked.customerId) : undefined,
        customerUser: linked?.customerUser
          ? new Types.ObjectId(linked.customerUser)
          : !opts.customerId && opts.actorUserId
            ? new Types.ObjectId(opts.actorUserId)
            : undefined,
        guest: isGuestBooking ? { name: input.name, email: input.email, phone: input.phone } : undefined,
        managementTokenHash: managementToken ? hashToken(managementToken) : undefined,
        staff: new Types.ObjectId(staffId),
        service: service._id,
        serviceSnapshot: {
          name: service.name,
          category: service.category,
          price,
          durationMinutes: service.durationMinutes,
        },
        date: input.date,
        startsAt,
        endsAt,
        status,
        paymentStatus: 'unpaid',
        source: opts.source,
        totalPrice: price,
        depositAmount,
        notes: input.notes ?? '',
      },
      session
    );
  });

  // Standalone race guard (outside the session — the definitive conflict arbiter).
  await resolveOverlapsAfterWrite({ appointment, bufferMinutes, actor: opts.actor });

  await logAudit({
    actor: opts.actor ?? (opts.actorUserId ? { userId: opts.actorUserId, role: opts.source } : undefined),
    action: 'appointment.create',
    entity: 'Appointment',
    entityId: String(appointment._id),
    after: {
      reference: appointment.reference,
      staff: staffId,
      date: input.date,
      startsAt,
      status,
      totalPrice: price,
      source: opts.source,
    },
  });

  // Booking emails + in-app notifications (fire-and-forget safe).
  await notifyBookingCreated(String(appointment._id), managementToken);

  // Optional online deposit / full payment order.
  let payment: Awaited<ReturnType<typeof paymentService.createOnlineOrder>> | undefined;
  if (
    settings.payments.onlinePaymentsEnabled &&
    razorpay.isConfigured() &&
    service.bookingRules.onlinePaymentAllowed &&
    depositAmount > 0
  ) {
    try {
      payment = await paymentService.createOnlineOrder(appointment.reference);
    } catch (err) {
      if (!(isAppError(err) && err.status === 503)) {
        logger.error({ err, reference: appointment.reference }, 'failed to create online payment order for booking');
      }
    }
  }

  return {
    appointment,
    bookingReference: appointment.reference,
    managementToken,
    payment,
  };
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

export async function notifyBookingCreated(appointmentId: string, managementToken?: string): Promise<void> {
  try {
    const appt = await loadForNotify(appointmentId);
    if (!appt) return;
    const settings = await getSettings();
    const client = clientOrigin();
    const manageUrl = managementToken
      ? `${client}/booking/${appt.reference}?token=${managementToken}`
      : `${client}/booking/${appt.reference}`;
    const ctx = { ...emailContext(appt, manageUrl), settings };
    const id = String(appt._id);

    // Customer email.
    const toCustomer = customerEmailOf(appt);
    if (toCustomer) {
      const pending = appt.status === 'pending';
      const content = pending
        ? templates.bookingPendingApprovalCustomer(ctx)
        : templates.bookingCreatedCustomer(ctx);
      await enqueueEmail({
        to: toCustomer,
        toName: customerNameOf(appt),
        subject: content.subject,
        html: content.html,
        text: content.text,
        template: pending ? 'booking_pending_approval' : 'booking_created',
        relatedType: 'Appointment',
        relatedId: id,
        dedupeKey: `booking_created:${id}`,
      });
    }

    // Owner notification email (settings address + every active owner).
    const ownerCtx = {
      ...ctx,
      customerPhone: appt.guest?.phone || customerDoc(appt)?.phone,
      customerEmail: appt.guest?.email || customerDoc(appt)?.email,
    };
    const adminUrl = `${client}/admin/appointments`;
    for (const owner of await ownerEmails(settings)) {
      const content = templates.newBookingOwner({ ...ownerCtx, manageUrl: adminUrl });
      await enqueueEmail({
        to: owner.email,
        toName: owner.name,
        subject: content.subject,
        html: content.html,
        text: content.text,
        template: 'new_booking_owner',
        relatedType: 'Appointment',
        relatedId: id,
        dedupeKey: `booking_created_owner:${id}:${owner.email}`,
      });
    }

    // Assigned barber email + in-app notification.
    const staff = staffDoc(appt);
    if (staff?.email) {
      const content = templates.staffAssigned({ ...ctx, manageUrl: adminUrl });
      await enqueueEmail({
        to: staff.email,
        toName: staff.name,
        subject: content.subject,
        html: content.html,
        text: content.text,
        template: 'staff_assigned',
        relatedType: 'Appointment',
        relatedId: id,
        dedupeKey: `staff_assigned:${id}:${String(staff._id)}:initial`,
      });
    }
    if (staff?.user) {
      await notifyStaffAssignment(String(staff.user), {
        appointmentId: id,
        reference: appt.reference,
        serviceName: appt.serviceSnapshot?.name ?? 'Service',
        startsAt: appt.startsAt,
        customerName: customerNameOf(appt),
      });
    }
  } catch (err) {
    logger.error({ err, appointmentId }, 'notifyBookingCreated failed');
  }
}

export async function notifyStatusChange(
  appointment: AppointmentDoc,
  prevStatus: string,
  actorRole?: string
): Promise<void> {
  try {
    const appt = await loadForNotify(String(appointment._id));
    if (!appt) return;
    const settings = await getSettings();
    const client = clientOrigin();
    const manageUrl = `${client}/booking/${appt.reference}`;
    const ctx = { ...emailContext(appt, manageUrl), settings, byRole: actorRole };
    const id = String(appt._id);
    const bucket = Math.floor(Date.now() / 60_000); // one-minute transition bucket
    const toCustomer = customerEmailOf(appt);

    if (appt.status === 'confirmed' && prevStatus !== 'confirmed' && toCustomer) {
      const content = templates.bookingConfirmed(ctx);
      await enqueueEmail({
        to: toCustomer,
        toName: customerNameOf(appt),
        subject: content.subject,
        html: content.html,
        text: content.text,
        template: 'booking_confirmed',
        relatedType: 'Appointment',
        relatedId: id,
        dedupeKey: `status_confirmed:${id}:${bucket}`,
      });
    }

    if (appt.status === 'cancelled' && prevStatus !== 'cancelled') {
      const adminUrl = `${client}/admin/appointments`;
      if (toCustomer) {
        const content = templates.bookingCancelled(ctx);
        await enqueueEmail({
          to: toCustomer,
          toName: customerNameOf(appt),
          subject: content.subject,
          html: content.html,
          text: content.text,
          template: 'booking_cancelled',
          relatedType: 'Appointment',
          relatedId: id,
          dedupeKey: `status_cancelled:${id}:${bucket}`,
        });
      }
      for (const owner of await ownerEmails(settings)) {
        const content = templates.bookingCancelled({ ...ctx, manageUrl: adminUrl });
        await enqueueEmail({
          to: owner.email,
          toName: owner.name,
          subject: content.subject,
          html: content.html,
          text: content.text,
          template: 'booking_cancelled',
          relatedType: 'Appointment',
          relatedId: id,
          dedupeKey: `status_cancelled_owner:${id}:${bucket}:${owner.email}`,
        });
      }
    }

    if (appt.status === 'no_show' && prevStatus !== 'no_show') {
      await createNotification({
        role: 'manager',
        type: 'appointment_no_show',
        title: `No-show: ${appt.reference}`,
        body: `${customerNameOf(appt)} · ${appt.serviceSnapshot?.name ?? 'Service'} · ${appt.date}`,
        data: { appointmentId: id, reference: appt.reference },
      });
    }
  } catch (err) {
    logger.error({ err, appointmentId: String(appointment._id) }, 'notifyStatusChange failed');
  }
}

async function notifyStaffAssignmentEmail(
  appt: LeanAppointment,
  settings: Awaited<ReturnType<typeof getSettings>>,
  dedupeSuffix: string
): Promise<void> {
  const staff = staffDoc(appt);
  if (!staff?.email) return;
  const client = clientOrigin();
  const ctx = {
    ...emailContext(appt, `${client}/admin/appointments`),
    settings,
  };
  const content = templates.staffAssigned(ctx);
  await enqueueEmail({
    to: staff.email,
    toName: staff.name,
    subject: content.subject,
    html: content.html,
    text: content.text,
    template: 'staff_assigned',
    relatedType: 'Appointment',
    relatedId: String(appt._id),
    dedupeKey: `staff_assigned:${String(appt._id)}:${String(staff._id)}:${dedupeSuffix}`,
  });
  if (staff.user) {
    await notifyStaffAssignment(String(staff.user), {
      appointmentId: String(appt._id),
      reference: appt.reference,
      serviceName: appt.serviceSnapshot?.name ?? 'Service',
      startsAt: appt.startsAt,
      customerName: customerNameOf(appt),
    });
  }
}

/* ------------------------------------------------------------------ */
/* Reschedule / cancel / assign                                        */
/* ------------------------------------------------------------------ */

export async function rescheduleAppointment(
  reference: string,
  input: { date: string; time: string; staffId?: string; reason?: string },
  actor?: AuditActor
): Promise<AppointmentDoc> {
  if (!isValidDateKey(input.date) || !isValidTime(input.time)) throw errors.badRequest('Invalid date or time');

  const appt = await Appointment.findOne({ reference: reference.toUpperCase() });
  if (!appt) throw errors.notFound('Booking not found');
  if (appt.status !== 'pending' && appt.status !== 'confirmed') {
    throw errors.conflict('Only pending or confirmed bookings can be rescheduled');
  }

  const settings = await getSettings();
  const tz = settings.timezone || env().TIMEZONE;
  if (minutesBetween(new Date(), appt.startsAt) < settings.booking.rescheduleCutoffHours * 60) {
    throw errors.policyBlocked(settings.booking.cancellationPolicyText);
  }

  const startsAt = zonedTimeToUTC(input.date, input.time, tz);
  const duration = appt.serviceSnapshot?.durationMinutes ?? 30;
  const excludeId = String(appt._id);
  const requested = input.staffId && input.staffId !== 'any' ? input.staffId : undefined;

  let staffId: string;
  if (requested) {
    staffId = await assertSlotBookable({
      serviceId: String(appt.service),
      date: input.date,
      startsAt,
      requestedStaffId: requested,
      excludeAppointmentId: excludeId,
    });
  } else {
    // Keep the current barber when possible; otherwise fall back to any free one.
    try {
      staffId = await assertSlotBookable({
        serviceId: String(appt.service),
        date: input.date,
        startsAt,
        requestedStaffId: String(appt.staff),
        excludeAppointmentId: excludeId,
      });
    } catch (err) {
      if (isAppError(err) && err.code === 'SLOT_UNAVAILABLE') {
        staffId = await resolveAssignment({
          serviceId: String(appt.service),
          date: input.date,
          startsAt,
          requestedStaffId: 'any',
          excludeAppointmentId: excludeId,
        });
      } else {
        throw err;
      }
    }
  }

  const prevStaff = String(appt.staff);
  const prevStart = appt.startsAt;
  const prevDate = appt.date;

  appt.date = input.date;
  appt.startsAt = startsAt;
  appt.endsAt = addMinutes(startsAt, duration);
  appt.staff = new Types.ObjectId(staffId);
  appt.rescheduleHistory.push({
    fromStart: prevStart,
    toStart: startsAt,
    at: new Date(),
    byUserId: actor?.userId ? new Types.ObjectId(actor.userId) : undefined,
    byRole: actor?.role,
    reason: input.reason,
  });
  await appt.save();

  const service = await Service.findById(appt.service).lean();
  const bufferMinutes = Math.max(settings.booking.bufferMinutes ?? 0, service?.bufferMinutes ?? 0);
  await resolveOverlapsAfterWrite({ appointment: appt, bufferMinutes, actor });

  // Emails: customer + owners + newly assigned staff; old staff informed if changed.
  const refreshed = await loadForNotify(String(appt._id));
  if (refreshed) {
    const client = clientOrigin();
    const ctx = {
      ...emailContext(refreshed, `${client}/booking/${refreshed.reference}`),
      settings,
      oldStart: prevStart,
      reason: input.reason,
    };
    const bucket = Math.floor(Date.now() / 60_000);
    const toCustomer = customerEmailOf(refreshed);
    if (toCustomer) {
      const content = templates.bookingRescheduled(ctx);
      await enqueueEmail({
        to: toCustomer,
        toName: customerNameOf(refreshed),
        subject: content.subject,
        html: content.html,
        text: content.text,
        template: 'booking_rescheduled',
        relatedType: 'Appointment',
        relatedId: String(appt._id),
        dedupeKey: `status_rescheduled:${String(appt._id)}:${bucket}`,
      });
    }
    for (const owner of await ownerEmails(settings)) {
      const content = templates.bookingRescheduled({ ...ctx, manageUrl: `${client}/admin/appointments` });
      await enqueueEmail({
        to: owner.email,
        toName: owner.name,
        subject: content.subject,
        html: content.html,
        text: content.text,
        template: 'booking_rescheduled',
        relatedType: 'Appointment',
        relatedId: String(appt._id),
        dedupeKey: `status_rescheduled_owner:${String(appt._id)}:${bucket}:${owner.email}`,
      });
    }
    if (staffId !== prevStaff) {
      await notifyStaffAssignmentEmail(refreshed, settings, `rescheduled:${bucket}`);
      const oldStaff = await StaffProfile.findById(prevStaff).select('name user').lean();
      if (oldStaff?.user) {
        await createNotification({
          user: String(oldStaff.user),
          type: 'appointment_unassigned',
          title: `Booking reassigned: ${refreshed.reference}`,
          body: `The appointment with ${customerNameOf(refreshed)} on ${refreshed.date} was moved to another staff member.`,
          data: { appointmentId: String(appt._id), reference: refreshed.reference },
        });
      }
    }
  }

  await logAudit({
    actor,
    action: 'appointment.reschedule',
    entity: 'Appointment',
    entityId: String(appt._id),
    before: { date: prevDate, startsAt: prevStart, staff: prevStaff },
    after: { date: appt.date, startsAt: appt.startsAt, staff: staffId, reason: input.reason },
  });

  return appt;
}

export async function cancelAppointment(
  reference: string,
  input: { reason?: string; byRole?: string },
  actor?: AuditActor
): Promise<AppointmentDoc> {
  const appt = await Appointment.findOne({ reference: reference.toUpperCase() });
  if (!appt) throw errors.notFound('Booking not found');
  if (appt.status === 'cancelled') throw errors.conflict('This booking is already cancelled');
  if (appt.status !== 'pending' && appt.status !== 'confirmed') {
    throw errors.conflict('This booking can no longer be cancelled');
  }

  const settings = await getSettings();
  const byRole = input.byRole ?? actor?.role ?? 'customer';
  const customerInitiated = byRole === 'customer' || byRole === 'guest';
  if (customerInitiated) {
    if (minutesBetween(new Date(), appt.startsAt) < settings.booking.cancelCutoffHours * 60) {
      throw errors.policyBlocked(settings.booking.cancellationPolicyText);
    }
  }

  const before = { status: appt.status };
  appt.status = 'cancelled';
  appt.cancelledAt = new Date();
  if (actor?.userId) appt.cancelledBy = new Types.ObjectId(actor.userId);
  appt.cancelReason = input.reason;
  await appt.save();

  await notifyStatusChange(appt, before.status, byRole);

  await logAudit({
    actor,
    action: 'appointment.cancel',
    entity: 'Appointment',
    entityId: String(appt._id),
    before,
    after: { status: 'cancelled', reason: input.reason, byRole },
  });
  return appt;
}

export async function assignAppointment(params: {
  appointmentId: string;
  staffId: string;
  reason?: string;
  actor?: AuditActor;
}): Promise<AppointmentDoc> {
  const appt = await Appointment.findById(params.appointmentId);
  if (!appt) throw errors.notFound('Appointment not found');
  if (appt.status !== 'pending' && appt.status !== 'confirmed') {
    throw errors.badRequest('Only pending or confirmed appointments can be reassigned');
  }
  if (appt.startsAt.getTime() <= Date.now()) {
    throw errors.badRequest('Past appointments cannot be reassigned');
  }
  if (!mongoose.isValidObjectId(params.staffId)) throw errors.notFound('Staff not found');
  const newStaff = await StaffProfile.findOne({ _id: params.staffId, isActive: true, role: 'barber' });
  if (!newStaff) throw errors.notFound('Staff not found');

  const prevStaff = String(appt.staff);
  if (prevStaff === String(newStaff._id)) return appt;

  appt.staff = newStaff._id;
  await appt.save();

  const settings = await getSettings();
  const refreshed = await loadForNotify(String(appt._id));
  if (refreshed) {
    const bucket = Math.floor(Date.now() / 60_000);
    await notifyStaffAssignmentEmail(refreshed, settings, `assign:${bucket}`);
    const oldStaff = await StaffProfile.findById(prevStaff).select('name user').lean();
    if (oldStaff?.user) {
      await createNotification({
        user: String(oldStaff.user),
        type: 'appointment_unassigned',
        title: `Booking reassigned: ${refreshed.reference}`,
        body: `The appointment on ${refreshed.date} (${refreshed.serviceSnapshot?.name ?? 'Service'}) was given to ${newStaff.name}.`,
        data: { appointmentId: String(appt._id), reference: refreshed.reference },
      });
    }
  }

  await logAudit({
    actor: params.actor,
    action: 'appointment.assign',
    entity: 'Appointment',
    entityId: String(appt._id),
    before: { staff: prevStaff },
    after: { staff: String(newStaff._id), reason: params.reason },
  });
  return appt;
}

/* ------------------------------------------------------------------ */
/* Access control                                                      */
/* ------------------------------------------------------------------ */

export interface AppointmentViewer {
  userId?: string;
  role?: Role | string;
  customerId?: string;
  staffId?: string;
  token?: string;
}

export async function getByReference(reference: string, viewer: AppointmentViewer): Promise<Record<string, unknown>> {
  const ref = String(reference ?? '').trim().toUpperCase();
  if (!ref) throw errors.notFound('Booking not found');

  const doc = (await Appointment.findOne({ reference: ref })
    .select('+managementTokenHash')
    .populate('staff', 'name email user role')
    .populate('customer', 'name email phone user')
    .lean()) as unknown as LeanAppointment | null;
  if (!doc) throw errors.notFound('Booking not found');

  const role = viewer.role;
  let allowed = false;

  if (role && isStaffRole(role)) {
    if (role === 'barber') {
      const assigned = staffDoc(doc);
      allowed = !!viewer.staffId && !!assigned && String(assigned._id) === viewer.staffId;
    } else {
      allowed = true; // owner / manager / receptionist / accountant: any booking
    }
  } else if (role === 'customer') {
    const ownProfile = !!viewer.customerId && doc.customer && String(customerDoc(doc)?._id ?? '') === viewer.customerId;
    const ownUser = !!viewer.userId && String(doc.customerUser ?? '') === viewer.userId;
    allowed = ownProfile || ownUser;
  }

  if (!allowed && viewer.token) {
    allowed = !!doc.managementTokenHash && hashToken(viewer.token) === doc.managementTokenHash;
  }
  if (!allowed) throw errors.forbidden('You do not have access to this booking');

  const { managementTokenHash: _hash, ...rest } = doc;
  return rest as unknown as Record<string, unknown>;
}

export async function allowedActionsFor(
  appointment: { status: string; paymentStatus: string; startsAt: Date },
  viewer: AppointmentViewer
): Promise<{ canReschedule: boolean; canCancel: boolean; canPay: boolean }> {
  const settings = await getSettings();
  const now = new Date();
  const minsLeft = minutesBetween(now, appointment.startsAt);
  const actionable = appointment.status === 'pending' || appointment.status === 'confirmed';
  const staffViewer = !!viewer.role && isStaffRole(viewer.role);

  const canReschedule = actionable && minsLeft >= settings.booking.rescheduleCutoffHours * 60;
  const canCancel = actionable && (staffViewer || minsLeft >= settings.booking.cancelCutoffHours * 60);
  const canPay =
    actionable &&
    ['unpaid', 'deposit_paid', 'partially_paid'].includes(appointment.paymentStatus);

  return { canReschedule, canCancel, canPay };
}

export async function getAppointmentHistory(id: string): Promise<{
  rescheduleHistory: unknown[];
  audit: unknown[];
}> {
  if (!mongoose.isValidObjectId(id)) throw errors.notFound('Appointment not found');
  const appt = await Appointment.findById(id).select('rescheduleHistory reference').lean();
  if (!appt) throw errors.notFound('Appointment not found');
  const audit = await AuditLog.find({ entity: 'Appointment', entityId: id }).sort({ createdAt: -1 }).lean();
  return { rescheduleHistory: appt.rescheduleHistory ?? [], audit };
}

/* ------------------------------------------------------------------ */
/* Reminders                                                           */
/* ------------------------------------------------------------------ */

export async function sendManualReminder(id: string): Promise<void> {
  if (!mongoose.isValidObjectId(id)) throw errors.notFound('Appointment not found');
  const appt = await loadForNotify(id);
  if (!appt) throw errors.notFound('Appointment not found');
  if (appt.status !== 'pending' && appt.status !== 'confirmed') {
    throw errors.badRequest('Reminders can only be sent for pending or confirmed bookings');
  }
  const email = customerEmailOf(appt);
  if (!email) throw errors.badRequest('This booking has no customer email address');

  const settings = await getSettings();
  const client = clientOrigin();
  const content = templates.appointmentReminder({
    ...emailContext(appt, `${client}/booking/${appt.reference}`),
    settings,
  });
  const now = new Date();
  await enqueueEmail({
    to: email,
    toName: customerNameOf(appt),
    subject: content.subject,
    html: content.html,
    text: content.text,
    template: 'appointment_reminder',
    relatedType: 'Appointment',
    relatedId: id,
    dedupeKey: `reminder:${id}:manual:${now.getTime()}`,
  });

  await Appointment.updateOne({ _id: id }, { $push: { remindersSent: { type: 'manual', at: now } } });
}
