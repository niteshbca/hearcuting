import { Types } from 'mongoose';
import { Notification } from '../models/Salon';
import { logger } from '../config/logger';
import { Role } from '../utils/permissions';

export interface NotifyInput {
  user?: string; // target user id
  role?: Role; // or broadcast to a role
  type: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}

/** Creates an in-app notification (fire and forget safe). */
export async function createNotification(input: NotifyInput): Promise<void> {
  try {
    await Notification.create({
      user: input.user ? new Types.ObjectId(input.user) : undefined,
      role: input.role,
      type: input.type,
      title: input.title,
      body: input.body ?? '',
      data: input.data,
    });
  } catch (err) {
    logger.error({ err, type: input.type }, 'failed to create notification');
  }
}

export async function notifyStaffAssignment(staffUserId: string | undefined, params: {
  appointmentId: string;
  reference: string;
  serviceName: string;
  startsAt: Date;
  customerName: string;
}): Promise<void> {
  if (!staffUserId) return;
  await createNotification({
    user: staffUserId,
    type: 'appointment_assigned',
    title: `New assignment: ${params.serviceName}`,
    body: `${params.customerName} · ${params.reference} · ${params.startsAt.toISOString()}`,
    data: { appointmentId: params.appointmentId, reference: params.reference },
  });
}

export async function notifyRole(
  role: Role,
  type: string,
  title: string,
  body?: string,
  data?: Record<string, unknown>
): Promise<void> {
  await createNotification({ role, type, title, body, data });
}
