import { Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { actorFrom } from '../middleware/auth';
import { errors } from '../utils/errors';
import { buildListResponse, parsePagination, searchRegex } from '../utils/pagination';
import { Appointment } from '../models/Appointment';
import { CustomerProfile } from '../models/CustomerProfile';
import { logAudit } from '../services/audit.service';
import { recomputeCustomerTotals } from '../services/billing.service';
import * as appointmentService from '../services/appointment.service';
import {
  allowedActionsFor,
  assignAppointment,
  cancelAppointment,
  createBooking,
  findOrCreateCustomerProfile,
  getByReference,
  getAppointmentHistory,
  notifyStatusChange,
  rescheduleAppointment,
  sendManualReminder,
} from '../services/appointment.service';
import type {
  AppointmentViewer,
} from '../services/appointment.service';
import {
  CancelBody,
  CreateBookingBody,
  ListQuery,
  PatchBody,
  RescheduleBody,
  StatusBody,
  WalkInBody,
} from '../validators/appointment.validators';

function viewerFrom(req: Request): AppointmentViewer {
  const token =
    (req.body as { token?: string } | undefined)?.token ??
    (req.query as { token?: string } | undefined)?.token;
  const u = req.user;
  return {
    userId: u?.id,
    role: u?.role,
    customerId: u?.customerId,
    staffId: u?.staffId,
    token,
  };
}

function publicActor(req: Request) {
  return {
    userId: req.user?.id,
    role: req.user?.role ?? 'guest',
    ip: req.ip,
    userAgent: req.get('user-agent'),
  };
}

/* ------------------------------------------------------------------ */
/* Public booking                                                      */
/* ------------------------------------------------------------------ */

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateBookingBody;
  const result = await createBooking(
    {
      serviceId: body.serviceId,
      staffId: body.staffId,
      date: body.date,
      time: body.time,
      name: body.name,
      email: body.email,
      phone: body.phone,
      notes: body.notes,
      guest: body.guest,
    },
    {
      actorUserId: req.user?.id,
      customerId: req.user?.customerId,
      source: 'website',
      actor: req.user
        ? { userId: req.user.id, role: req.user.role, ip: req.ip, userAgent: req.get('user-agent') }
        : { role: 'guest', ip: req.ip, userAgent: req.get('user-agent') },
    }
  );
  res.status(201).json({
    data: {
      appointment: result.appointment,
      bookingReference: result.bookingReference,
      managementToken: result.managementToken,
      payment: result.payment,
    },
  });
});

/* ------------------------------------------------------------------ */
/* Own bookings                                                        */
/* ------------------------------------------------------------------ */

export const mine = asyncHandler(async (req: Request, res: Response) => {
  const p = parsePagination(req);
  const q = req.query as ListQuery;
  const customerId = req.user?.customerId;
  if (!customerId) {
    res.json(buildListResponse([], 0, p));
    return;
  }

  const filter: Record<string, unknown> = { customer: customerId };
  if (q.status) filter.status = q.status;

  const [docs, total] = await Promise.all([
    Appointment.find(filter)
      .sort(p.sort)
      .skip(p.skip)
      .limit(p.limit)
      .populate('staff', 'name')
      .lean(),
    Appointment.countDocuments(filter),
  ]);

  const data = docs.map((d: any) => ({
    id: String(d._id),
    reference: d.reference,
    serviceSnapshot: d.serviceSnapshot,
    date: d.date,
    startsAt: d.startsAt,
    staff: d.staff ? { id: String(d.staff._id ?? d.staff), name: d.staff.name } : null,
    status: d.status,
    paymentStatus: d.paymentStatus,
    totalPrice: d.totalPrice,
    depositAmount: d.depositAmount,
  }));
  res.json(buildListResponse(data, total, p));
});

/* ------------------------------------------------------------------ */
/* Reference-based access (session or guest token)                     */
/* ------------------------------------------------------------------ */

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const appointment = await getByReference(req.params.reference, viewerFrom(req));
  res.json({ data: appointment });
});

export const manage = asyncHandler(async (req: Request, res: Response) => {
  const token = (req.query as { token?: string }).token;
  const appointment = await getByReference(req.params.reference, { token });
  const allowed = await allowedActionsFor(appointment as any, { token });
  res.json({ data: { appointment, allowedActions: allowed } });
});

export const reschedule = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as RescheduleBody;
  const viewer = viewerFrom(req);
  // Authorize against the existing booking first (session or guest token).
  await getByReference(req.params.reference, viewer);
  const appointment = await rescheduleAppointment(
    req.params.reference,
    { date: body.date, time: body.time, staffId: body.staffId, reason: body.reason },
    publicActor(req)
  );
  const refreshed = await Appointment.findById(appointment._id)
    .populate('staff', 'name email')
    .populate('customer', 'name email phone')
    .lean();
  const allowed = await allowedActionsFor(appointment, viewer);
  res.json({ data: { appointment: refreshed ?? appointment, allowedActions: allowed } });
});

export const cancel = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CancelBody;
  const viewer = viewerFrom(req);
  await getByReference(req.params.reference, viewer);
  const byRole = req.user?.role ?? 'guest';
  const appointment = await cancelAppointment(
    req.params.reference,
    { reason: body.reason, byRole },
    publicActor(req)
  );
  res.json({ data: { appointment } });
});

/* ------------------------------------------------------------------ */
/* Staff list                                                          */
/* ------------------------------------------------------------------ */

export const list = asyncHandler(async (req: Request, res: Response) => {
  const p = parsePagination(req);
  const q = req.query as ListQuery;
  const user = req.user!;
  const filter: Record<string, unknown> = {};

  // Role scoping.
  if (user.role === 'barber') {
    if (!user.staffId) throw errors.forbidden();
    filter.staff = user.staffId;
  } else if (user.role === 'customer') {
    if (!user.customerId) {
      res.json(buildListResponse([], 0, p));
      return;
    }
    filter.customer = user.customerId;
  } else {
    if (q.staffId) filter.staff = q.staffId;
  }
  if (q.customerId) filter.customer = q.customerId;
  if (q.status) filter.status = q.status;
  if (q.paymentStatus) filter.paymentStatus = q.paymentStatus;
  if (q.source) filter.source = q.source;
  if (q.from || q.to) {
    filter.date = {};
    if (q.from) (filter.date as Record<string, string>).$gte = q.from;
    if (q.to) (filter.date as Record<string, string>).$lte = q.to;
  }
  if (q.search) {
    const rx = searchRegex(q.search);
    const matches = await CustomerProfile.find({
      $or: [{ name: rx }, { email: rx }, { phone: rx }],
    })
      .select('_id')
      .lean();
    filter.$or = [
      { reference: rx },
      { 'guest.name': rx },
      { 'guest.email': rx },
      ...(matches.length ? [{ customer: { $in: matches.map((m) => m._id) } }] : []),
    ];
  }

  const [docs, total] = await Promise.all([
    Appointment.find(filter)
      .sort(p.sort)
      .skip(p.skip)
      .limit(p.limit)
      .populate('staff', 'name email')
      .populate('customer', 'name email phone')
      .lean(),
    Appointment.countDocuments(filter),
  ]);
  res.json(buildListResponse(docs, total, p));
});

/* ------------------------------------------------------------------ */
/* Walk-in (POS front desk)                                            */
/* ------------------------------------------------------------------ */

export const walkIn = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as WalkInBody;
  const actor = actorFrom(req);

  const linked = await findOrCreateCustomerProfile({
    customerId: body.customerId,
    name: body.customer?.name,
    email: body.customer?.email,
    phone: body.customer?.phone,
    source: 'walk_in',
    allowCreate: true,
  });
  if (!linked) throw errors.badRequest('Provide either customerId or customer details { name, email, phone }');

  const result = await createBooking(
    {
      serviceId: body.serviceId,
      staffId: body.staffId,
      date: body.date,
      time: body.time,
      name: body.customer?.name ?? '',
      email: body.customer?.email ?? '',
      phone: body.customer?.phone ?? '',
      notes: body.notes,
    },
    {
      actorUserId: actor.userId,
      customerId: linked.customerId,
      source: 'walk_in',
      autoConfirmOverride: true,
      actor,
    }
  );
  res.status(201).json({ data: { appointment: result.appointment, bookingReference: result.bookingReference } });
});

/* ------------------------------------------------------------------ */
/* Status / assignment / notes                                         */
/* ------------------------------------------------------------------ */

const STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled', 'no_show'],
  confirmed: ['in_progress', 'cancelled', 'no_show', 'completed'],
  in_progress: ['completed', 'no_show'],
  completed: [],
  cancelled: [],
  no_show: [],
};

export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw errors.notFound('Appointment not found');
  const body = req.body as StatusBody;
  const actor = actorFrom(req);
  const user = req.user!;

  const appt = await Appointment.findById(id);
  if (!appt) throw errors.notFound('Appointment not found');

  if (user.role === 'barber') {
    if (!user.staffId || String(appt.staff) !== user.staffId) {
      throw errors.forbidden('You can only update your own appointments');
    }
    if (!['in_progress', 'completed', 'no_show'].includes(body.status)) {
      throw errors.forbidden('Barbers can only mark appointments in progress, completed or no show');
    }
  }

  const allowedNext = STATUS_TRANSITIONS[appt.status] ?? [];
  if (!allowedNext.includes(body.status)) {
    throw errors.badRequest(`Cannot change status from "${appt.status}" to "${body.status}"`);
  }

  const before = { status: appt.status };
  appt.status = body.status;
  if (body.serviceNotes !== undefined) appt.serviceNotes = body.serviceNotes;
  if (body.status === 'completed') appt.completedAt = new Date();
  if (body.status === 'no_show') appt.noShowAt = new Date();
  if (body.status === 'cancelled') {
    appt.cancelledAt = new Date();
    appt.cancelledBy = new Types.ObjectId(actor.userId);
    if (body.reason) appt.cancelReason = body.reason;
  }
  await appt.save();

  if (body.status === 'completed' && appt.customer) {
    await recomputeCustomerTotals(String(appt.customer));
  }

  await notifyStatusChange(appt, before.status, user.role);

  await logAudit({
    actor,
    action: 'appointment.status',
    entity: 'Appointment',
    entityId: id,
    before,
    after: { status: body.status, serviceNotes: body.serviceNotes, reason: body.reason },
  });

  res.json({ data: appt });
});

export const assign = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw errors.notFound('Appointment not found');
  const body = req.body as { staffId: string; reason?: string };
  const actor = actorFrom(req);
  const appointment = await assignAppointment({
    appointmentId: id,
    staffId: body.staffId,
    reason: body.reason,
    actor,
  });
  res.json({ data: appointment });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw errors.notFound('Appointment not found');
  const body = req.body as PatchBody;
  const actor = actorFrom(req);

  const appt = await Appointment.findById(id);
  if (!appt) throw errors.notFound('Appointment not found');

  let appointment: mongoose.Document = appt;

  if (body.date !== undefined || body.time !== undefined) {
    if (body.date === undefined || body.time === undefined) {
      throw errors.badRequest('Both date and time are required to reschedule');
    }
    appointment = await rescheduleAppointment(
      appt.reference,
      { date: body.date, time: body.time, staffId: body.staffId },
      actor
    );
  } else if (body.staffId !== undefined) {
    appointment = await assignAppointment({ appointmentId: id, staffId: body.staffId, actor });
  }

  const notesPatch: Record<string, string> = {};
  if (body.notes !== undefined) notesPatch.notes = body.notes;
  if (body.internalNotes !== undefined) notesPatch.internalNotes = body.internalNotes;
  if (body.serviceNotes !== undefined) notesPatch.serviceNotes = body.serviceNotes;
  if (Object.keys(notesPatch).length) {
    const updated = await Appointment.findByIdAndUpdate(id, { $set: notesPatch }, { new: true });
    if (updated) appointment = updated;
    await logAudit({
      actor,
      action: 'appointment.update',
      entity: 'Appointment',
      entityId: id,
      after: notesPatch,
    });
  }

  res.json({ data: appointment });
});

export const remind = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw errors.notFound('Appointment not found');
  const actor = actorFrom(req);
  await sendManualReminder(id);
  await logAudit({
    actor,
    action: 'appointment.remind',
    entity: 'Appointment',
    entityId: id,
    after: { manual: true },
  });
  res.json({ data: { sent: true } });
});

export const history = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const data = await getAppointmentHistory(id);
  res.json({ data });
});
