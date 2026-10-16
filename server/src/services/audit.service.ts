import { Types } from 'mongoose';
import { AuditLog } from '../models/Salon';
import { logger } from '../config/logger';
import { redact } from '../utils/redact';

export interface AuditActor {
  userId?: string;
  role?: string;
  ip?: string;
  userAgent?: string;
}

export interface AuditInput {
  actor?: AuditActor;
  action: string; // e.g. 'appointment.create'
  entity: string; // e.g. 'Appointment'
  entityId?: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Writes an audit trail entry. Never throws into the request flow —
 * audit failures are logged but must not break business operations.
 */
export async function logAudit(input: AuditInput): Promise<void> {
  try {
    await AuditLog.create({
      actor: input.actor?.userId ? new Types.ObjectId(input.actor.userId) : undefined,
      actorRole: input.actor?.role,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      before: input.before === undefined ? undefined : redact(input.before),
      after: input.after === undefined ? undefined : redact(input.after),
      ip: input.actor?.ip,
      userAgent: input.actor?.userAgent,
    });
  } catch (err) {
    logger.error({ err, action: input.action }, 'failed to write audit log');
  }
}

/** Structured change snapshot helper (only changed top-level keys). */
export function diffSnapshot(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const b = before[key];
    const a = after[key];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      changedBefore[key] = b;
      changedAfter[key] = a;
    }
  }
  return { before: changedBefore, after: changedAfter };
}
