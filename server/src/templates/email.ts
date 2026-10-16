import { AppointmentDoc } from '../models/Appointment';
import { SalonSettingsDoc } from '../models/Salon';

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

const GOLD = '#C6A15B';
const INK = '#0B0B0C';
const CREAM = '#FAF7F2';

interface LayoutOptions {
  preheader?: string;
  heading: string;
  intro?: string;
  bodyHtml?: string;
  ctaText?: string;
  ctaUrl?: string;
  footerNote?: string;
  salonName?: string;
  salonAddress?: string;
  salonPhone?: string;
}

/** Responsive, inline-styled branded email shell (black / white / gold). */
export function baseEmailLayout(opts: LayoutOptions): string {
  const {
    preheader = '',
    heading,
    intro = '',
    bodyHtml = '',
    ctaText,
    ctaUrl,
    footerNote = '',
    salonName = 'SalonPro',
    salonAddress = '',
    salonPhone = '',
  } = opts;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ECE7DC;">
      <tr>
        <td style="background:${INK};padding:26px 32px;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;letter-spacing:0.5px;color:#ffffff;">
            ${escapeHtml(salonName)}<span style="color:${GOLD};">.</span>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:32px 32px 8px 32px;">
          <div style="height:3px;width:48px;background:${GOLD};border-radius:2px;margin-bottom:20px;"></div>
          <h1 style="margin:0 0 12px 0;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:600;color:${INK};">${escapeHtml(heading)}</h1>
          ${intro ? `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#444;">${intro}</p>` : ''}
          ${bodyHtml}
          ${
            ctaText && ctaUrl
              ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px 0;"><tr><td style="background:${GOLD};border-radius:8px;">
                   <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:12px 22px;color:${INK};font-weight:600;text-decoration:none;font-size:14px;">${escapeHtml(ctaText)}</a>
                 </td></tr></table>`
              : ''
          }
        </td>
      </tr>
      <tr>
        <td style="padding:20px 32px 28px 32px;">
          <div style="border-top:1px solid #ECE7DC;padding-top:16px;font-size:12px;line-height:1.6;color:#8a8a8a;">
            ${footerNote ? `<p style="margin:0 0 8px 0;">${footerNote}</p>` : ''}
            ${salonAddress ? `<p style="margin:0 0 4px 0;">${escapeHtml(salonAddress)}</p>` : ''}
            ${salonPhone ? `<p style="margin:0;">Phone / WhatsApp: ${escapeHtml(salonPhone)}</p>` : ''}
          </div>
        </td>
      </tr>
    </table>
    <div style="font-size:11px;color:#9a9a9a;margin-top:14px;">You received this email because of an appointment or account with ${escapeHtml(salonName)}.</div>
  </td></tr>
</table>
</body>
</html>`;
}

export function detailsTable(rows: { label: string; value: string; highlight?: boolean }[]): string {
  const body = rows
    .map(
      (r) => `<tr>
      <td style="padding:10px 0;border-bottom:1px solid #F0ECE3;font-size:13px;color:#8a8a8a;width:42%;">${escapeHtml(r.label)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #F0ECE3;font-size:14px;color:${r.highlight ? GOLD : INK};font-weight:${r.highlight ? '700' : '500'};text-align:right;">${escapeHtml(r.value)}</td>
    </tr>`
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px 0;">${body}</table>`;
}

export function salonFooter(settings?: Partial<SalonSettingsDoc>): {
  salonName: string;
  salonAddress: string;
  salonPhone: string;
} {
  const addr = settings?.address;
  return {
    salonName: settings?.salonName || 'SalonPro',
    salonAddress: addr
      ? [addr.line1, addr.line2, addr.city, addr.state, addr.postalCode, addr.country]
          .filter(Boolean)
          .join(', ')
      : '',
    salonPhone: settings?.phone || '',
  };
}

function money(value: number, symbol = '₹'): string {
  return `${symbol}${Number(value || 0).toFixed(2)}`;
}

function fmtDate(date: Date, timeZone = 'Asia/Kolkata'): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function fmtTime(date: Date, timeZone = 'Asia/Kolkata'): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

interface AppointmentEmailContext {
  appointment: Pick<
    AppointmentDoc,
    'reference' | 'date' | 'startsAt' | 'totalPrice' | 'depositAmount' | 'serviceSnapshot' | 'paymentStatus' | 'guest' | 'notes'
  >;
  customerName?: string;
  staffName?: string;
  settings?: Partial<SalonSettingsDoc>;
  manageUrl?: string;
  oldStart?: Date;
  reason?: string;
  byRole?: string;
}

function apptRows(ctx: AppointmentEmailContext) {
  const s = ctx.settings;
  const tz = s?.timezone || 'Asia/Kolkata';
  const symbol = s?.currency?.symbol || '₹';
  return [
    { label: 'Booking reference', value: ctx.appointment.reference, highlight: true },
    { label: 'Service', value: ctx.appointment.serviceSnapshot?.name ?? 'Service' },
    { label: 'Date', value: fmtDate(ctx.appointment.startsAt, tz) },
    { label: 'Time', value: fmtTime(ctx.appointment.startsAt, tz) },
    { label: 'Duration', value: `${ctx.appointment.serviceSnapshot?.durationMinutes ?? 0} minutes` },
    ...(ctx.staffName ? [{ label: 'Barber / Stylist', value: ctx.staffName }] : []),
    { label: 'Total price', value: money(ctx.appointment.totalPrice, symbol) },
    ...(ctx.appointment.depositAmount
      ? [{ label: 'Deposit', value: money(ctx.appointment.depositAmount, symbol) }]
      : []),
    { label: 'Payment status', value: paymentLabel(ctx.appointment.paymentStatus) },
  ];
}

export const templates = {
  bookingCreatedCustomer(ctx: AppointmentEmailContext): EmailContent {
    const f = salonFooter(ctx.settings);
    const pending = ctx.appointment.paymentStatus === 'deposit_paid';
    const heading = 'Your appointment is booked';
    const intro = `Hi ${escapeHtml(ctx.customerName || 'there')}, thanks for booking with ${escapeHtml(f.salonName)}. Here are your appointment details.`;
    const body =
      detailsTable(apptRows(ctx)) +
      (ctx.appointment.notes
        ? `<p style="font-size:13px;color:#666;">Your note: ${escapeHtml(ctx.appointment.notes)}</p>`
        : '');
    return {
      subject: `Booking confirmed — ${ctx.appointment.reference} · ${fmtDate(ctx.appointment.startsAt, ctx.settings?.timezone)}`,
      html: baseEmailLayout({
        preheader: `Appointment ${ctx.appointment.reference} on ${fmtDate(ctx.appointment.startsAt, ctx.settings?.timezone)}`,
        heading,
        intro,
        bodyHtml: body,
        ctaText: ctx.manageUrl ? 'Manage my booking' : undefined,
        ctaUrl: ctx.manageUrl,
        footerNote: 'Need to change something? Use the button above or contact us directly.',
        ...f,
      }),
      text: textVersion(heading, ctx),
    };
  },

  bookingPendingApprovalCustomer(ctx: AppointmentEmailContext): EmailContent {
    const f = salonFooter(ctx.settings);
    const heading = 'Booking received — pending approval';
    return {
      subject: `Booking received (pending approval) — ${ctx.appointment.reference}`,
      html: baseEmailLayout({
        preheader: 'We have received your booking request',
        heading,
        intro: `Hi ${escapeHtml(ctx.customerName || 'there')}, we have received your booking request. Our team will confirm it shortly and you will get another email once it is approved.`,
        bodyHtml: detailsTable(apptRows(ctx)),
        ctaText: ctx.manageUrl ? 'View booking' : undefined,
        ctaUrl: ctx.manageUrl,
        ...f,
      }),
      text: textVersion(heading, ctx),
    };
  },

  bookingRescheduled(ctx: AppointmentEmailContext): EmailContent {
    const f = salonFooter(ctx.settings);
    const tz = ctx.settings?.timezone || 'Asia/Kolkata';
    const heading = 'Your appointment was rescheduled';
    const oldLine = ctx.oldStart
      ? `<p style="font-size:13px;color:#666;">Previous slot: ${escapeHtml(fmtDate(ctx.oldStart, tz))} at ${escapeHtml(fmtTime(ctx.oldStart, tz))}</p>`
      : '';
    return {
      subject: `Rescheduled — ${ctx.appointment.reference} now on ${fmtDate(ctx.appointment.startsAt, tz)}`,
      html: baseEmailLayout({
        preheader: 'New appointment time confirmed',
        heading,
        intro: `Hi ${escapeHtml(ctx.customerName || 'there')}, your appointment has been moved to the new time below.`,
        bodyHtml: oldLine + detailsTable(apptRows(ctx)),
        ctaText: ctx.manageUrl ? 'View booking' : undefined,
        ctaUrl: ctx.manageUrl,
        ...f,
      }),
      text: textVersion(heading, ctx),
    };
  },

  bookingConfirmed(ctx: AppointmentEmailContext): EmailContent {
    const f = salonFooter(ctx.settings);
    const heading = 'Your appointment is confirmed';
    return {
      subject: `Confirmed — ${ctx.appointment.reference} on ${fmtDate(ctx.appointment.startsAt, ctx.settings?.timezone)}`,
      html: baseEmailLayout({
        preheader: 'Your appointment is confirmed',
        heading,
        intro: `Hi ${escapeHtml(ctx.customerName || 'there')}, great news — your appointment is confirmed. We look forward to seeing you.`,
        bodyHtml: detailsTable(apptRows(ctx)),
        ctaText: ctx.manageUrl ? 'Manage my booking' : undefined,
        ctaUrl: ctx.manageUrl,
        ...f,
      }),
      text: textVersion(heading, ctx),
    };
  },

  bookingCancelled(ctx: AppointmentEmailContext): EmailContent {
    const f = salonFooter(ctx.settings);
    const tz = ctx.settings?.timezone || 'Asia/Kolkata';
    const heading = 'Your appointment was cancelled';
    return {
      subject: `Cancelled — ${ctx.appointment.reference} (${fmtDate(ctx.appointment.startsAt, tz)})`,
      html: baseEmailLayout({
        preheader: 'Appointment cancellation notice',
        heading,
        intro: `Hi ${escapeHtml(ctx.customerName || 'there')}, the appointment below has been cancelled${
          ctx.byRole ? ` by our ${escapeHtml(ctx.byRole)}` : ''
        }.`,
        bodyHtml:
          detailsTable(apptRows(ctx)) +
          (ctx.reason ? `<p style="font-size:13px;color:#666;">Reason: ${escapeHtml(ctx.reason)}</p>` : ''),
        footerNote: 'You can book a new appointment any time on our website.',
        ...f,
      }),
      text: textVersion(heading, ctx),
    };
  },

  appointmentReminder(ctx: AppointmentEmailContext): EmailContent {
    const f = salonFooter(ctx.settings);
    const heading = 'Reminder: your appointment is coming up';
    return {
      subject: `Reminder — ${ctx.appointment.reference} at ${fmtTime(ctx.appointment.startsAt, ctx.settings?.timezone)}`,
      html: baseEmailLayout({
        preheader: 'Appointment reminder',
        heading,
        intro: `Hi ${escapeHtml(ctx.customerName || 'there')}, this is a friendly reminder about your upcoming appointment.`,
        bodyHtml: detailsTable(apptRows(ctx)),
        ctaText: ctx.manageUrl ? 'View / manage booking' : undefined,
        ctaUrl: ctx.manageUrl,
        ...f,
      }),
      text: textVersion(heading, ctx),
    };
  },

  newBookingOwner(ctx: AppointmentEmailContext & { customerPhone?: string; customerEmail?: string }): EmailContent {
    const f = salonFooter(ctx.settings);
    const heading = 'New booking received';
    return {
      subject: `New booking ${ctx.appointment.reference} — ${fmtDate(ctx.appointment.startsAt, ctx.settings?.timezone)} ${fmtTime(ctx.appointment.startsAt, ctx.settings?.timezone)}`,
      html: baseEmailLayout({
        preheader: 'A new booking was made',
        heading,
        intro: 'A new appointment was booked online. Details below.',
        bodyHtml: detailsTable([
          ...apptRows(ctx),
          { label: 'Customer', value: ctx.customerName || ctx.appointment.guest?.name || 'Guest' },
          { label: 'Phone', value: ctx.customerPhone || ctx.appointment.guest?.phone || '—' },
          { label: 'Email', value: ctx.customerEmail || ctx.appointment.guest?.email || '—' },
        ]),
        ctaText: 'Open in CRM',
        ctaUrl: ctx.manageUrl,
        ...f,
      }),
      text: textVersion(heading, ctx),
    };
  },

  staffAssigned(ctx: AppointmentEmailContext): EmailContent {
    const f = salonFooter(ctx.settings);
    const heading = 'A booking was assigned to you';
    return {
      subject: `Assigned: ${ctx.appointment.serviceSnapshot?.name ?? 'Service'} — ${fmtTime(ctx.appointment.startsAt, ctx.settings?.timezone)} (${ctx.appointment.reference})`,
      html: baseEmailLayout({
        preheader: 'New appointment assignment',
        heading,
        intro: `Hi ${escapeHtml(ctx.staffName || 'there')}, the following appointment has been assigned to you.`,
        bodyHtml: detailsTable([
          { label: 'Booking reference', value: ctx.appointment.reference, highlight: true },
          { label: 'Service', value: ctx.appointment.serviceSnapshot?.name ?? 'Service' },
          { label: 'Date', value: fmtDate(ctx.appointment.startsAt, ctx.settings?.timezone) },
          { label: 'Time', value: fmtTime(ctx.appointment.startsAt, ctx.settings?.timezone) },
          { label: 'Duration', value: `${ctx.appointment.serviceSnapshot?.durationMinutes ?? 0} minutes` },
          { label: 'Customer', value: ctx.customerName || 'Guest' },
        ]),
        ctaText: 'Open staff panel',
        ctaUrl: ctx.manageUrl,
        footerNote: 'Customer contact details are available in your staff panel for this booking only.',
        ...f,
      }),
      text: textVersion(heading, ctx),
    };
  },

  paymentSuccess(ctx: AppointmentEmailContext & { amount: number; method: string }): EmailContent {
    const f = salonFooter(ctx.settings);
    const tz = ctx.settings?.timezone || 'Asia/Kolkata';
    const symbol = ctx.settings?.currency?.symbol || '₹';
    const heading = 'Payment received';
    return {
      subject: `Payment received — ${ctx.appointment.reference}`,
      html: baseEmailLayout({
        preheader: 'Payment received successfully',
        heading,
        intro: `Hi ${escapeHtml(ctx.customerName || 'there')}, we have received your payment. Thank you!`,
        bodyHtml: detailsTable([
          { label: 'Amount', value: money(ctx.amount, symbol), highlight: true },
          { label: 'Method', value: ctx.method },
          { label: 'Booking reference', value: ctx.appointment.reference },
          { label: 'Service', value: ctx.appointment.serviceSnapshot?.name ?? 'Service' },
          { label: 'Appointment', value: `${fmtDate(ctx.appointment.startsAt, tz)} at ${fmtTime(ctx.appointment.startsAt, tz)}` },
        ]),
        footerNote: 'This is your payment receipt. Please keep it for your records.',
        ...f,
      }),
      text: textVersion(heading, ctx),
    };
  },

  passwordReset(name: string, resetUrl: string, settings?: Partial<SalonSettingsDoc>): EmailContent {
    const f = salonFooter(settings);
    return {
      subject: 'Reset your password',
      html: baseEmailLayout({
        preheader: 'Password reset link',
        heading: 'Reset your password',
        intro: `Hi ${escapeHtml(name)}, we received a request to reset your password. This link expires in 60 minutes.`,
        bodyHtml:
          '<p style="font-size:13px;color:#666;">If you did not request a password reset, you can safely ignore this email — your password will not change.</p>',
        ctaText: 'Set a new password',
        ctaUrl: resetUrl,
        ...f,
      }),
      text: `Reset your password (expires in 60 minutes): ${resetUrl}`,
    };
  },

  membershipExpiring(ctx: {
    customerName: string;
    planName: string;
    validUntil: Date;
    remaining: { serviceName: string; left: number }[];
    settings?: Partial<SalonSettingsDoc>;
  }): EmailContent {
    const f = salonFooter(ctx.settings);
    return {
      subject: `Your ${ctx.planName} expires soon`,
      html: baseEmailLayout({
        preheader: 'Membership expiry reminder',
        heading: 'Your package is expiring soon',
        intro: `Hi ${escapeHtml(ctx.customerName)}, your ${escapeHtml(ctx.planName)} is valid until ${escapeHtml(
          fmtDate(ctx.validUntil, ctx.settings?.timezone)
        )}.`,
        bodyHtml: ctx.remaining.length
          ? detailsTable(ctx.remaining.map((r) => ({ label: r.serviceName, value: `${r.left} session(s) left` })))
          : '',
        footerNote: 'Visit the salon or contact us to renew and keep your benefits.',
        ...f,
      }),
      text: `${ctx.planName} expires on ${ctx.validUntil.toDateString()}.`,
    };
  },
};

function paymentLabel(status: string): string {
  const map: Record<string, string> = {
    unpaid: 'Not paid',
    deposit_paid: 'Deposit paid',
    paid: 'Paid in full',
    partially_paid: 'Partially paid',
    refunded: 'Refunded',
  };
  return map[status] ?? status;
}

function textVersion(heading: string, ctx: AppointmentEmailContext): string {
  const tz = ctx.settings?.timezone || 'Asia/Kolkata';
  return [
    heading,
    '',
    `Booking reference: ${ctx.appointment.reference}`,
    `Service: ${ctx.appointment.serviceSnapshot?.name ?? 'Service'}`,
    `Date: ${fmtDate(ctx.appointment.startsAt, tz)}`,
    `Time: ${fmtTime(ctx.appointment.startsAt, tz)}`,
    ctx.staffName ? `Barber/Stylist: ${ctx.staffName}` : '',
    `Total: ${ctx.appointment.totalPrice}`,
    ctx.manageUrl ? `Manage booking: ${ctx.manageUrl}` : '',
    '',
    ctx.settings?.salonName || 'SalonPro',
  ]
    .filter(Boolean)
    .join('\n');
}

export function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
