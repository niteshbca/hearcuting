import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";
import type { PaginationMeta } from "@/types";
import { getCookie } from "@/lib/utils";

export type ApiList<T> = {
  data: T[];
  meta: PaginationMeta;
};

/**
 * Mongo documents arrive with `_id` and sometimes `__v`. We expose a stable
 * `id` field to the whole SPA, so every response is normalized once here.
 * `_id` is preserved for endpoints that still need it.
 */
function normalizeDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeDeep);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (key === "__v") continue;
      out[key] = normalizeDeep(val);
    }
    if (out._id !== undefined && out.id === undefined) {
      out.id = String(out._id);
    }
    return out;
  }
  return value;
}

const baseURL = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

export const api: AxiosInstance = axios.create({
  baseURL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

const NON_MUTATING = new Set(["get", "head", "options", "GET", "HEAD", "OPTIONS"]);
const AUTH_SKIP_PATHS = ["/auth/login", "/auth/refresh", "/auth/register", "/auth/csrf"];
const AUTH_NO_REDIRECT_PATHS = ["/auth/me"];

function attachCsrf(config: InternalAxiosRequestConfig): void {
  const method = (config.method ?? "get").toLowerCase();
  if (NON_MUTATING.has(method)) return;
  const token = getCookie("sp_csrf");
  if (!token) return;
  const headers = AxiosHeaders.from(config.headers);
  headers.set("x-csrf-token", token);
  config.headers = headers;
}

api.interceptors.request.use((config) => {
  attachCsrf(config);
  return config;
});

let refreshPromise: Promise<boolean> | null = null;

async function performRefresh(): Promise<boolean> {
  try {
    await axios.post(`${baseURL}/auth/refresh`, null, { withCredentials: true });
    return true;
  } catch {
    return false;
  }
}

function requestPath(url: string | undefined): string {
  if (!url) return "";
  return url.startsWith("http") ? url.replace(/^https?:\/\/[^/]+/, "") : url;
}

function shouldSkipAuthRetry(url: string | undefined): boolean {
  const path = requestPath(url);
  return AUTH_SKIP_PATHS.some((p) => path.includes(p));
}

function shouldSkipRedirect(url: string | undefined): boolean {
  const path = requestPath(url);
  return AUTH_NO_REDIRECT_PATHS.some((p) => path.includes(p));
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const status = error.response?.status;

    if (
      status === 401 &&
      original &&
      !original._retried &&
      !shouldSkipAuthRetry(original.url)
    ) {
      original._retried = true;
      if (!refreshPromise) {
        refreshPromise = performRefresh().finally(() => {
          refreshPromise = null;
        });
      }
      const refreshed = await refreshPromise;
      if (refreshed) {
        return api.request(original);
      }
      if (typeof window !== "undefined") {
        const here = `${window.location.pathname}${window.location.search}`;
        const onLogin = window.location.pathname.startsWith("/login") ||
          window.location.pathname.startsWith("/admin/login");
        window.dispatchEvent(new CustomEvent("auth:logout"));
        if (!onLogin && !shouldSkipRedirect(original.url)) {
          const from = encodeURIComponent(here);
          const target = window.location.pathname.startsWith("/admin")
            ? `/admin/login?from=${from}`
            : `/login?from=${from}`;
          window.location.assign(target);
        }
      }
    }

    return Promise.reject(error);
  },
);

export async function apiGet<T>(
  url: string,
  params?: Record<string, string | number | boolean | undefined | null>,
  config?: AxiosRequestConfig,
): Promise<T> {
  const res = await api.get<{ data: T }>(url, { ...config, params: cleanParams(params) });
  return normalizeDeep(res.data.data) as T;
}

export async function apiGetList<T>(
  url: string,
  params?: Record<string, string | number | boolean | undefined | null>,
  config?: AxiosRequestConfig,
): Promise<ApiList<T>> {
  const res = await api.get<ApiList<T>>(url, { ...config, params: cleanParams(params) });
  return {
    data: (normalizeDeep(res.data.data ?? []) as T[]) ?? [],
    meta: res.data.meta ?? emptyMeta(),
  };
}

export async function apiPost<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const res = await api.post<{ data: T }>(url, body, config);
  return normalizeDeep(res.data.data) as T;
}

export async function apiPut<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const res = await api.put<{ data: T }>(url, body, config);
  return normalizeDeep(res.data.data) as T;
}

export async function apiPatch<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const res = await api.patch<{ data: T }>(url, body, config);
  return normalizeDeep(res.data.data) as T;
}

export async function apiDelete<T = void>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await api.delete<{ data: T }>(url, config);
  return normalizeDeep(res.data.data) as T;
}

function emptyMeta(): PaginationMeta {
  return { page: 1, limit: 20, total: 0, totalPages: 0 };
}

function cleanParams(
  params?: Record<string, string | number | boolean | undefined | null>,
): Record<string, string | number | boolean> | undefined {
  if (!params) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export default api;
