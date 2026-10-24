import { createHash, randomBytes } from 'node:crypto'

export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const MAX_DRAFT_BYTES = 200_000
export const MAX_DRAFTS_PER_IP_PER_HOUR = 10
export const MAX_ACTIVE_DRAFTS_PER_EMAIL = 3
export const DRAFT_IP_WINDOW_MS = 60 * 60 * 1000
/** Consumed drafts are kept briefly so a second tab can still learn the project id. */
export const CONSUMED_DRAFT_GRACE_MS = 24 * 60 * 60 * 1000

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

export type DraftPayload = {
  name: string
  sector: string | null
  language: string
  prompt: string | null
  schema: unknown
  publishIntent: boolean
}

export function newClaimToken(): string {
  return randomBytes(32).toString('base64url')
}

export function isValidClaimToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_RE.test(value)
}

export function hashClaimToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function hashDraftIp(ip: string): string {
  return createHash('sha256').update(`signup-draft-ip:${ip}`).digest('hex')
}

/** Postgres undefined_table, or PostgREST's "table not found in schema cache". */
export function isMissingTableError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code
  return code === '42P01' || code === 'PGRST205'
}

function jsonBytes(value: unknown): number {
  try {
    const json = JSON.stringify(value)
    return json === undefined ? 0 : Buffer.byteLength(json, 'utf8')
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

export function normalizeDraftEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function draftExpiry(now: number): string {
  return new Date(now + DRAFT_TTL_MS).toISOString()
}

/** Accepts only a bounded, well-shaped payload; anything else is rejected. */
export function parseDraftPayload(raw: unknown): DraftPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!r.schema || typeof r.schema !== 'object') return null
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : null)
  if (jsonBytes(r) > MAX_DRAFT_BYTES) return null
  const payload: DraftPayload = {
    name: str(r.name, 200) ?? 'Untitled',
    sector: str(r.sector, 200),
    language: str(r.language, 10) ?? 'tr',
    prompt: str(r.prompt, 4000),
    schema: r.schema,
    publishIntent: r.publishIntent === true,
  }
  if (jsonBytes(payload) > MAX_DRAFT_BYTES) return null
  return payload
}
