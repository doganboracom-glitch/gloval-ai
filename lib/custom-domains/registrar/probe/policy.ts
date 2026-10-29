import type { DomainContactRole } from '../types'

export type ProbeContactType = 'technical' | 'administrative' | 'billing' | 'registrant'

export const PROBE_CONTACT_TYPES: readonly ProbeContactType[] = ['technical', 'administrative', 'billing', 'registrant']

type Env = Record<string, string | undefined>

const ROLE_BY_TYPE: Record<ProbeContactType, DomainContactRole> = {
  technical: 'tech',
  administrative: 'admin',
  billing: 'billing',
  registrant: 'registrant',
}

export function roleForContactType(type: ProbeContactType): DomainContactRole {
  return ROLE_BY_TYPE[type]
}

export function isProbeContactType(value: unknown): value is ProbeContactType {
  return typeof value === 'string' && (PROBE_CONTACT_TYPES as readonly string[]).includes(value)
}

/** Preview and Development deployments share the registrar credentials but must never run a probe. */
export function isProductionRuntime(env: Env = process.env): boolean {
  return env.VERCEL_ENV === 'production'
}

/** Default OFF: needs the literal string "true" AND a Vercel Production runtime. */
export function isProbeEnabled(env: Env = process.env): boolean {
  return env.DOMAIN_REGISTRAR_PROBE_ENABLED === 'true' && isProductionRuntime(env)
}

/** Per rolling 24 hours, counted from the database so a restart can not reset them. */
export const PROBE_DAILY_LIMITS = {
  starts: 5,
  registrantStarts: 1,
  submits: 5,
} as const

export const PROBE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000

/** A second, independent switch: registrant probes stay impossible until it is set. */
export function isRegistrantProbeEnabled(env: Env = process.env): boolean {
  return env.DOMAIN_REGISTRAR_PROBE_REGISTRANT_ENABLED === 'true'
}

export function probeAllowlist(env: Env = process.env): string[] {
  return (env.DOMAIN_REGISTRAR_PROBE_DOMAINS ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
}

export function isProbeDomainAllowed(domain: string, env: Env = process.env): boolean {
  return probeAllowlist(env).includes(domain.trim().toLowerCase())
}

const HOUR_MS = 60 * 60 * 1000

/** Mirrors drp_backup_window in scripts/085: 24 hours, 7 days for registrant runs. */
export function backupTtlMs(type: ProbeContactType): number {
  return (type === 'registrant' ? 7 * 24 : 24) * HOUR_MS
}

const STANDARD_READBACK_HOURS = [1, 6, 24, 48] as const
const REGISTRANT_READBACK_HOURS = [1, 6, 24, 48, 72, 96] as const

/** Registrar confirmations for a registrant change are asynchronous, so those runs observe two days longer. */
export function readbackOffsetsHours(type: ProbeContactType): readonly number[] {
  return type === 'registrant' ? REGISTRANT_READBACK_HOURS : STANDARD_READBACK_HOURS
}

/** Mirrors drp_readbacks_range in scripts/085. */
export function maxReadbacks(type: ProbeContactType): number {
  return readbackOffsetsHours(type).length
}

export type ReadbackPhase =
  | 'readback_1h'
  | 'readback_6h'
  | 'readback_24h'
  | 'readback_48h'
  | 'readback_72h'
  | 'readback_96h'

export function readbackPhase(type: ProbeContactType, index: number): ReadbackPhase | null {
  const hours = readbackOffsetsHours(type)[index]
  return hours === undefined ? null : (`readback_${hours}h` as ReadbackPhase)
}

/** Offsets are measured from the moment the change was submitted, never from the previous read-back. */
export function nextReadbackAt(submittedAt: Date, done: number, type: ProbeContactType): Date | null {
  const hours = readbackOffsetsHours(type)[done]
  return hours === undefined ? null : new Date(submittedAt.getTime() + hours * HOUR_MS)
}

export const REGISTRANT_APPROVAL_NOTE_MIN_LENGTH = 10

const DOMAIN_SHAPE = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export type StartInput = {
  domain: string
  contactType?: string
  testEmail: string
  registrantConfirmed?: boolean
  registrantApprovalNote?: string
}

export type StartPolicyError =
  | 'probe_disabled'
  | 'invalid_domain'
  | 'domain_not_allowed'
  | 'invalid_contact_type'
  | 'invalid_test_email'
  | 'registrant_probe_disabled'
  | 'registrant_confirmation_required'
  | 'registrant_note_required'

export type StartPolicyResult =
  | {
      ok: true
      domain: string
      contactType: ProbeContactType
      testEmail: string
      registrantApprovalNote: string | null
    }
  | { ok: false; error: StartPolicyError }

/**
 * Every gate that can be decided without touching the registrar or the database.
 * Technical is the default; a registrant run needs its own switch, an explicit
 * `registrantConfirmed: true` and a written-approval reference of its own.
 */
export function evaluateStartPolicy(input: StartInput, env: Env = process.env): StartPolicyResult {
  if (!isProbeEnabled(env)) return { ok: false, error: 'probe_disabled' }

  const domain = String(input.domain ?? '').trim().toLowerCase()
  if (!DOMAIN_SHAPE.test(domain)) return { ok: false, error: 'invalid_domain' }
  if (!isProbeDomainAllowed(domain, env)) return { ok: false, error: 'domain_not_allowed' }

  const contactType = input.contactType === undefined ? 'technical' : input.contactType
  if (!isProbeContactType(contactType)) return { ok: false, error: 'invalid_contact_type' }

  const testEmail = String(input.testEmail ?? '').trim().toLowerCase()
  if (!EMAIL_SHAPE.test(testEmail)) return { ok: false, error: 'invalid_test_email' }

  let registrantApprovalNote: string | null = null
  if (contactType === 'registrant') {
    if (!isRegistrantProbeEnabled(env)) return { ok: false, error: 'registrant_probe_disabled' }
    if (input.registrantConfirmed !== true) return { ok: false, error: 'registrant_confirmation_required' }
    const note = String(input.registrantApprovalNote ?? '').trim()
    if (note.length < REGISTRANT_APPROVAL_NOTE_MIN_LENGTH) return { ok: false, error: 'registrant_note_required' }
    registrantApprovalNote = note
  }

  return { ok: true, domain, contactType, testEmail, registrantApprovalNote }
}
