import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { errors } from '../utils/errors';
import { env } from '../config/env';
import { getSettings } from '../services/settings.service';
import {
  getAvailableSlots,
  getBusyIntervals,
  getWorkingWindows,
} from '../services/availability.service';
import { Appointment, BUSY_STATUSES } from '../models/Appointment';

export const slots = asyncHandler(async (req: Request, res: Response) => {
  const { serviceId, date, staffId } = req.query as { serviceId: string; date: string; staffId?: string };
  const data = await getAvailableSlots({ serviceId, date, staffId: staffId || 'any' });
  res.json({ data });
});

export const calendar = asyncHandler(async (req: Request, res: Response) => {
  const { from, to, staffId } = req.query as { from: string; to: string; staffId?: string };
  const user = req.user!;

  const filter: Record<string, unknown> = { date: { $gte: from, $lte: to } };
  if (user.role === 'barber') {
    if (!user.staffId) throw errors.forbidden();
    filter.staff = user.staffId;
  } else if (staffId && staffId !== 'any') {
    if (!mongoose.isValidObjectId(staffId)) throw errors.notFound('Staff not found');
    filter.staff = staffId;
  }

  const docs = await Appointment.find(filter)
    .populate('staff', 'name email')
    .sort({ startsAt: 1 })
    .lean();
  res.json({ data: docs });
});

export const staffDay = asyncHandler(async (req: Request, res: Response) => {
  const { date, staffId: queryStaffId } = req.query as { date: string; staffId?: string };
  const user = req.user!;
  const settings = await getSettings();
  const tz = settings.timezone || env().TIMEZONE;

  let staffId = queryStaffId && queryStaffId !== 'any' ? queryStaffId : undefined;
  if (user.role === 'barber') {
    if (!user.staffId) throw errors.forbidden();
    if (staffId && staffId !== user.staffId) throw errors.forbidden('You may only view your own schedule');
    staffId = user.staffId;
  } else if (!staffId) {
    throw errors.badRequest('staffId is required');
  }
  if (!mongoose.isValidObjectId(staffId)) throw errors.notFound('Staff not found');

  const [windows, busy, appointments] = await Promise.all([
    getWorkingWindows(staffId, date, tz),
    getBusyIntervals(staffId, date),
    Appointment.find({ staff: staffId, date, status: { $in: BUSY_STATUSES } })
      .sort({ startsAt: 1 })
      .lean(),
  ]);

  res.json({ data: { staffId, date, windows, busy, appointments } });
});
