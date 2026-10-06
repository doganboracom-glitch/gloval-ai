import { createAdminClient } from '@/lib/supabase/admin'
import type { DomainErrorCode } from '../types'
import { loadPricingContext } from '../pricing/context'
import { resolveOrderPricing } from '../pricing/order'
import { toQuoteView, type DomainPriceSnapshot, type DomainQuoteView } from '../pricing/calc'
import { guard, toDomainError } from './manage-service'
import { getDomainRegistrarProvider } from './provider'
import { isLaterRawDate } from './provider-date'
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
  const { data } = await admin
    .from('domain_renewals')
    .select('id, status, period_years, created_at, provider_expires_raw')
    .eq('user_id', userId)
    .eq('domain', domain.trim().toLowerCase())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
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
    const { data: claimed } = await admin
      .from('domain_renewals')
      .update({ status: 'renewal_submitting', updated_at: new Date().toISOString() })
      .eq('id', renewalId)
      .eq('status', 'payment_verified')
      .select('id, user_id, domain, period_years, baseline_expires_raw')
    const row = claimed?.[0]
    if (!row) return

    const registrar = getDomainRegistrarProvider()
    if (!isManageCapable(registrar) || !isTransferCapable(registrar)) {
      // Nothing was sent to the provider, but the buyer has paid.
      await admin
        .from('domain_renewals')
        .update({ status: 'manual_refund_required', error_message: 'registrar_unavailable' })
        .eq('id', row.id)
      return
    }

    // Safety net for a replayed request: if the provider already moved past the
    // pre-payment expiry, the renewal happened and must not be repeated.
    try {
      const info = await registrar.getOwnedDomainInfo(row.domain)
      if (info && isLaterRawDate(info.expiresAtRaw ?? null, row.baseline_expires_raw)) {
        await admin
          .from('domain_renewals')
          .update({ status: 'completed', provider_expires_raw: info.expiresAtRaw ?? null, error_message: null })
          .eq('id', row.id)
        return
      }
    } catch {
      // Cannot read state: continue, the renew call itself re-checks before sending.
    }

    try {
      const result = await registrar.renewDomain(row.domain, row.period_years)
      await admin
        .from('domain_renewals')
        .update({ status: 'completed', provider_expires_raw: result.expiresAtRaw, error_message: null })
        .eq('id', row.id)
    } catch (e) {
      const code = e instanceof RegistrarError ? e.code : 'UNEXPECTED'
      console.error('[domain-renewal] renew failed', row.id, code)
      if (isDefiniteRejection(e)) {
        await admin
          .from('domain_renewals')
          .update({ status: 'manual_refund_required', error_message: `renew_rejected:${code}` })
          .eq('id', row.id)
      } else {
        await admin
          .from('domain_renewals')
          .update({ status: 'renewal_reconciliation_required', error_message: `renew_uncertain:${code}` })
          .eq('id', row.id)
      }
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
  const { data: rows } = await admin
    .from('domain_renewals')
    .select('id, domain, baseline_expires_raw')
    .eq('status', 'renewal_reconciliation_required')
    .order('updated_at', { ascending: true })
    .limit(50)
  let completed = 0
  for (const row of (rows ?? []) as { id: string; domain: string; baseline_expires_raw: string | null }[]) {
    try {
      const info = await registrar.getOwnedDomainInfo(row.domain)
      if (info && isLaterRawDate(info.expiresAtRaw ?? null, row.baseline_expires_raw)) {
        const done = await admin
          .from('domain_renewals')
          .update({ status: 'completed', provider_expires_raw: info.expiresAtRaw ?? null, error_message: null })
          .eq('id', row.id)
          .eq('status', 'renewal_reconciliation_required')
          .select('id')
        if (done.data && done.data.length > 0) completed++
      } else {
        await admin
          .from('domain_renewals')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', row.id)
          .eq('status', 'renewal_reconciliation_required')
      }
    } catch {
      await admin
        .from('domain_renewals')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('status', 'renewal_reconciliation_required')
    }
  }
  return { checked: rows?.length ?? 0, completed }
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
  const cancelled = await admin
    .from('domain_renewals')
    .update({ status: 'cancelled', error_message: 'payment_not_completed' })
    .eq('status', 'pending_payment')
    .lt('updated_at', cutoff)
    .select('id')
  swept += cancelled.data?.length ?? 0
  const stuck = await admin
    .from('domain_renewals')
    .update({ status: 'renewal_reconciliation_required', error_message: 'submitting_timeout' })
    .eq('status', 'renewal_submitting')
    .lt('updated_at', cutoff)
    .select('id')
  swept += stuck.data?.length ?? 0
  const { data: unclaimed } = await admin
    .from('domain_renewals')
    .select('id')
    .eq('status', 'payment_verified')
    .lt('updated_at', cutoff)
    .limit(25)
  for (const row of (unclaimed ?? []) as { id: string }[]) {
    await finalizeRenewal(row.id)
    swept++
  }
  return swept
}
