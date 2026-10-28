import { createAdminClient } from '@/lib/supabase/admin'
import { requireOk, warnOnError } from '@/lib/db-guard'
import { logUserEvent, formatTicketNumber, SUPPORT_EMAIL } from '@/lib/notify'
import { resolveEmailLang } from '@/lib/email/lang'
import { buildPaymentReceiptEmail } from '@/lib/email/payment-receipt'
import { TOPUP_ORDER_PREFIX, type CreditTopUp } from '@/lib/pricing-config'
import { verifyTopUpPayment, type TopUpPaymentFacts } from './topup-verify'
import type { PaymentProviderId, PaymentWebhookResult } from './types'

const BILLING_URL = 'https://gloval.ai/billing'

type AdminClient = ReturnType<typeof createAdminClient>

export type PendingTopUpCharge = {
  id: string
  user_id: string
  amount_cents: number
  currency: string
  status: string
  provider_ref: string | null
  idempotency_key: string | null
}

export type TopUpGrantOutcome = 'granted' | 'already_processed'

/**
 * Releases the credits of ONE verified top-up charge, exactly once.
 *
 * The pending -> succeeded status flip is a conditional UPDATE, so of any
 * number of concurrent or repeated callbacks/webhooks only the one that wins
 * the flip proceeds to write the ledger row. If the ledger write itself fails
 * the flip is rolled back to `pending` and the error is rethrown, so the PSP
 * retry (or a later callback) can complete the grant instead of losing it.
 */
export async function grantTopUpCredits(
  admin: AdminClient,
  charge: PendingTopUpCharge,
  pack: CreditTopUp,
  providerId: PaymentProviderId,
): Promise<TopUpGrantOutcome> {
  const { data: claimed, error: claimError } = await admin
    .from('billing_transactions')
    .update({ status: 'succeeded', provider: providerId })
    .eq('id', charge.id)
    .in('status', ['pending', 'abandoned'])
    .select('id')

  if (claimError) throw new Error(`topup_claim_failed: ${claimError.message}`)
  if (!claimed || claimed.length === 0) return 'already_processed'

  const { error: ledgerError } = await admin.from('ai_credit_transactions').insert({
    user_id: charge.user_id,
    kind: 'package',
    amount: pack.credits,
    reason: `Ek AI paketi +${pack.credits} (${charge.idempotency_key})`,
  })

  if (ledgerError) {
    // The ledger error below is what gets rethrown; a failed rollback is logged
    // with its code so the stuck `succeeded` row can be found and repaired.
    warnOnError(
      'payments.topup.rollback',
      await admin
        .from('billing_transactions')
        .update({ status: 'pending' })
        .eq('id', charge.id)
        .eq('status', 'succeeded'),
    )
    throw new Error(`topup_ledger_failed: ${ledgerError.message}`)
  }

  const ticketNumber = formatTicketNumber(charge.provider_ref ?? charge.id)

  await logUserEvent({
    userId: charge.user_id,
  type: 'payment_succeeded',
  subject: 'Ödeme başarılı — AI işlemleri eklendi',
  includeBillingProfileReminder: true,
    body: `Ek AI paketi ödemeniz onaylandı ve hesabınıza ${pack.credits} AI işlemi eklendi. İşlem No: ${ticketNumber}.`,
    userEmail: ({ emailLocale, billingProfileIncomplete }) =>
      buildPaymentReceiptEmail({
        kind: 'ai_topup',
        lang: resolveEmailLang(emailLocale),
        credits: pack.credits,
        amountCents: pack.priceCents,
        currency: pack.currency,
        paidAt: new Date(),
        ticketNumber,
        supportEmail: SUPPORT_EMAIL,
        billingUrl: BILLING_URL,
        billingProfileIncomplete,
      }),
    emailAdmin: false,
  })

  return 'granted'
}

/**
 * Called by `settlePaymentResult` for every verified provider result. Returns
 * `false` when the reference does not belong to a credit top-up, so the
 * caller keeps looking; `true` once it has been handled (credited, rejected,
 * or ignored as a duplicate).
 */
export async function settleTopUpResult(
  providerId: PaymentProviderId,
  result: PaymentWebhookResult,
): Promise<boolean> {
  const admin = createAdminClient()
  const { data: rows, error: lookupError } = await admin
    .from('billing_transactions')
    .select('id, user_id, amount_cents, currency, status, provider_ref, idempotency_key')
    .eq('provider_ref', result.reference)
    .limit(5)
  // A failed lookup must not read as "not a top-up": the caller would fall
  // through to other settlement paths and could report `no_match` for a paid charge.
  requireOk('payments.topup.lookup', { error: lookupError })

  const charge = (rows ?? []).find((row) =>
    row.idempotency_key?.startsWith(TOPUP_ORDER_PREFIX),
  ) as PendingTopUpCharge | undefined
  if (!charge) return false

  if (result.status === 'paid') {
    const facts: TopUpPaymentFacts = {
      paidAmountCents: result.paidAmountCents,
      paidCurrency: result.paidCurrency,
      orderRef: result.orderRef,
    }
    const verdict = verifyTopUpPayment(charge, facts)
    if (!verdict.ok) {
      console.log('[v0] settleTopUpResult: payment rejected, no credit', {
        chargeId: charge.id,
        reason: verdict.reason,
      })
      requireOk(
        'payments.topup.reject',
        await admin
          .from('billing_transactions')
          .update({ status: 'failed' })
          .eq('id', charge.id)
          .in('status', ['pending', 'abandoned']),
      )
      return true
    }
    await grantTopUpCredits(admin, charge, verdict.pack, providerId)
    return true
  }

  if (result.status === 'failed') {
    requireOk(
      'payments.topup.fail',
      await admin
        .from('billing_transactions')
        .update({ status: 'failed' })
        .eq('id', charge.id)
        .eq('status', 'pending'),
    )
  }
  return true
}
