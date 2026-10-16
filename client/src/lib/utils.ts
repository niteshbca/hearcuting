import { clsx, type ClassValue } from "clsx";
import { format, isValid, parseISO } from "date-fns";
import { twMerge } from "tailwind-merge";
import type { AxiosError } from "axios";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export interface ApiErrorEnvelope {
  code: string;
  message: string;
  details?: unknown[];
}

export function formatCurrency(
  amount: number,
  currency = "₹",
  locale = "en-IN",
): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency === "₹" ? "INR" : currency,
      maximumFractionDigits: safe % 1 === 0 ? 0 : 2,
      minimumFractionDigits: 0,
    }).format(safe);
  } catch {
    return `${currency}${safe.toLocaleString(locale)}`;
  }
}

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return isValid(value) ? value : null;
  const parsed = typeof value === "number" ? new Date(value) : parseISO(String(value));
  return isValid(parsed) ? parsed : null;
}

export function formatDate(
  value: string | number | Date | null | undefined,
  pattern = "dd MMM yyyy",
): string {
  const d = toDate(value);
  if (!d) return "—";
  return format(d, pattern);
}

export function formatTime(
  value: string | number | Date | null | undefined,
  pattern = "hh:mm a",
): string {
  const d = toDate(value);
  if (!d) return "—";
  return format(d, pattern);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function truncate(value: string, max = 80): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isAxiosError(error: unknown): error is AxiosError<{ error?: ApiErrorEnvelope }> {
  return typeof error === "object" && error !== null && "isAxiosError" in error;
}

export function parseApiError(error: unknown): ApiErrorEnvelope {
  if (isAxiosError(error)) {
    const status = error.response?.status;
    const envelope = error.response?.data?.error;
    if (envelope && typeof envelope.message === "string") {
      return {
        code: envelope.code ?? (status ? `HTTP_${status}` : "UNKNOWN"),
        message: envelope.message,
        details: envelope.details,
      };
    }
    if (status) {
      const fallback =
        status === 401
          ? "Your session has expired. Please sign in again."
          : status === 403
            ? "You do not have permission to perform this action."
            : status === 404
              ? "The requested resource was not found."
              : status === 429
                ? "Too many requests. Please slow down and try again."
                : status >= 500
                  ? "Something went wrong on our side. Please try again shortly."
                  : "Request failed.";
      return { code: `HTTP_${status}`, message: fallback };
    }
    if (error.code === "ECONNABORTED") {
      return { code: "TIMEOUT", message: "The request timed out. Please try again." };
    }
    if (error.message) {
      return { code: error.code ?? "NETWORK_ERROR", message: "Unable to reach the server. Check your connection." };
    }
  }
  if (error instanceof Error && error.message) {
    return { code: "UNKNOWN", message: error.message };
  }
  return { code: "UNKNOWN", message: "Something went wrong. Please try again." };
}

export function getQueryParams(search: string | URLSearchParams): Record<string, string> {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const out: Record<string, string> = {};
  params.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match && match[1] ? decodeURIComponent(match[1]) : null;
}
