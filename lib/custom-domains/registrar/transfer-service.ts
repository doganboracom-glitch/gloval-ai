import { createAdminClient } from '@/lib/supabase/admin'
import { getDomainProvider } from '../provider'
import { getDomainRegistrarProvider } from './provider'
import { decryptAuthCode } from './transfer-crypto'
import { isTransferCapable, RegistrarError } from './types'

/**
 * Server-side inbound-transfer lifecycle (no 'use server': called from payment
 * settlement and from the user-facing actions). Nothing here ever logs or
 * returns the EPP code.
 */

/** Gap between claiming the order and the provider call is the only moment the code is decrypted. */
const OPEN_STATUSES = [
  'pending_payment',
  'payment_verified',
  'transfer_submitting',
  'transfer_pending',
  'transfer_reconciliation_required',
]

/** .tr (and other ccTLDs with a registry-specific process) are not transferable through the generic auth-code flow. */
export function isTransferSupportedTld(tld: string): boolean {
  return !tld.toLowerCase().endsWith('tr')
}

export async function finalizeTransferIn(transferId: string): Promise<void> {
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('domain_transfers')
    .select('id, user_id, domain, period_years, status, auth_code_enc')
    .eq('id', transferId)
    .maybeSingle<{
      id: string
      user_id: string
      domain: string
      period_years: number
      status: string
      auth_code_enc: string | null
    }>()
  if (!row) return
  if (!['pending_payment', 'payment_verified'].includes(row.status)) return

  const fail = async (code: string) => {
    await admin
      .from('domain_transfers')
      .update({ status: 'failed', error_message: code, auth_code_enc: null, updated_at: new Date().toISOString() })
      .eq('id', transferId)
  }

  const registrar = getDomainRegistrarProvider()
  if (!isTransferCapable(registrar)) return fail('registrar_not_transfer_capable')

  const authCode = row.auth_code_enc ? decryptAuthCode(row.auth_code_enc) : null
  if (!authCode) return fail('auth_code_unavailable')

  // Atomic claim: only one concurrent caller may submit the transfer.
  const { data: claimed } = await admin
    .from('domain_transfers')
    .update({ status: 'transfer_submitting', updated_at: new Date().toISOString() })
    .eq('id', transferId)
    .in('status', ['pending_payment', 'payment_verified'])
    .select('id')
  if (!claimed || claimed.length === 0) return

  try {
    const { providerStatus } = await registrar.startTransferIn(row.domain, authCode, row.period_years)
    await admin
      .from('domain_transfers')
      .update({
        status: 'transfer_pending',
        provider_status: providerStatus,
        auth_code_enc: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', transferId)
  } catch (error) {
    // RegistrarError messages carry only a "domainnameapi:<CODE>" tag.
    const tag = error instanceof Error ? error.message.slice(0, 80) : 'transfer_failed'
    if (isOutcomeUnknown(error)) {
      // The request may have reached the registrar: never mark it failed (and
      // never refund) until reconciliation has looked at the registrar state.
      await admin
        .from('domain_transfers')
        .update({
          status: 'transfer_reconciliation_required',
          error_message: tag,
          auth_code_enc: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', transferId)
      return
    }
    await fail(tag)
  }
}

/** Only definitive registrar rejections are safe to treat as "nothing happened". */
export function isOutcomeUnknown(error: unknown): boolean {
  if (error instanceof RegistrarError) return error.code === 'PROVIDER_ERROR'
  return true
}

/**
 * Reconciles open transfers against the registrar. A transfer is only marked
 * completed when the provider reports the domain as ours and active; anything
 * else stays pending (we never assume success).
 */
export async function syncTransfersForUser(userId?: string, limit = 50): Promise<{ checked: number }> {
  const registrar = getDomainRegistrarProvider()
  if (!isTransferCapable(registrar)) return { checked: 0 }
  const admin = createAdminClient()
  // Oldest-checked first; unresolved rows get updated_at touched below so a
  // large backlog rotates instead of starving the tail.
  let query = admin
    .from('domain_transfers')
    .select('id, user_id, domain')
    .in('status', ['transfer_pending', 'transfer_reconciliation_required'])
    .order('updated_at', { ascending: true })
    .limit(limit)
  if (userId) query = query.eq('user_id', userId)
  const { data: pending } = await query
  const touch = (id: string) =>
    admin
      .from('domain_transfers')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', id)
      .in('status', ['transfer_pending', 'transfer_reconciliation_required'])
  for (const row of (pending ?? []) as { id: string; user_id: string; domain: string }[]) {
    try {
      const info = await registrar.getOwnedDomainInfo(row.domain)
      if (!info || info.status.toLowerCase() !== 'active') {
        await touch(row.id)
        continue
      }
      const claimed = await admin
        .from('domain_transfers')
        .update({ status: 'completed', provider_status: info.status, expires_at: info.expiresAt, updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .in('status', ['transfer_pending', 'transfer_reconciliation_required'])
        .select('id')
      if (!claimed.data || claimed.data.length === 0) continue
      const custom = await getDomainProvider().addDomain({
        userId: row.user_id,
        domain: row.domain,
        registered: { orderId: row.id, expiresAt: info.expiresAt },
      })
      await admin.from('domain_transfers').update({ custom_domain_id: custom.id }).eq('id', row.id)
    } catch (error) {
      console.log('[v0] transfer sync failed', row.id, error instanceof Error ? error.message : 'unknown')
      await touch(row.id)
    }
  }
  return { checked: pending?.length ?? 0 }
}

/** A registrar submit call never legitimately runs this long; older rows lost their worker. */
export const STALE_PENDING_MS = 15 * 60 * 1000

/**
 * Moves transfers stuck in `transfer_submitting` to the uncertain state. This
 * single conditional UPDATE is the lock: concurrent crons cannot both match a
 * row. It never calls the registrar to retry, never refunds, and drops the
 * stored EPP code so nothing can resubmit it.
 */
export async function sweepStaleTransfers(olderThanMs = STALE_PENDING_MS): Promise<number> {
  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - olderThanMs).toISOString()
  const { data } = await admin
    .from('domain_transfers')
    .update({
      status: 'transfer_reconciliation_required',
      error_message: 'submit_outcome_unknown_stale',
      auth_code_enc: null,
      updated_at: new Date().toISOString(),
    })
    .eq('status', 'transfer_submitting')
    .lt('updated_at', cutoff)
    .select('id')
  return data?.length ?? 0
}

/** Cron entry point: stale sweep first, then read-only registrar checks for all users. */
export async function syncAllTransfers(limit = 50): Promise<{ swept: number; checked: number }> {
  const swept = await sweepStaleTransfers()
  const { checked } = await syncTransfersForUser(undefined, limit)
  return { swept, checked }
}

export { OPEN_STATUSES }
