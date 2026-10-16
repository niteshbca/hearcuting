import { env } from '../config/env';

const DAY_KEYS = ['0', '1', '2', '3', '4', '5', '6'];

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsFormatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      weekday: 'short',
    });
    partsFormatterCache.set(timeZone, f);
  }
  return f;
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0=Sunday
}

export function localParts(date: Date, timeZone = env().TIMEZONE): LocalParts {
  const parts = partsFormatter(timeZone).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: WEEKDAY_INDEX[get('weekday')] ?? 0,
  };
}

export function localDateKey(date: Date = new Date(), timeZone = env().TIMEZONE): string {
  const p = localParts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function localTimeHHMM(date: Date = new Date(), timeZone = env().TIMEZONE): string {
  const p = localParts(date, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function localWeekday(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay();
}

/** Convert a salon-local date + HH:mm into a UTC Date. */
export function zonedTimeToUTC(dateKey: string, timeHHMM: string, timeZone = env().TIMEZONE): Date {
  const [h, m] = timeHHMM.split(':').map(Number);
  // Guess: treat as UTC then correct by the zone offset at that instant (two passes for DST edges).
  let guess = new Date(Date.UTC(
    Number(dateKey.slice(0, 4)),
    Number(dateKey.slice(5, 7)) - 1,
    Number(dateKey.slice(8, 10)),
    h,
    m,
    0,
    0
  ));
  for (let i = 0; i < 2; i++) {
    const p = localParts(guess, timeZone);
    const desiredAsUTC = Date.UTC(
      p.year === Number(dateKey.slice(0, 4)) ? Number(dateKey.slice(0, 4)) : Number(dateKey.slice(0, 4)),
      Number(dateKey.slice(5, 7)) - 1,
      Number(dateKey.slice(8, 10)),
      h,
      m
    );
    const actualAsUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const diff = desiredAsUTC - actualAsUTC;
    if (diff === 0) break;
    guess = new Date(guess.getTime() + diff);
  }
  return guess;
}

export function dateKeyToUTCStart(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00Z`);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}

export function timeToMinutes(timeHHMM: string): number {
  const [h, m] = timeHHMM.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const m = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

export function startOfLocalDay(dateKey: string, timeZone = env().TIMEZONE): Date {
  return zonedTimeToUTC(dateKey, '00:00', timeZone);
}

export function endOfLocalDay(dateKey: string, timeZone = env().TIMEZONE): Date {
  const next = addDays(dateKey, 1);
  return zonedTimeToUTC(next, '00:00', timeZone);
}

export function todayRange(timeZone = env().TIMEZONE): { from: Date; to: Date; dateKey: string } {
  const dateKey = localDateKey(new Date(), timeZone);
  return { from: startOfLocalDay(dateKey, timeZone), to: endOfLocalDay(dateKey, timeZone), dateKey };
}

export function monthRange(dateKey: string, timeZone = env().TIMEZONE): { from: Date; to: Date } {
  return {
    from: startOfLocalDay(dateKey.slice(0, 7) + '-01', timeZone),
    to: endOfLocalDay(dateKey.slice(0, 7) + '-31', timeZone),
  };
}

export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export { DAY_KEYS };

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
