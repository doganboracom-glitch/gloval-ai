import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Append-only audit trail for registrar-side domain mutations.
 *
 * Writing an event must never block or fail the user's operation, so every
 * failure is swallowed and reported as a server-side error count. `details` is
 * built from a fixed key allow-list of outcomes and counts: transfer codes,
 * nameserver values and personal data have no key to travel through.
 */

export type DomainAuditEventType =
  | 'nameservers_updated'
  | 'transfer_lock_changed'
  | 'transfer_code_viewed'
  | 'contacts_updated'
  | 'renewal_started'
  | 'renewal_completed'

export type DomainAuditReason =
  | 'locked_unreadable'
  | 'status_unknown'
  | 'start_date_missing'
  | 'start_date_unparseable'

export type DomainAuditDetails = {
  outcome?: 'success' | 'failed' | 'rate_limited' | 'unconfirmed' | 'unchanged' | 'deferred'
  reason?: DomainAuditReason
  changed?: boolean
  nameserverCount?: number
  previousLocked?: boolean | null
  newLocked?: boolean | null
  locked?: boolean | null
  source?: 'user_code_request' | 'user_relock' | 'auto_relock' | 'auto_relock_deferred' | 'window_extended'
  extensions?: number
  periodYears?: number
}

const DETAIL_KEYS = [
  'outcome',
  'reason',
  'changed',
  'nameserverCount',
  'previousLocked',
  'newLocked',
  'locked',
  'source',
  'extensions',
  'periodYears',
] as const
const AUDIT_SOURCES = new Set<NonNullable<DomainAuditDetails['source']>>([
  'user_code_request',
  'user_relock',
  'auto_relock',
  'auto_relock_deferred',
  'window_extended',
])
const AUDIT_REASONS = new Set<DomainAuditReason>([
  'locked_unreadable',
  'status_unknown',
  'start_date_missing',
  'start_date_unparseable',
])

function sanitizeDetails(details: DomainAuditDetails | undefined): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {}
  if (!details) return out
  for (const key of DETAIL_KEYS) {
    const value = details[key]
    if (value === undefined) continue
    if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
      out[key] = value
    } else if (key === 'outcome' && typeof value === 'string' && /^[a-z_]{1,20}$/.test(value)) {
      out[key] = value
    } else if (key === 'source' && typeof value === 'string' && AUDIT_SOURCES.has(value as DomainAuditDetails['source'] & string)) {
      out[key] = value
    } else if (key === 'reason' && typeof value === 'string' && AUDIT_REASONS.has(value as DomainAuditReason)) {
      out[key] = value
    }
  }
  return out
}

// 42P01: undefined_table (Postgres); PGRST205: table missing from PostgREST schema cache.
const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205'])

export type DomainAuditInput = {
  userId: string | null
  domain: string
  customDomainId?: string | null
  eventType: DomainAuditEventType
  actor?: 'user' | 'admin' | 'system'
  details?: DomainAuditDetails
}

export async function recordDomainAuditEvent(input: DomainAuditInput): Promise<void> {
  try {
    const admin = createAdminClient()
    const domain = input.domain.trim().toLowerCase()

    let customDomainId: string | null = input.customDomainId ?? null
    if (input.customDomainId === undefined && input.userId) {
      const lookup = await admin
        .from('custom_domains')
        .select('id')
        .eq('user_id', input.userId)
        .eq('domain', domain)
        .maybeSingle()
      if (!lookup.error && lookup.data) customDomainId = (lookup.data as { id: string }).id
    }

    const { error } = await admin.from('domain_audit_events').insert({
      custom_domain_id: customDomainId,
      domain,
      user_id: input.userId,
      actor: input.actor ?? 'user',
      event_type: input.eventType,
      details: sanitizeDetails(input.details),
    })
    if (!error) return
    if (MISSING_TABLE_CODES.has(error.code ?? '')) {
      console.warn('[domain-audit] table missing, event skipped', input.eventType)
      return
    }
    console.error('[domain-audit] insert failed', input.eventType, error.code ?? 'UNKNOWN')
  } catch {
    console.error('[domain-audit] write crashed', input.eventType)
  }
}
