import nodemailer, { Transporter } from 'nodemailer';
import { env, smtpConfigured } from '../config/env';
import { logger } from '../config/logger';
import { EmailDeliveryLog } from '../models/Salon';

let transport: Transporter | null = null;

export function isSmtpConfigured(): boolean {
  return smtpConfigured();
}

function getTransport(): Transporter {
  if (transport) return transport;
  const e = env();
  if (smtpConfigured()) {
    transport = nodemailer.createTransport({
      host: e.SMTP_HOST,
      port: e.SMTP_PORT ?? 587,
      secure: e.SMTP_SECURE === true,
      auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASS } : undefined,
      pool: true,
      maxConnections: 3,
    });
  } else {
    // Development fallback: nodemailer's JSON transport accepts the message
    // without sending anything. Logs record transport: 'json'.
    transport = nodemailer.createTransport({ jsonTransport: true });
  }
  return transport;
}

export function fromAddress(): string {
  const e = env();
  return `"${e.SMTP_FROM_NAME}" <${e.SMTP_FROM || 'no-reply@salonpro.local'}>`;
}

export interface EnqueueEmailInput {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
  template: string;
  relatedType?: string;
  relatedId?: string;
  /** Unique key that guarantees the same email is never queued twice. */
  dedupeKey: string;
  maxAttempts?: number;
}

/**
 * Queues an email for the background worker. Idempotent: re-enqueuing the
 * same dedupeKey returns the existing log entry without duplicating.
 */
export async function enqueueEmail(input: EnqueueEmailInput): Promise<{ queued: boolean; id: string }> {
  const existing = await EmailDeliveryLog.findOne({ dedupeKey: input.dedupeKey }).select('_id').lean();
  if (existing) return { queued: false, id: String(existing._id) };

  try {
    const log = await EmailDeliveryLog.create({
      to: input.to.toLowerCase(),
      toName: input.toName,
      subject: input.subject,
      template: input.template,
      relatedType: input.relatedType,
      relatedId: input.relatedId,
      status: 'queued',
      transport: smtpConfigured() ? 'smtp' : 'json',
      dedupeKey: input.dedupeKey,
      maxAttempts: input.maxAttempts ?? 5,
      nextAttemptAt: new Date(),
      payload: { html: input.html, text: input.text ?? '' },
    });
    return { queued: true, id: String(log._id) };
  } catch (err) {
    // Duplicate key race — someone else queued it first.
    if ((err as { code?: number }).code === 11000) return { queued: false, id: '' };
    throw err;
  }
}

/** Attempts delivery of one queued email log entry. */
export async function attemptSend(logId: string): Promise<void> {
  const log = await EmailDeliveryLog.findByIdAndUpdate(
    logId,
    { $set: { status: 'sending' }, $inc: { attempts: 1 } },
    { new: true }
  );
  if (!log) return;

  try {
    const info = await getTransport().sendMail({
      from: fromAddress(),
      to: log.toName ? `"${log.toName}" <${log.to}>` : log.to,
      subject: log.subject,
      html: (log.payload?.html as string) || '<p></p>',
      text: (log.payload?.text as string) || undefined,
    });
    await EmailDeliveryLog.updateOne(
      { _id: log._id },
      {
        $set: {
          status: 'sent',
          sentAt: new Date(),
          providerMessageId: info.messageId,
          lastError: undefined,
          nextAttemptAt: undefined,
        },
      }
    );
    logger.info({ to: log.to, template: log.template, transport: smtpConfigured() ? 'smtp' : 'json' }, 'email sent');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'SMTP send failed';
    const attempts = log.attempts;
    const exhausted = attempts >= log.maxAttempts;
    const backoffMs = Math.min(60 * 60 * 1000, 2 ** attempts * 60 * 1000);
    await EmailDeliveryLog.updateOne(
      { _id: log._id },
      {
        $set: {
          status: exhausted ? 'failed' : 'retrying',
          lastError: message,
          nextAttemptAt: exhausted ? undefined : new Date(Date.now() + backoffMs),
        },
      }
    );
    logger.error({ to: log.to, template: log.template, attempts, exhausted, err: message }, 'email send failed');
  }
}

/** Worker tick: processes queued / retrying emails that are due. */
export async function processEmailQueue(batchSize = 10): Promise<number> {
  const due = await EmailDeliveryLog.find({
    status: { $in: ['queued', 'retrying'] },
    nextAttemptAt: { $lte: new Date() },
    $expr: { $lt: ['$attempts', '$maxAttempts'] },
  })
    .sort({ nextAttemptAt: 1 })
    .limit(batchSize)
    .select('_id')
    .lean();

  for (const item of due) {
    await attemptSend(String(item._id));
  }
  return due.length;
}

/** Admin-triggered retry for a failed email. */
export async function retryEmail(logId: string): Promise<boolean> {
  const res = await EmailDeliveryLog.updateOne(
    { _id: logId, status: { $in: ['failed', 'sent'] } },
    { $set: { status: 'queued', nextAttemptAt: new Date(), lastError: undefined } }
  );
  return res.modifiedCount > 0;
}
