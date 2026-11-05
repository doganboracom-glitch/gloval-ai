import { createAdminClient } from '@/lib/supabase/admin'
import { isDbQueryError, requireOk, warnOnError } from '@/lib/db-guard'
import type { DomainErrorCode } from '../types'
import { loadPricingContext } from '../pricing/context'
import { resolveOrderPricing } from '../pricing/order'
import { toQuoteView, type DomainPriceSnapshot, type DomainQuoteView } from '../pricing/calc'
import { recordDomainAuditEvent } from './audit'
import { guard, toDomainError } from './manage-service'
import { getDomainRegistrarProvider } from './provider'
import { isLaterRawDate, parseProviderDateAssumingIstanbul } from './provider-date'
import { STALE_PENDING_MS } from './transfer-service'
import { isManageCapable, isTransferCapable, RegistrarError } from './types'

/**
 * Paid renewal of a registrar-managed domain.
 *
 * Money safety rules, in order of importance:
 *  1. The provider `Renew` call is made at most once per renewal row. It is
 *     claimed with an atomic status transition (payment_verified ->
 *     renewal_submitting); a second callback finds nothing to claim.
 *  2. An uncertain outcome (timeout, unparseable reply, any error that is not a
 *     definite provider rejection) is NEVER retried. The row moves to
 *     `renewal_reconciliation_required` and is settled only by observing the
 *     provider expiry move past the value recorded before the call.
 *  3. A definite rejection after the buyer paid is `manual_refund_required`:
 *     nothing is refunded automatically and nothing is renewed.
 *  4. The price is always recomputed on the server from the provider price list.
 */

export const OPEN_RENEWAL_STATUSES = [
  'pending_payment',
  'payment_verified',
  'renewal_submitting',
  'renewal_reconciliation_required',
] as const

export type RenewalStatus =
  | (typeof OPEN_RENEWAL_STATUSES)[number]
  | 'completed'
  | 'failed'
  | 'manual_refund_required'
  | 'cancelled'

export type RenewalQuote = {
  domain: string
  tld: string
  years: number
  currentExpiryRaw: string | null
  remainingDays: number | null
  /** Whole-period price, VAT included, in TRY minor units. */
  totalGrossMinor: number
  paymentCurrency: string
  /** Per-year display view. */
  perYear: DomainQuoteView
  snapshot: DomainPriceSnapshot
  /** Verbatim provider expiry captured before payment; stored with the order. */
  baselineExpiresRaw: string | null
}

export type RenewalQuoteResult = ({ ok: true } & { quote: RenewalQuote }) | { ok: false; error: DomainErrorCode }

function tldOf(domain: string): string {
  return domain.split('.').slice(1).join('.')
}

const EXPIRY_SYNC_PENDING = 'expiry_sync_pending'

type RenewalExpiryRow = {
  id: string
  user_id: string
  domain: string
  period_years: number
  baseline_expires_raw: string | null
  provider_expires_raw?: string | null
}

function isMissingExpirySyncColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const issue = error as { code?: unknown; message?: unknown }
  const message = typeof issue.message === 'string' ? issue.message.toLowerCase() : ''
  return (issue.code === '42703' || issue.code === 'PGRST204') && message.includes('expiry_sync_pending')
}

async function updateRenewalExpiryState(
  admin: ReturnType<typeof createAdminClient>,
  rowId: string,
  fields: Record<string, unknown>,
  pending: boolean,
  expectedStatus?: RenewalStatus,
): Promise<Array<{ id: string }>> {
  const updatedAt = new Date().toISOString()
  const apply = async (patch: Record<string, unknown>) => {
    let query = admin.from('domain_renewals').update(patch).eq('id', rowId)
    if (expectedStatus) query = query.eq('status', expectedStatus)
    return query.select('id')
  }

  const result = await apply({
    ...fields,
    expiry_sync_pending: pending,
    error_message: pending ? EXPIRY_SYNC_PENDING : null,
    updated_at: updatedAt,
  })
  if (result.error && isMissingExpirySyncColumn(result.error)) {
    const fallback = await apply({
      ...fields,
      error_message: pending ? EXPIRY_SYNC_PENDING : null,
      updated_at: updatedAt,
    })
    if (fallback.error) throw fallback.error
    return (fallback.data ?? []) as Array<{ id: string }>
  }
  if (result.error) throw result.error
  return (result.data ?? []) as Array<{ id: string }>
}

async function syncCompletedRenewalExpiry(
  admin: ReturnType<typeof createAdminClient>,
  row: RenewalExpiryRow,
  rawExpiry: string | null,
): Promise<boolean> {
  if (!rawExpiry || !isLaterRawDate(rawExpiry, row.baseline_expires_raw)) return false

  // Relative renewal verification above uses the untouched provider strings.
  // This import/display-only conversion is used only to persist the expiry.
  const expiry = parseProviderDateAssumingIstanbul(rawExpiry)
  if (!expiry.instant) return false

  try {
    const { data, error } = await admin
      .from('custom_domains')
      .update({ expires_at: expiry.instant })
      .eq('user_id', row.user_id)
      .eq('domain', row.domain)
      .select('id')
    if (error) throw error
    if (!data?.length) return false

    const cleared = await updateRenewalExpiryState(
      admin,
      row.id,
      { provider_expires_raw: rawExpiry },
      false,
      'completed',
    )
    return cleared.length > 0
  } catch (error) {
    console.warn('[domain-renewal] expiry sync remains pending', row.id, error instanceof Error ? error.name : 'unknown')
    return false
  }
}

async function markRenewalCompleted(
  admin: ReturnType<typeof createAdminClient>,
  row: RenewalExpiryRow,
  rawExpiry: string | null,
  expectedStatus: RenewalStatus,
): Promise<boolean> {
  const completed = await updateRenewalExpiryState(
    admin,
    row.id,
    { status: 'completed', provider_expires_raw: rawExpiry },
    true,
    expectedStatus,
  )
  if (!completed.length) return false
  await syncCompletedRenewalExpiry(admin, row, rawExpiry)
  return true
}

async function listPendingExpirySyncRows(
  admin: ReturnType<typeof createAdminClient>,
): Promise<RenewalExpiryRow[]> {
  const select = 'id, user_id, domain, period_years, baseline_expires_raw, provider_expires_raw'
  const primary = await admin
    .from('domain_renewals')
    .select(select)
    .eq('status', 'completed')
    .eq('expiry_sync_pending', true)
    .order('updated_at', { ascending: true })
    .limit(50)
  if (!primary.error) return (primary.data ?? []) as RenewalExpiryRow[]
  if (!isMissingExpirySyncColumn(primary.error)) throw primary.error

  const fallback = await admin
    .from('domain_renewals')
    .select(select)
    .eq('status', 'completed')
    .eq('error_message', EXPIRY_SYNC_PENDING)
    .order('updated_at', { ascending: true })
    .limit(50)
  if (fallback.error) throw fallback.error
  return (fallback.data ?? []) as RenewalExpiryRow[]
}

/** Prices a renewal from provider data only. No client value is accepted. */
export async function quoteRenewal(userId: string, rawDomain: string, years: number): Promise<RenewalQuoteResult> {
  if (!Number.isInteger(years) || years < 1 || years > 10) return { ok: false, error: 'INVALID_INPUT' }
  const g = await guard(userId, rawDomain)
  if (!g.ok) return g
  try {
    const details = await g.registrar.getManagedDetails(g.domain)
    if (!details) return { ok: false, error: 'NOT_FOUND' }
    // Only an active domain is renewed here; expired/redemption/pending states
    // need a human decision because the provider price differs.
    if (details.status.toLowerCase() !== 'active') return { ok: false, error: 'PROVIDER_REFUSED' }
    const tld = tldOf(g.domain)
    const providerPrice = await g.registrar.getRenewalPrice(tld, years)
    if (!providerPrice) return { ok: false, error: 'PRICING_UNAVAILABLE' }
    const pricing = resolveOrderPricing({
      price: { registerCents: providerPrice.renewCents, currency: providerPrice.currency },
      periodYears: 1,
      context: await loadPricingContext(),
    })
    if (!pricing.ok) return { ok: false, error: 'PRICING_UNAVAILABLE' }
    const snapshot: DomainPriceSnapshot = pricing.snapshot
    return {
      ok: true,
      quote: {
        domain: g.domain,
        tld,
        years,
        currentExpiryRaw: details.expiresAtRaw,
        remainingDays: details.remainingDays,
        totalGrossMinor: pricing.paymentAmount.amountCents,
        paymentCurrency: pricing.paymentAmount.currency,
        perYear: toQuoteView(snapshot),
        snapshot,
        baselineExpiresRaw: details.expiresAtRaw,
      },
    }
  } catch (e) {
    return { ok: false, error: toDomainError(e) }
  }
}

export type RenewalView = {
  id: string
  status: RenewalStatus
  periodYears: number
  createdAt: string
  /** Provider expiry after a completed renewal, verbatim. */
  providerExpiresRaw: string | null
}

/** Latest renewal of this domain for the signed-in owner (any status). */
export async function getLatestRenewal(userId: string, domain: string): Promise<RenewalView | null> {
  const admin = createAdminClient()
  const { data } = requireOk(
    'domainRenewal.getLatest',
    await admin
      .from('domain_renewals')
      .select('id, status, period_years, created_at, provider_expires_raw')
      .eq('user_id', userId)
      .eq('domain', domain.trim().toLowerCase())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  )
  if (!data) return null
  return {
    id: data.id,
    status: data.status as RenewalStatus,
    periodYears: data.period_years,
    createdAt: data.created_at,
    providerExpiresRaw: data.provider_expires_raw,
  }
}

function isDefiniteRejection(e: unknown): boolean {
  // The adapter throws PROVIDER_ERROR/INVALID_INPUT only for a pre-check failure
  // or a rejection the provider answered unambiguously. Everything else,
  // including OUTCOME_UNKNOWN and non-registrar exceptions, is uncertain.
  return e instanceof RegistrarError && (e.code === 'PROVIDER_ERROR' || e.code === 'INVALID_INPUT')
}

/**
 * Runs after the payment is confirmed. Never throws: it is called from the
 * payment callback, which must always be able to acknowledge the PSP.
 */
export async function finalizeRenewal(renewalId: string): Promise<void> {
  const admin = createAdminClient()
  try {
    // Atomic claim: exactly one caller may move payment_verified -> submitting.
    // A failed claim throws into the outer catch: the row stays payment_verified
    // and sweepStaleRenewals retries it, instead of the failure looking like
    // "someone else already claimed it".
    const { data: claimed } = requireOk(
      'domainRenewal.claim',
      await admin
        .from('domain_renewals')
        .update({ status: 'renewal_submitting', updated_at: new Date().toISOString() })
        .eq('id', renewalId)
        .eq('status', 'payment_verified')
        .select('id, user_id, domain, period_years, baseline_expires_raw'),
    )
    const row = claimed?.[0]
    if (!row) return

    const registrar = getDomainRegistrarProvider()
    if (!isManageCapable(registrar) || !isTransferCapable(registrar)) {
      // Nothing was sent to the provider, but the buyer has paid.
      requireOk(
        'domainRenewal.markRegistrarUnavailable',
        await admin
          .from('domain_renewals')
          .update({ status: 'manual_refund_required', error_message: 'registrar_unavailable' })
          .eq('id', row.id),
      )
      return
    }

    // Safety net for a replayed request: if the provider already moved past the
    // pre-payment expiry, the renewal happened and must not be repeated.
    try {
      const info = await registrar.getOwnedDomainInfo(row.domain)
      if (info && isLaterRawDate(info.expiresAtRaw ?? null, row.baseline_expires_raw)) {
        const completed = await markRenewalCompleted(
          admin,
          row,
          info.expiresAtRaw ?? null,
          'renewal_submitting',
        )
        if (completed) {
          await recordDomainAuditEvent({
            userId: row.user_id,
            domain: row.domain,
            eventType: 'renewal_completed',
            actor: 'system',
            details: { outcome: 'success', periodYears: row.period_years },
          })
        }
        return
      }
    } catch (e) {
      // A failed DB write here must not fall through to a second Renew call.
      if (isDbQueryError(e)) throw e
      // Cannot read state: continue, the renew call itself re-checks before sending.
    }

    let result: Awaited<ReturnType<typeof registrar.renewDomain>>
    try {
      result = await registrar.renewDomain(row.domain, row.period_years)
    } catch (e) {
      const code = e instanceof RegistrarError ? e.code : 'UNEXPECTED'
      console.error('[domain-renewal] renew failed', row.id, code)
      if (isDefiniteRejection(e)) {
        requireOk(
          'domainRenewal.markRejected',
          await admin
            .from('domain_renewals')
            .update({ status: 'manual_refund_required', error_message: `renew_rejected:${code}` })
            .eq('id', row.id),
        )
      } else {
        requireOk(
          'domainRenewal.markUncertain',
          await admin
            .from('domain_renewals')
            .update({ status: 'renewal_reconciliation_required', error_message: `renew_uncertain:${code}` })
            .eq('id', row.id),
        )
      }
      return
    }
    // Persist the provider success before syncing expires_at. If the read-back is
    // unavailable or still stale, the renewal remains completed and only the
    // read-only expiry sync is retried by the cron.
    const completed = await markRenewalCompleted(admin, row, result.expiresAtRaw, 'renewal_submitting')
    if (completed) {
      await recordDomainAuditEvent({
        userId: row.user_id,
        domain: row.domain,
        eventType: 'renewal_completed',
        actor: 'system',
        details: { outcome: 'success', periodYears: row.period_years },
      })
    }
  } catch (e) {
    console.error('[domain-renewal] finalize crashed', renewalId, e instanceof Error ? e.name : 'unknown')
  }
}

/**
 * Settles uncertain renewals by reading the provider. Read-only: it never calls
 * Renew. A renewal is only completed when the expiry is observed past baseline.
 */
export async function reconcileRenewals(): Promise<{ checked: number; completed: number }> {
  const registrar = getDomainRegistrarProvider()
  if (!isManageCapable(registrar) || !isTransferCapable(registrar)) return { checked: 0, completed: 0 }
  const admin = createAdminClient()
  const { data: rows } = requireOk(
    'domainRenewal.reconcileList',
    await admin
      .from('domain_renewals')
      .select('id, user_id, domain, period_years, baseline_expires_raw, provider_expires_raw')
      .eq('status', 'renewal_reconciliation_required')
      .order('updated_at', { ascending: true })
      .limit(50),
  )
  let completed = 0
  for (const row of (rows ?? []) as RenewalExpiryRow[]) {
    try {
      const info = await registrar.getOwnedDomainInfo(row.domain)
      if (info && isLaterRawDate(info.expiresAtRaw ?? null, row.baseline_expires_raw)) {
        const done = await markRenewalCompleted(
          admin,
          row,
          info.expiresAtRaw ?? null,
          'renewal_reconciliation_required',
        )
        if (done) {
          completed++
          await recordDomainAuditEvent({
            userId: row.user_id,
            domain: row.domain,
            eventType: 'renewal_completed',
            actor: 'system',
            details: { outcome: 'success', periodYears: row.period_years },
          })
        }
      } else {
        warnOnError(
          'domainRenewal.reconcileTouch',
          await admin
            .from('domain_renewals')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', row.id)
            .eq('status', 'renewal_reconciliation_required'),
        )
      }
    } catch (e) {
      if (isDbQueryError(e)) console.error('[domain-renewal] reconcile write failed', row.id, e.code)
      warnOnError(
        'domainRenewal.reconcileTouchAfterError',
        await admin
          .from('domain_renewals')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', row.id)
          .eq('status', 'renewal_reconciliation_required'),
      )
    }
  }
  return { checked: rows?.length ?? 0, completed }
}

/**
 * Re-reads only completed renewals whose provider expiry was not yet persisted.
 * This never calls Renew and never changes an uncertain renewal outcome.
 */
export async function syncPendingRenewalExpiries(): Promise<{ checked: number; synced: number }> {
  const registrar = getDomainRegistrarProvider()
  if (!isTransferCapable(registrar)) return { checked: 0, synced: 0 }

  const admin = createAdminClient()
  const rows = await listPendingExpirySyncRows(admin)
  let synced = 0
  for (const row of rows) {
    try {
      const info = await registrar.getOwnedDomainInfo(row.domain)
      if (info && (await syncCompletedRenewalExpiry(admin, row, info.expiresAtRaw ?? null))) synced++
    } catch (error) {
      if (isDbQueryError(error)) {
        console.error('[domain-renewal] expiry retry query failed', row.id, error.code)
      } else {
        console.warn('[domain-renewal] expiry retry read failed', row.id, error instanceof Error ? error.name : 'unknown')
      }
    }
  }
  return { checked: rows.length, synced }
}

/**
 * Housekeeping for rows stuck mid-flight.
 *  - Unpaid for a long time -> cancelled (frees the one-open-renewal slot).
 *  - Stuck in `renewal_submitting` (a worker died after the claim) -> the Renew
 *    call may or may not have reached the provider, so it is uncertain and goes
 *    to reconciliation, never back to a retryable state.
 *  - Paid but never claimed -> retried through the normal claim path.
 */
export async function sweepStaleRenewals(olderThanMs = STALE_PENDING_MS): Promise<number> {
  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - olderThanMs).toISOString()
  let swept = 0
  const cancelled = requireOk(
    'domainRenewal.sweepCancel',
    await admin
      .from('domain_renewals')
      .update({ status: 'cancelled', error_message: 'payment_not_completed' })
      .eq('status', 'pending_payment')
      .lt('updated_at', cutoff)
      .select('id'),
  )
  swept += cancelled.data?.length ?? 0
  const stuck = requireOk(
    'domainRenewal.sweepStuck',
    await admin
      .from('domain_renewals')
      .update({ status: 'renewal_reconciliation_required', error_message: 'submitting_timeout' })
      .eq('status', 'renewal_submitting')
      .lt('updated_at', cutoff)
      .select('id'),
  )
  swept += stuck.data?.length ?? 0
  const { data: unclaimed } = requireOk(
    'domainRenewal.sweepUnclaimed',
    await admin
      .from('domain_renewals')
      .select('id')
      .eq('status', 'payment_verified')
      .lt('updated_at', cutoff)
      .limit(25),
  )
  for (const row of (unclaimed ?? []) as { id: string }[]) {
    await finalizeRenewal(row.id)
    swept++
  }
  return swept
}
