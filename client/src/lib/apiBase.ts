const fromEnv = (import.meta.env.VITE_API_URL as string | undefined | null)?.trim();

/** A leading-slash value stays same-origin (e.g. "/api"). */
const relativeBase = fromEnv && fromEnv.startsWith("/") ? fromEnv : undefined;

/**
 * Dev may point at an absolute API origin (override via VITE_API_URL).
 * Production builds are always same-origin: Netlify proxies /api and /uploads
 * to the backend (see netlify.toml), which keeps session/CSRF cookies first-party
 * instead of cross-site (cross-site cookies are blocked -> CSRF_INVALID / UNAUTHORIZED).
 */
export const API_BASE: string = import.meta.env.DEV ? fromEnv || "/api" : relativeBase || "/api";
