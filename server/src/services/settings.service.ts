import { SalonSettings, SalonSettingsDoc } from '../models/Salon';
import { BusinessHours } from '../models/Schedule';
import { Types } from 'mongoose';

export const SETTINGS_KEY = 'general';

const DEFAULT_HOURS: Record<number, { isOpen: boolean; openTime: string; closeTime: string }> = {
  0: { isOpen: true, openTime: '11:00', closeTime: '19:00' },
  1: { isOpen: false, openTime: '10:00', closeTime: '21:00' },
  2: { isOpen: true, openTime: '10:00', closeTime: '21:00' },
  3: { isOpen: true, openTime: '10:00', closeTime: '21:00' },
  4: { isOpen: true, openTime: '10:00', closeTime: '21:00' },
  5: { isOpen: true, openTime: '10:00', closeTime: '21:00' },
  6: { isOpen: true, openTime: '10:00', closeTime: '21:00' },
};

/** Returns the singleton settings document, creating defaults on first use. */
export async function getSettings(): Promise<SalonSettingsDoc> {
  const existing = await SalonSettings.findOne({ key: SETTINGS_KEY });
  if (existing) return existing;
  return SalonSettings.create({ key: SETTINGS_KEY });
}

export async function updateSettings(
  patch: Record<string, unknown>,
  updatedBy?: string
): Promise<SalonSettingsDoc> {
  const settings = await getSettings();
  const allowed = [
    'salonName',
    'tagline',
    'logoUrl',
    'address',
    'phone',
    'whatsapp',
    'email',
    'social',
    'currency',
    'timezone',
    'aboutText',
    'heroImages',
    'galleryImages',
    'booking',
    'notifications',
    'payments',
    'privacyPolicyText',
    'termsText',
  ] as const;

  for (const key of allowed) {
    if (patch[key] !== undefined) {
      (settings as unknown as Record<string, unknown>)[key] = patch[key];
    }
  }
  if (updatedBy) settings.updatedBy = new Types.ObjectId(updatedBy);
  await settings.save();
  return settings;
}

export interface PublicSettings {
  salonName: string;
  tagline: string;
  logoUrl: string;
  address: SalonSettingsDoc['address'];
  phone: string;
  whatsapp: string;
  email: string;
  social: SalonSettingsDoc['social'];
  currency: { code: string; symbol: string };
  timezone: string;
  aboutText: string;
  heroImages: string[];
  galleryImages: SalonSettingsDoc['galleryImages'];
  booking: {
    autoConfirm: boolean;
    allowGuest: boolean;
    maxAdvanceDays: number;
    minNoticeHours: number;
    slotIntervalMinutes: number;
    requireDeposit: boolean;
    depositPercent: number;
    rescheduleCutoffHours: number;
    cancelCutoffHours: number;
    cancellationPolicyText: string;
    noShowFeePercent: number;
  };
  payments: { onlinePaymentsEnabled: boolean; showPrices: boolean };
  privacyPolicyText: string;
  termsText: string;
}

/** Strips anything that must not be public (deposit secrets, SMTP, etc). */
export function toPublicSettings(s: SalonSettingsDoc): PublicSettings {
  return {
    salonName: s.salonName,
    tagline: s.tagline,
    logoUrl: s.logoUrl,
    address: s.address,
    phone: s.phone,
    whatsapp: s.whatsapp,
    email: s.email,
    social: s.social,
    currency: s.currency,
    timezone: s.timezone,
    aboutText: s.aboutText,
    heroImages: s.heroImages,
    galleryImages: s.galleryImages,
    booking: {
      autoConfirm: s.booking.autoConfirm,
      allowGuest: s.booking.allowGuest,
      maxAdvanceDays: s.booking.maxAdvanceDays,
      minNoticeHours: s.booking.minNoticeHours,
      slotIntervalMinutes: s.booking.slotIntervalMinutes,
      requireDeposit: s.booking.requireDeposit,
      depositPercent: s.booking.depositPercent,
      rescheduleCutoffHours: s.booking.rescheduleCutoffHours,
      cancelCutoffHours: s.booking.cancelCutoffHours,
      cancellationPolicyText: s.booking.cancellationPolicyText,
      noShowFeePercent: s.booking.noShowFeePercent,
    },
    payments: s.payments,
    privacyPolicyText: s.privacyPolicyText,
    termsText: s.termsText,
  };
}

/** Ensures a full 7-day business hours set exists. */
export async function ensureBusinessHours(): Promise<void> {
  const count = await BusinessHours.estimatedDocumentCount();
  if (count >= 7) return;
  for (let day = 0; day <= 6; day++) {
    const cfg = DEFAULT_HOURS[day];
    await BusinessHours.updateOne(
      { dayOfWeek: day },
      { $setOnInsert: { dayOfWeek: day, ...cfg } },
      { upsert: true }
    );
  }
}

export async function getBusinessHours() {
  await ensureBusinessHours();
  return BusinessHours.find().sort({ dayOfWeek: 1 }).lean();
}

export async function setBusinessHours(
  days: { dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string }[]
): Promise<void> {
  for (const day of days) {
    await BusinessHours.updateOne(
      { dayOfWeek: day.dayOfWeek },
      { $set: { isOpen: day.isOpen, openTime: day.openTime, closeTime: day.closeTime } },
      { upsert: true }
    );
  }
}
