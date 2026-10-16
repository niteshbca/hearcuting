import { Appointment } from '../models/Appointment';
import { StaffProfile } from '../models/StaffProfile';
import { enqueueEmail } from '../services/mail.service';
import { getSettings } from '../services/settings.service';
import { templates } from '../templates/email';
import { logger } from '../config/logger';
import { addMinutes } from '../utils/time';

let running = false;
let timer: NodeJS.Timeout | null = null;

/**
 * Sends appointment reminders for bookings whose reminder window has opened.
 * Idempotent: each appointment/type can only be queued once (dedupeKey) and
 * `remindersSent` is updated atomically to avoid duplicate sends on retries.
 */
export async function tickReminders(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const settings = await getSettings();
    if (!settings.notifications.emailEnabled || !settings.notifications.remindersEnabled) return;

    const hours = settings.notifications.remindersHoursBefore ?? 3;
    const now = new Date();
    const windowEnd = addMinutes(now, hours * 60);

    const candidates = await Appointment.find({
      status: { $in: ['pending', 'confirmed'] },
      startsAt: { $gte: addMinutes(now, -5), $lte: windowEnd },
      'remindersSent.type': { $ne: 'reminder' },
    })
      .limit(50)
      .populate('customer', 'name email')
      .lean();

    for (const appointment of candidates) {
      // Atomically claim the reminder so a retry can't send twice.
      const claimed = await Appointment.findOneAndUpdate(
        { _id: appointment._id, 'remindersSent.type': { $ne: 'reminder' } },
        { $push: { remindersSent: { type: 'reminder', at: new Date() } } },
        { new: true }
      ).lean();
      if (!claimed) continue;

      const email =
        (appointment.customer as unknown as { email?: string })?.email ?? appointment.guest?.email;
      const name =
        (appointment.customer as unknown as { name?: string })?.name ?? appointment.guest?.name ?? 'there';
      if (!email) continue;

      const staff = await StaffProfile.findById(appointment.staff).select('name').lean();
      const frontend = process.env.CLIENT_ORIGINS?.split(',')[0]?.trim() || 'http://localhost:5173';
      const content = templates.appointmentReminder({
        appointment,
        customerName: name,
        staffName: staff?.name,
        settings,
        manageUrl: `${frontend}/booking/${appointment.reference}`,
      });

      await enqueueEmail({
        to: email,
        toName: name,
        subject: content.subject,
        html: content.html,
        text: content.text,
        template: 'appointment_reminder',
        relatedType: 'Appointment',
        relatedId: String(appointment._id),
        dedupeKey: `reminder:${String(appointment._id)}`,
      });
    }
  } catch (err) {
    logger.error({ err }, 'reminder tick failed');
  } finally {
    running = false;
  }
}

/** Membership expiry reminders (queued once per membership/day). */
export async function tickMembershipExpiry(): Promise<void> {
  const settings = await getSettings();
  const { Membership } = await import('../models/Membership');
  const horizon = addMinutes(new Date(), 7 * 24 * 60);
  const expiring = await Membership.find({
    status: 'active',
    validUntil: { $gte: new Date(), $lte: horizon },
  })
    .limit(50)
    .populate('customer', 'name email')
    .lean();

  for (const m of expiring) {
    const email = (m.customer as unknown as { email?: string })?.email;
    const name = (m.customer as unknown as { name?: string })?.name ?? 'there';
    if (!email) continue;
    const remaining = (m.includes ?? [])
      .map((i) => ({
        serviceName: i.serviceName ?? 'Service',
        left: Math.max(0, (i.limitTotal ?? 0) - (i.limitUsed ?? 0)),
      }))
      .filter((i) => i.left > 0);
    const content = templates.membershipExpiring({
      customerName: name,
      planName: m.name,
      validUntil: m.validUntil,
      remaining,
      settings,
    });
    await enqueueEmail({
      to: email,
      toName: name,
      subject: content.subject,
      html: content.html,
      text: content.text,
      template: 'membership_expiring',
      relatedType: 'Membership',
      relatedId: String(m._id),
      dedupeKey: `membership_expiry:${String(m._id)}:${m.validUntil.toISOString().slice(0, 10)}`,
    });
  }
}

export function startReminderWorker(intervalMs = 5 * 60_000): void {
  if (timer) return;
  timer = setInterval(() => {
    void tickReminders();
    void tickMembershipExpiry();
  }, intervalMs);
  timer.unref?.();
  void tickReminders();
  logger.info({ intervalMs }, 'reminder worker started');
}

export function stopReminderWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
