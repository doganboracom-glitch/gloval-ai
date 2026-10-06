import type { CustomDomain } from './types'

/**
 * Page model for the customer's domain inventory. Pure and client-safe.
 *
 * `total` is the real row count for the owner, never `items.length`, so the UI
 * can never present a truncated list as the whole inventory.
 */

export const DOMAIN_PAGE_SIZE = 25
export const DOMAIN_PAGE_SIZE_MAX = 100

export type DomainPageRequest = { page: number; pageSize: number }

export type DomainPage = {
  items: CustomDomain[]
  total: number
  /** 1-based, already clamped to an existing page. */
  page: number
  pageSize: number
}

/** Coerces untrusted client input into a valid 1-based page and a bounded page size. */
export function normalizePageRequest(input: { page?: unknown; pageSize?: unknown } = {}): DomainPageRequest {
  const rawPage = Number(input.page)
  const rawSize = Number(input.pageSize)
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1
  const pageSize =
    Number.isFinite(rawSize) && rawSize >= 1 ? Math.min(Math.floor(rawSize), DOMAIN_PAGE_SIZE_MAX) : DOMAIN_PAGE_SIZE
  return { page, pageSize }
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize))
}

/** Zero-based inclusive row range for Supabase `.range()`. */
export function pageRange(page: number, pageSize: number): { from: number; to: number } {
  const from = (page - 1) * pageSize
  return { from, to: from + pageSize - 1 }
}

/** Reasons a page read can fail, so the UI can react without parsing messages. */
export type DomainListErrorKind = 'unauthenticated' | 'rate_limited' | 'temporary' | 'unexpected'

export type DomainPageResult =
  | { ok: true; data: DomainPage }
  | { ok: false; kind: DomainListErrorKind; retryAfterMs?: number }

/** Transient network / upstream failures are worth retrying; everything else is not. */
export function classifyListError(error: unknown): DomainListErrorKind {
  const text = [
    error instanceof Error ? error.name : '',
    error instanceof Error ? error.message : '',
    typeof error === 'object' && error !== null && 'message' in error ? String((error as { message: unknown }).message) : '',
    typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : '',
  ]
    .join(' ')
    .toLowerCase()
  if (/fetch failed|timeout|timed out|econnreset|econnrefused|enotfound|network|502|503|504|57014|08006|08001/.test(text)) {
    return 'temporary'
  }
  return 'unexpected'
}
