import { Request } from 'express';

export interface Pagination {
  page: number;
  limit: number;
  skip: number;
  sort: Record<string, 1 | -1>;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const DEFAULT_SORT = '-createdAt';

export function parsePagination(req: Request, defaultSort = DEFAULT_SORT): Pagination {
  const q = req.query as Record<string, string | undefined>;
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
  const skip = (page - 1) * limit;
  const sort = parseSort(q.sort ?? defaultSort);
  return { page, limit, skip, sort };
}

export function parseSort(input: string): Record<string, 1 | -1> {
  const sort: Record<string, 1 | -1> = {};
  for (const part of input.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('-')) sort[trimmed.slice(1)] = -1;
    else sort[trimmed] = 1;
  }
  if (Object.keys(sort).length === 0) sort.createdAt = -1;
  return sort;
}

export function buildListResponse<T>(data: T[], total: number, p: Pagination) {
  return {
    data,
    meta: {
      page: p.page,
      limit: p.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / p.limit)),
    } satisfies PageMeta,
  };
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive "contains" regex for search fields. */
export function searchRegex(value: string) {
  return new RegExp(escapeRegex(value.trim()), 'i');
}
