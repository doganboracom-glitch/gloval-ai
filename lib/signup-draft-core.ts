import { createHash, randomBytes } from 'node:crypto'
import { MAX_SIGNUP_IDEA_CHARS } from '@/lib/signup-draft-shared'

export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000
/** UTF-8 size of the serialized payload (the DB check allows 256 KB as a second line of defence). */
export const MAX_DRAFT_BYTES = 200_000
/** Durable per-IP budget for the logged-out draft endpoint. */
export const DRAFT_IP_LIMIT = 10
export const DRAFT_IP_WINDOW_SECONDS = 60 * 60
/** Unclaimed, unexpired drafts a single e-mail may hold at once. */
export const DRAFT_EMAIL_ACTIVE_LIMIT = 3
/** Backstop against distributed abuse: total unclaimed, unexpired drafts. */
export const DRAFT_GLOBAL_ACTIVE_LIMIT = 2000
/** A consumed row stays this long so a second tab can still learn its project id. */
export const DRAFT_CONSUMED_GRACE_MS = 60 * 60 * 1000

export type DraftFailure =
  | 'invalid'
  | 'rate_limited'
  | 'email_limit'
  | 'capacity'
  | 'table_missing'
  | 'storage'

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

export type SiteDraftPayload = {
  name: string
  sector: string | null
  language: string
  prompt: string | null
  schema: unknown
  publishIntent: boolean
  editIntent: boolean
}

export type SignupIdeaDraftPayload = {
  kind: 'idea'
  prompt: string
}

export type DraftPayload = SiteDraftPayload | SignupIdeaDraftPayload

export function isSignupIdeaDraftPayload(
  payload: DraftPayload | null | undefined,
): payload is SignupIdeaDraftPayload {
  return Boolean(payload && 'kind' in payload && payload.kind === 'idea')
}

/**
 * Where a resumed draft lands. A publish intent keeps the existing autopublish
 * flow untouched; an edit intent (or none) opens the plain editor, which never
 * shows a publish prompt.
 */
export function resumeTargetPath(
  projectId: string,
  intent: { publishIntent?: boolean; editIntent?: boolean },
): string {
  return intent.publishIntent ? `/editor/${projectId}?autopublish=1` : `/editor/${projectId}`
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
  let payload: DraftPayload

  if (r.kind === 'idea') {
    const prompt = typeof r.prompt === 'string' ? r.prompt.trim() : ''
    if (!prompt || prompt.length > MAX_SIGNUP_IDEA_CHARS) return null
    payload = { kind: 'idea', prompt }
  } else {
    if (r.kind !== undefined || !r.schema || typeof r.schema !== 'object') return null
    const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : null)
    payload = {
      name: str(r.name, 200) ?? 'Untitled',
      sector: str(r.sector, 200),
      language: str(r.language, 10) ?? 'tr',
      prompt: str(r.prompt, 4000),
      schema: r.schema,
      publishIntent: r.publishIntent === true,
      editIntent: r.editIntent === true,
    }
  }

  try {
    if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > MAX_DRAFT_BYTES) return null
  } catch {
    return null
  }
  return payload
}
