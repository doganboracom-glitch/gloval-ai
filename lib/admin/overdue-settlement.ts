import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { settleSubscriptionRenewal } from '@/lib/billing-lifecycle'
import {
  isProviderManaged,
  isRecentDuplicate,
  paidMonthsForInterval,
  sanitizeIdempotencyToken,
  validateSettlementInput,
  type SettlementKind,
} from './overdue-logic'

/**
 * Records a payment received outside the PSP (`mark_paid`) or a comped
 * extension (`gift`). Settlement itself is NOT reimplemented: a pending
 * `renew_*` ledger row is created and `settleSubscriptionRenewal` — the same
 * function a verified provider renewal goes through — activates the
 * subscription, moves the period, clears grace/suspension, restores suspended
 * sites and triggers the mail access sync. No provider API is ever called.
 *
 * The caller (a server action) MUST have run `requireAdmin()` already.
 */

export type SettlementActor = { email: string; userId: string }

export type SettlementResult =
  | { ok: true; duplicate: boolean; providerManaged: boolean; newPeriodEnd: string | null; auditRecorded: boolean }
  | { ok: false; error: string }

type SubRow = {
  id: string
  user_id: string
  status: string
  provider: string
  plan_id: string
  current_period_end: string | null
}

export async function settleSubscriptionManually(input: {
  actor: SettlementActor
  kind: SettlementKind
  subscriptionId: string
  reason: string | undefined | null
  months?: number
  idempotencyKey?: string
  now?: Date
}): Promise<SettlementResult> {
  const admin = createAdminClient()
  const now = input.now ?? new Date()

  const { data: subData } = await admin
    .from('billing_subscriptions')
    .select('id, user_id, status, provider, plan_id, current_period_end')
    .eq('id', input.subscriptionId)
    .maybeSingle()
  const sub = subData as SubRow | null
  if (!sub) return { ok: false, error: 'subscription_not_found' }

  const { data: plan } = await admin
    .from('billing_plans')
    .select('name, code, price_cents, currency, interval')
    .eq('id', sub.plan_id)
    .maybeSingle()
  if (!plan) return { ok: false, error: 'plan_not_found' }

  const validation = validateSettlementInput({
    kind: input.kind,
    reason: input.reason,
    months: input.months,
    planPriceCents: plan.price_cents as number,
    status: sub.status,
  })
  if (!validation.ok) return validation

  const token = sanitizeIdempotencyToken(input.idempotencyKey) ?? randomUUID()
  const auditKey = `${input.kind}:${sub.id}:${token}`

  // The audit table must exist before money-state changes: refuse otherwise.
  const { error: auditProbe } = await admin.from('admin_overdue_audit').select('id').limit(1)
  if (auditProbe) return { ok: false, error: 'audit_unavailable' }

  const { data: sameKey } = await admin
    .from('admin_overdue_audit')
    .select('id')
    .eq('idempotency_key', auditKey)
    .maybeSingle()
  if (sameKey) {
    return { ok: true, duplicate: true, providerManaged: isProviderManaged(sub.provider), newPeriodEnd: sub.current_period_end, auditRecorded: true }
  }

  const { data: recent } = await admin
    .from('admin_overdue_audit')
    .select('created_at')
    .eq('subscription_id', sub.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (isRecentDuplicate(recent?.created_at as string | undefined, now)) {
    return { ok: false, error: 'duplicate_recent' }
  }

  const providerId = input.kind === 'gift' ? 'gift' : 'manual'
  const months = input.kind === 'gift' ? validation.months : paidMonthsForInterval(plan.interval as string)
  const amountCents = input.kind === 'gift' ? 0 : (plan.price_cents as number)
  const currency = (plan.currency as string) ?? 'TRY'
  const reference = `${providerId}_${randomUUID()}`

  const { data: ledger, error: ledgerError } = await admin
    .from('billing_transactions')
    .insert({
      subscription_id: sub.id,
      user_id: sub.user_id,
      kind: 'charge',
      amount_cents: amountCents,
      currency,
      status: 'pending',
      provider: providerId,
      provider_ref: reference,
      idempotency_key: `renew_${providerId}_${sub.id}_${token}`,
      description:
        input.kind === 'gift'
          ? `Hediye süre (${months} ay): ${validation.reason}`
          : `Manuel ödeme (havale/EFT/nakit): ${validation.reason}`,
    })
    .select('id, idempotency_key')
    .single()
  if (ledgerError || !ledger) {
    return { ok: false, error: ledgerError?.code === '23505' ? 'duplicate_recent' : 'ledger_failed' }
  }

  let outcome
  try {
    outcome = await settleSubscriptionRenewal({
      providerId,
      reference,
      status: 'paid',
      periodMonths: months,
      source: input.kind === 'gift' ? 'gift' : 'manual',
      now,
      charge: {
        id: ledger.id as string,
        subscription_id: sub.id,
        user_id: sub.user_id,
        amount_cents: amountCents,
        currency,
        idempotency_key: ledger.idempotency_key as string,
      },
    })
  } catch {
    // settleSubscriptionRenewal hands the row back to `pending`; retire it so it never lingers.
    await admin.from('billing_transactions').update({ status: 'failed' }).eq('id', ledger.id).eq('status', 'pending')
    return { ok: false, error: 'settlement_failed' }
  }
  if (outcome.kind !== 'renewed') {
    await admin.from('billing_transactions').update({ status: 'failed' }).eq('id', ledger.id).eq('status', 'pending')
    return { ok: false, error: outcome.kind === 'rejected' ? outcome.reason : 'settlement_failed' }
  }

  const { data: after } = await admin
    .from('billing_subscriptions')
    .select('status, current_period_end')
    .eq('id', sub.id)
    .maybeSingle()

  const { error: auditError } = await admin.from('admin_overdue_audit').insert({
    admin_email: input.actor.email,
    admin_user_id: input.actor.userId,
    target_user_id: sub.user_id,
    subscription_id: sub.id,
    action: input.kind,
    months,
    amount_cents: amountCents,
    currency,
    provider: sub.provider,
    provider_managed: isProviderManaged(sub.provider),
    prev_status: sub.status,
    new_status: (after?.status as string) ?? 'active',
    prev_period_end: sub.current_period_end,
    new_period_end: (after?.current_period_end as string) ?? null,
    reason: validation.reason,
    idempotency_key: auditKey,
  })
  if (auditError) console.log('[admin-overdue] audit insert failed after settlement:', sub.id, auditError.message)

  return {
    ok: true,
    duplicate: false,
    providerManaged: isProviderManaged(sub.provider),
    newPeriodEnd: (after?.current_period_end as string) ?? null,
    auditRecorded: !auditError,
  }
}
