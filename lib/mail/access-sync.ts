import { createAdminClient } from '@/lib/supabase/admin'
import { loadMailAccessSources } from './access-sources'
import {
  computeMailAccess,
  resolveMailGraceDays,
  type MailAccessSource,
  type MailAccessState,
  type MailAccessStatus,
} from './access-state'
import { getMailProvider } from './provider'
import { MailError, type MailProvider } from './types'

/**
 * Applies the computed mail access state of a domain to Mailcow.
 *
 * Server only and never driven by user input: callers pass ids that come from
 * our own tables. Nothing here deletes data, and nothing here logs passwords,
 * API keys, mailbox addresses or provider messages: only fixed codes.
 */

export type MailAccessSyncError = 'partial_failure' | 'provider_error' | 'domain_not_found'

export type MailAccessDomainRow = {
  id: string
  userId: string
  domain: string
  mailAccessStatus: MailAccessStatus
  graceStartedAt: string | null
  graceEndsAt: string | null
  syncPending: boolean
}

export type MailAccessPatch = {
  status?: MailAccessStatus
  graceStartedAt?: Date | null
  graceEndsAt?: Date | null
  syncPending?: boolean
  syncError?: MailAccessSyncError | null
}

export interface MailAccessStore {
  getDomain(domainId: string): Promise<MailAccessDomainRow | null>
  listUserDomains(userId: string): Promise<MailAccessDomainRow[]>
  /** Rows still waiting to converge with Mailcow. */
  listPending(limit: number): Promise<MailAccessDomainRow[]>
  /** Keyset page (ascending id) of every verified domain. */
  listPage(afterId: string | null, limit: number): Promise<MailAccessDomainRow[]>
  save(domainId: string, patch: MailAccessPatch): Promise<void>
}

export type MailAccessSyncDeps = {
  provider: MailProvider
  store: MailAccessStore
  loadSources: (userId: string) => Promise<MailAccessSource[]>
  now: Date
  graceDays: number
  /** Lower-case domain names that are never restricted (platform-owned mail domains). */
  exemptDomains: ReadonlySet<string>
}

export type MailAccessSyncOutcome =
  | 'unchanged'
  | 'saved_only'
  | 'applied'
  | 'partial_failure'
  | 'provider_error'
  | 'domain_not_found'
  | 'exempt'
  | 'evaluation_failed'

export type MailAccessSyncResult = {
  domainId: string
  outcome: MailAccessSyncOutcome
  previous: MailAccessStatus
  status: MailAccessStatus
  graceDaysRemaining: number | null
  /** True when at least one Mailcow request was made. */
  providerCalled: boolean
  mailboxesUpdated: number
  mailboxFailures: number
}

/** What Mailcow must look like in each state. */
const DESIRED: Record<MailAccessStatus, { mailboxActive: boolean; access: boolean; domainActive: boolean }> = {
  active: { mailboxActive: true, access: true, domainActive: true },
  grace: { mailboxActive: true, access: false, domainActive: true },
  suspended: { mailboxActive: false, access: false, domainActive: false },
}

const GRACE_DATE_TOLERANCE_MS = 1000

function sameInstant(stored: string | null, next: Date | null): boolean {
  if (stored === null || next === null) return stored === null && next === null
  return Math.abs(new Date(stored).getTime() - next.getTime()) <= GRACE_DATE_TOLERANCE_MS
}

function parseExemptDomains(raw: string | undefined): Set<string> {
  const list = (raw ?? 'gloval.ai')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
  return new Set(list)
}

export function defaultMailAccessDeps(overrides: Partial<MailAccessSyncDeps> = {}): MailAccessSyncDeps {
  return {
    provider: getMailProvider(),
    store: supabaseMailAccessStore,
    loadSources: loadMailAccessSources,
    now: new Date(),
    graceDays: resolveMailGraceDays(process.env.MAIL_GRACE_DAYS),
    exemptDomains: parseExemptDomains(process.env.MAIL_ACCESS_EXEMPT_DOMAINS),
    ...overrides,
  }
}

type ApplyOutcome = {
  outcome: 'applied' | 'partial_failure' | 'provider_error' | 'domain_not_found'
  mailboxesUpdated: number
  mailboxFailures: number
}

async function applyToProvider(
  provider: MailProvider,
  row: MailAccessDomainRow,
  status: MailAccessStatus,
): Promise<ApplyOutcome> {
  const fail = (outcome: ApplyOutcome['outcome']): ApplyOutcome => ({
    outcome,
    mailboxesUpdated: 0,
    mailboxFailures: 0,
  })

  try {
    if (!(await provider.getDomain(row.id))) return fail('domain_not_found')
  } catch (error) {
    return fail(error instanceof MailError && error.code === 'NOT_FOUND' ? 'domain_not_found' : 'provider_error')
  }

  let mailboxes: Awaited<ReturnType<MailProvider['listMailboxes']>>
  try {
    mailboxes = await provider.listMailboxes(row.id)
  } catch {
    return fail('provider_error')
  }

  const want = DESIRED[status]
  let domainFailed = false

  // Reopening: the domain must accept mail again before its mailboxes are touched.
  if (want.domainActive) {
    try {
      await provider.setDomainActive(row.id, true)
    } catch {
      domainFailed = true
    }
  }

  let mailboxesUpdated = 0
  let mailboxFailures = 0
  for (const mailbox of mailboxes) {
    try {
      if (want.mailboxActive) {
        await provider.setMailboxActive(mailbox.id, true)
        await provider.setMailboxAccess(mailbox.id, want.access)
      } else {
        await provider.setMailboxAccess(mailbox.id, false)
        await provider.setMailboxActive(mailbox.id, false)
      }
      mailboxesUpdated += 1
    } catch {
      // One failing mailbox must not stop the rest; the retry flag covers it.
      mailboxFailures += 1
    }
  }

  // Closing: the domain goes last, after its mailboxes were switched off.
  if (!want.domainActive) {
    try {
      await provider.setDomainActive(row.id, false)
    } catch {
      domainFailed = true
    }
  }

  const outcome = domainFailed ? 'provider_error' : mailboxFailures > 0 ? 'partial_failure' : 'applied'
  return { outcome, mailboxesUpdated, mailboxFailures }
}

function stateFields(state: MailAccessState): Pick<MailAccessPatch, 'graceStartedAt' | 'graceEndsAt'> {
  return { graceStartedAt: state.graceStartedAt, graceEndsAt: state.graceEndsAt }
}

/**
 * Compute, compare, apply, persist. Idempotent: when the stored state already
 * equals the computed one and nothing is pending, Mailcow is not contacted.
 */
export async function syncDomainMailAccess(
  row: MailAccessDomainRow,
  deps: MailAccessSyncDeps,
): Promise<MailAccessSyncResult> {
  const base = {
    domainId: row.id,
    previous: row.mailAccessStatus,
    status: row.mailAccessStatus,
    graceDaysRemaining: null,
    providerCalled: false,
    mailboxesUpdated: 0,
    mailboxFailures: 0,
  } satisfies Omit<MailAccessSyncResult, 'outcome'>

  if (deps.exemptDomains.has(row.domain.toLowerCase())) return { ...base, outcome: 'exempt' }

  let next: MailAccessState
  try {
    const sources = await deps.loadSources(row.userId)
    next = computeMailAccess({
      sources,
      now: deps.now,
      graceDays: deps.graceDays,
      fallbackEndedAt: row.mailAccessStatus === 'active' ? null : row.graceStartedAt,
    })
  } catch {
    // Without a trustworthy read of the sources, changing anything would be a guess.
    return { ...base, outcome: 'evaluation_failed' }
  }

  const result = { ...base, status: next.status, graceDaysRemaining: next.graceDaysRemaining }

  if (row.mailAccessStatus === next.status && !row.syncPending) {
    const datesMatch =
      sameInstant(row.graceStartedAt, next.graceStartedAt) && sameInstant(row.graceEndsAt, next.graceEndsAt)
    if (datesMatch) return { ...result, outcome: 'unchanged' }
    await deps.store.save(row.id, stateFields(next))
    return { ...result, outcome: 'saved_only' }
  }

  const applied = await applyToProvider(deps.provider, row, next.status)
  const providerCalled = true
  const common = {
    ...result,
    providerCalled,
    mailboxesUpdated: applied.mailboxesUpdated,
    mailboxFailures: applied.mailboxFailures,
  }

  if (applied.outcome === 'applied' || applied.outcome === 'domain_not_found') {
    // A domain that does not exist on the mail server has nothing to converge;
    // the code is kept as a diagnostic and the row is not retried every day.
    await deps.store.save(row.id, {
      status: next.status,
      ...stateFields(next),
      syncPending: false,
      syncError: applied.outcome === 'domain_not_found' ? 'domain_not_found' : null,
    })
    return { ...common, outcome: applied.outcome }
  }

  await deps.store.save(row.id, {
    status: next.status,
    ...stateFields(next),
    syncPending: true,
    syncError: applied.outcome,
  })
  return { ...common, outcome: applied.outcome }
}

/** Event trigger: re-evaluate every verified domain of one user. Never throws. */
export async function syncMailAccessForUser(
  userId: string,
  overrides: Partial<MailAccessSyncDeps> = {},
): Promise<MailAccessSyncResult[]> {
  const deps = defaultMailAccessDeps(overrides)
  const rows = await deps.store.listUserDomains(userId)
  const results: MailAccessSyncResult[] = []
  for (const row of rows) {
    try {
      results.push(await syncDomainMailAccess(row, deps))
    } catch {
      results.push({
        domainId: row.id,
        outcome: 'evaluation_failed',
        previous: row.mailAccessStatus,
        status: row.mailAccessStatus,
        graceDaysRemaining: null,
        providerCalled: false,
        mailboxesUpdated: 0,
        mailboxFailures: 0,
      })
    }
  }
  return results
}

export type MailAccessSweepOptions = {
  pageSize?: number
  /** Domains examined per run (cheap, DB only unless they changed). */
  maxDomains?: number
  /** Domains that may be pushed to Mailcow per run; the rest wait for the next run. */
  maxApplies?: number
  /** Stop early when this timestamp (ms) has passed. */
  deadlineMs?: number
}

export type MailAccessSweepSummary = {
  examined: number
  unchanged: number
  applied: number
  failed: number
  domainNotFound: number
  evaluationFailed: number
  truncated: boolean
  failures: Array<{ domainId: string; outcome: MailAccessSyncOutcome }>
}

/** Daily sweep: retries pending rows first, then pages through every verified domain. */
export async function syncAllMailAccess(
  options: MailAccessSweepOptions = {},
  overrides: Partial<MailAccessSyncDeps> = {},
): Promise<MailAccessSweepSummary> {
  const { pageSize = 100, maxDomains = 2000, maxApplies = 100, deadlineMs } = options
  const deps = defaultMailAccessDeps(overrides)

  const summary: MailAccessSweepSummary = {
    examined: 0,
    unchanged: 0,
    applied: 0,
    failed: 0,
    domainNotFound: 0,
    evaluationFailed: 0,
    truncated: false,
    failures: [],
  }
  const seen = new Set<string>()
  let providerPushes = 0

  // Sources are shared by all of a user's domains within one run.
  const sourceCache = new Map<string, Promise<MailAccessSource[]>>()
  const cachedDeps: MailAccessSyncDeps = {
    ...deps,
    loadSources: (userId) => {
      let cached = sourceCache.get(userId)
      if (!cached) {
        cached = deps.loadSources(userId)
        sourceCache.set(userId, cached)
      }
      return cached
    },
  }

  const limitReached = () =>
    summary.examined >= maxDomains ||
    providerPushes >= maxApplies ||
    (deadlineMs !== undefined && Date.now() >= deadlineMs)

  const handle = async (row: MailAccessDomainRow) => {
    if (seen.has(row.id)) return
    seen.add(row.id)
    summary.examined += 1
    let result: MailAccessSyncResult
    try {
      result = await syncDomainMailAccess(row, cachedDeps)
    } catch {
      summary.evaluationFailed += 1
      summary.failures.push({ domainId: row.id, outcome: 'evaluation_failed' })
      return
    }
    if (result.providerCalled) providerPushes += 1
    switch (result.outcome) {
      case 'applied':
        summary.applied += 1
        break
      case 'partial_failure':
      case 'provider_error':
        summary.failed += 1
        summary.failures.push({ domainId: row.id, outcome: result.outcome })
        break
      case 'domain_not_found':
        summary.domainNotFound += 1
        break
      case 'evaluation_failed':
        summary.evaluationFailed += 1
        summary.failures.push({ domainId: row.id, outcome: result.outcome })
        break
      default:
        summary.unchanged += 1
    }
  }

  for (const row of await deps.store.listPending(maxApplies)) {
    if (limitReached()) {
      summary.truncated = true
      return summary
    }
    await handle(row)
  }

  let cursor: string | null = null
  for (;;) {
    const page = await deps.store.listPage(cursor, pageSize)
    if (page.length === 0) break
    for (const row of page) {
      if (limitReached()) {
        summary.truncated = true
        return summary
      }
      await handle(row)
    }
    cursor = page[page.length - 1].id
    if (page.length < pageSize) break
  }
  return summary
}

/* ------------------------------ default store ------------------------------ */

const COLUMNS =
  'id, user_id, domain, mail_access_status, mail_grace_started_at, mail_grace_ends_at, mail_access_sync_pending'

type DomainDbRow = {
  id: string
  user_id: string
  domain: string
  mail_access_status: MailAccessStatus
  mail_grace_started_at: string | null
  mail_grace_ends_at: string | null
  mail_access_sync_pending: boolean
}

function toRow(row: DomainDbRow): MailAccessDomainRow {
  return {
    id: row.id,
    userId: row.user_id,
    domain: row.domain,
    mailAccessStatus: row.mail_access_status,
    graceStartedAt: row.mail_grace_started_at,
    graceEndsAt: row.mail_grace_ends_at,
    syncPending: row.mail_access_sync_pending,
  }
}

function toDbPatch(patch: MailAccessPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (patch.status !== undefined) out.mail_access_status = patch.status
  if (patch.graceStartedAt !== undefined) out.mail_grace_started_at = patch.graceStartedAt?.toISOString() ?? null
  if (patch.graceEndsAt !== undefined) out.mail_grace_ends_at = patch.graceEndsAt?.toISOString() ?? null
  if (patch.syncPending !== undefined) out.mail_access_sync_pending = patch.syncPending
  if (patch.syncError !== undefined) out.mail_access_sync_error = patch.syncError
  return out
}

export const supabaseMailAccessStore: MailAccessStore = {
  async getDomain(domainId) {
    const { data, error } = await createAdminClient()
      .from('custom_domains')
      .select(COLUMNS)
      .eq('id', domainId)
      .maybeSingle()
    if (error) throw new Error('mail_access_store_read_failed')
    return data ? toRow(data as DomainDbRow) : null
  },

  async listUserDomains(userId) {
    const { data, error } = await createAdminClient()
      .from('custom_domains')
      .select(COLUMNS)
      .eq('user_id', userId)
      .eq('status', 'active')
    if (error) throw new Error('mail_access_store_read_failed')
    return ((data ?? []) as DomainDbRow[]).map(toRow)
  },

  async listPending(limit) {
    const { data, error } = await createAdminClient()
      .from('custom_domains')
      .select(COLUMNS)
      .eq('status', 'active')
      .eq('mail_access_sync_pending', true)
      .order('id', { ascending: true })
      .limit(limit)
    if (error) throw new Error('mail_access_store_read_failed')
    return ((data ?? []) as DomainDbRow[]).map(toRow)
  },

  async listPage(afterId, limit) {
    let query = createAdminClient()
      .from('custom_domains')
      .select(COLUMNS)
      .eq('status', 'active')
      .order('id', { ascending: true })
      .limit(limit)
    if (afterId) query = query.gt('id', afterId)
    const { data, error } = await query
    if (error) throw new Error('mail_access_store_read_failed')
    return ((data ?? []) as DomainDbRow[]).map(toRow)
  },

  async save(domainId, patch) {
    const { error } = await createAdminClient()
      .from('custom_domains')
      .update(toDbPatch(patch))
      .eq('id', domainId)
    if (error) throw new Error('mail_access_store_write_failed')
  },
}
