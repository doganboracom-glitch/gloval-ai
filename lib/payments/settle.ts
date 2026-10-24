import { createAdminClient } from '@/lib/supabase/admin'
import { strictDb } from '@/lib/db-guard'
import { logUserEvent, formatTicketNumber } from '@/lib/notify'
import { finalizeDomainOrder } from '@/lib/custom-domains/registrar/service'
import { finalizeTransferIn } from '@/lib/custom-domains/registrar/transfer-service'
import { finalizeRenewal } from '@/lib/custom-domains/registrar/renewal-service'
import { settleSubscriptionRenewal } from '@/lib/billing-lifecycle'
import { triggerMailAccessSync } from '@/lib/mail/access-trigger'
import { grantPlanCreditsAfterPayment } from '@/lib/plan-credit-instant-store'
import { settleTopUpResult } from './topup-fulfillment'
import { settleAddOnResult } from './addon-fulfillment'
import { verifyPaidFacts } from './paid-facts'
import type { PaymentProviderId, PaymentWebhookResult } from './types'

export type SettleOutcome =
  | 'subscription'
  | 'entitlement'
  | 'credit_topup'
  | 'addon_purchase'
  | 'domain_purchase'
  | 'renewal'
  | 'payment_rejected'
  | 'no_match'

/**
 * Shared activation logic for an ALREADY-VERIFIED payment result, regardless
 * of how it was verified: a signed push webhook (Stripe) or a
 * server-side retrieve/detail call (iyzico Checkout Form). Callers MUST have
 * cryptographically verified — or authoritatively retrieved — `result` before
 * calling this; it trusts it completely and will activate real money-gated
 * state from it.
 *
 * Used by both `app/api/billing/webhook/[provider]/route.ts` (push webhooks)
 * and `app/api/billing/checkout/iyzico/callback/route.ts` (retrieve-based
 * confirmation) so subscription/entitlement activation can never diverge
 * between the two paths.
 */
export async function settlePaymentResult(
  providerId: PaymentProviderId,
  result: PaymentWebhookResult,
): Promise<SettleOutcome> {
  // Every query here gates real money state; a failed read or write must abort
  // (the webhook then 500s and the PSP retries) rather than look like "no match".
  const admin = strictDb(createAdminClient(), 'payments.settle')
  const ref = result.reference
  const refMasked = ref.length > 10 ? `${ref.slice(0, 6)}...${ref.slice(-4)}` : `${ref.slice(0, 3)}***`
  console.log('[v0] settlePaymentResult: start', {
    providerId,
    kind: result.kind,
    status: result.status,
    refMasked,
  })

  // 1) Subscription (package) payment ------------------------------------------
  // A row is matched either by `provider_ref` (its own original charge — first
  // subscribe or a renewal) or by `pending_change_ref` (a paid upgrade in
  // flight, tracked on the SAME row as the user's active subscription rather
  // than a second row — see `changePlan`). Two separate lookups avoid passing
  // the untrusted `ref` into a combined `.or()` filter string.
  const { data: directSub } = await admin
    .from('billing_subscriptions')
    .select('id, user_id, status, plan_id, provider_ref, pending_plan_id, pending_change_ref')
    .eq('provider_ref', ref)
    .maybeSingle()
  const { data: pendingUpgradeSub } = directSub
    ? { data: null }
    : await admin
        .from('billing_subscriptions')
        .select('id, user_id, status, plan_id, provider_ref, pending_plan_id, pending_change_ref')
        .eq('pending_change_ref', ref)
        .maybeSingle()
  const sub = directSub ?? pendingUpgradeSub
  const isUpgrade = Boolean(pendingUpgradeSub)
  console.log('[v0] settlePaymentResult: subscription lookup', {
    refMasked,
    matched: Boolean(sub),
    subStatus: sub?.status,
    isUpgrade,
  })

  // 1a) Subscription RENEWAL: a `renew_*` ledger row created by
  // `renewSubscription` and matched only by its own unique provider reference.
  // Only this path may move a past_due/suspended subscription back to active.
  if (!sub) {
    const { data: renewalCharge } = await admin
      .from('billing_transactions')
      .select('id, subscription_id, user_id, amount_cents, currency, idempotency_key')
      .eq('provider_ref', ref)
      .maybeSingle()
    if (
      renewalCharge &&
      renewalCharge.subscription_id &&
      String(renewalCharge.idempotency_key ?? '').startsWith('renew_')
    ) {
      const outcome = await settleSubscriptionRenewal({
        providerId,
        reference: ref,
        status: result.status,
        paidAmountCents: result.paidAmountCents,
        paidCurrency: result.paidCurrency,
        charge: {
          id: renewalCharge.id as string,
          subscription_id: renewalCharge.subscription_id as string,
          user_id: renewalCharge.user_id as string,
          amount_cents: renewalCharge.amount_cents as number,
          currency: renewalCharge.currency as string,
          idempotency_key: renewalCharge.idempotency_key as string | null,
        },
      })
      console.log('[v0] settlePaymentResult: subscription renewal', { refMasked, outcome: outcome.kind })
      return 'subscription'
    }
  }

  if (sub) {
    const planIdForCharge = isUpgrade ? sub.pending_plan_id! : sub.plan_id
    const { data: plan } = await admin
      .from('billing_plans')
      .select('name, price_cents, currency')
      .eq('id', planIdForCharge)
      .maybeSingle()
    const { data: pendingCharge } = await admin
      .from('billing_transactions')
      .select('id, status, amount_cents, currency, idempotency_key, description')
      .eq('subscription_id', sub.id)
      .eq('provider_ref', ref)
      .maybeSingle()

    // A replay of the ORIGINAL charge's callback must never reactivate a
    // subscription that has since lapsed (past_due/suspended) nor notify twice;
    // only a verified renewal payment (1a) can do that.
    const alreadySettled =
      !isUpgrade &&
      (pendingCharge?.status === 'succeeded' || sub.status === 'past_due' || sub.status === 'suspended')
    if (pendingCharge && pendingCharge.status !== 'pending' && result.status === 'paid') return 'subscription'
    if (alreadySettled && result.status === 'paid') return 'subscription'

    if (result.status === 'paid') {
      const verdict = verifyPaidFacts(
        {
          amountCents: pendingCharge?.amount_cents ?? plan?.price_cents ?? -1,
          currency: pendingCharge?.currency ?? plan?.currency ?? '',
          orderRef: pendingCharge?.idempotency_key ?? undefined,
        },
        result,
        { require: 'amount_and_currency' },
      )
      if (!verdict.ok) {
        await admin
          .from('billing_transactions')
          .update({ status: 'failed', description: `Abonelik ödemesi doğrulanamadı (${verdict.reason})` })
          .eq('provider_ref', ref)
          .eq('status', 'pending')
        await logUserEvent({
          userId: sub.user_id,
          type: 'payment_failed',
          subject: 'Ödeme doğrulanamadı',
          body: `Abonelik ödemesi doğrulanamadı; paket değişikliği uygulanmadı. İşlem No: ${formatTicketNumber(ref)}.`,
          dedupeKey: `payment-rejected:${ref}`,
          emailAdmin: true,
          adminSubject: (userEmail) => `${userEmail} abonelik ödeme doğrulaması başarısız`,
          adminBody: (userEmail) => `Kullanıcı e-posta adresi: ${userEmail}\nSebep: ${verdict.reason}\nİşlem No: ${formatTicketNumber(ref)}`,
        })
        return 'payment_rejected'
      }
      // The idempotent ledger upsert runs BEFORE the status flip: an upgrade's
      // `pending_change_ref` is cleared by the flip, so if the ledger write failed
      // afterwards the PSP retry could no longer match this row and the charge
      // would never be recorded.
      await admin.from('billing_transactions').upsert(
        {
          subscription_id: sub.id,
          user_id: sub.user_id,
          kind: 'charge',
          amount_cents: pendingCharge?.amount_cents ?? plan?.price_cents ?? 0,
          currency: pendingCharge?.currency ?? plan?.currency ?? 'TRY',
          status: 'succeeded',
          provider: providerId,
          provider_ref: ref,
          idempotency_key: pendingCharge?.idempotency_key ?? `sub_${sub.id}_initial`,
          description: pendingCharge?.description ?? (plan ? `${plan.name} aboneliği` : 'Abonelik ödemesi'),
        },
        { onConflict: 'user_id,idempotency_key', ignoreDuplicates: false },
      )
      if (isUpgrade) {
        await admin
          .from('billing_subscriptions')
          .update({ status: 'active', plan_id: sub.pending_plan_id!, pending_plan_id: null, pending_change_ref: null })
          .eq('id', sub.id)
      } else {
        await admin.from('billing_subscriptions').update({ status: 'active' }).eq('id', sub.id)
      }
      await logUserEvent({
        userId: sub.user_id,
        type: isUpgrade ? 'plan_upgraded' : 'payment_succeeded',
  subject: isUpgrade ? 'Paket yükseltme başarılı' : 'Ödeme başarılı — paket aktif edildi',
  includeBillingProfileReminder: true,
  body: isUpgrade
          ? `Paket yükseltmeniz onaylandı. Yeni paket: ${plan?.name ?? 'Bilinmiyor'}. Ödenen ara fark: ${((pendingCharge?.amount_cents ?? 0) / 100).toFixed(2)} ${pendingCharge?.currency ?? plan?.currency ?? 'TRY'}. İşlem No: ${formatTicketNumber(ref)}.`
          : `Abonelik ödemeniz onaylandı ve paketiniz etkinleştirildi. İşlem No: ${formatTicketNumber(ref)}.`,
        emailAdmin: true,
        adminSubject: (userEmail) => `${userEmail} üye ${isUpgrade ? 'paket yükseltme' : 'ödemesi'} başarılı`,
        adminBody: (userEmail) => `Kullanıcı e-posta adresi: ${userEmail}\\nEski paket: ${isUpgrade ? 'Mevcut abonelik' : 'Yok'}\\nYeni paket: ${plan?.name ?? 'Bilinmiyor'}\\nİşlem No: ${formatTicketNumber(ref)}\\nİşlem tarihi: ${new Date().toLocaleString('tr-TR')}\\nÖdenen ara fark: ${((pendingCharge?.amount_cents ?? 0) / 100).toFixed(2)} ${pendingCharge?.currency ?? plan?.currency ?? 'TRY'}\\nİşlem sonucu: Başarılı`,
      })
      await triggerMailAccessSync(sub.user_id, isUpgrade ? 'plan_upgraded' : 'payment_succeeded')
      if (!isUpgrade) grantPlanCreditsAfterPayment(sub.id)
    } else if (result.status === 'failed') {
      if (isUpgrade) {
        await admin
          .from('billing_subscriptions')
          .update({ pending_plan_id: null, pending_change_ref: null })
          .eq('id', sub.id)
      }
      await admin.from('billing_transactions').update({ status: 'failed' }).eq('user_id', sub.user_id).eq('provider_ref', ref)
      await logUserEvent({
        userId: sub.user_id,
        type: 'payment_failed',
        subject: 'Ödeme başarısız',
        body: `Ödeme tamamlanamadı; mevcut paketiniz korunuyor. İşlem No: ${formatTicketNumber(ref)}.`,
        emailAdmin: true,
        adminSubject: (userEmail) => `${userEmail} üye ödemesi başarısız`,
        adminBody: (userEmail) => `Kullanıcı e-posta adresi: ${userEmail}\\nPaket adı: ${plan?.name ?? 'Bilinmiyor'}\\nİşlem No: ${formatTicketNumber(ref)}\\nİşlem sonucu: Başarısız`,
      })
    }
    return 'subscription'
  }


  // 1b) One-time AI credit top-up -------------------------------------------------
  // Matched by the pending `billing_transactions` row the purchase action wrote
  // (idempotency key `topup_<pack>_<nonce>`); credits are released only for a
  // verified, amount-matching "paid" result and only once.
  if (await settleTopUpResult(providerId, result)) return 'credit_topup'

  // 1c) Add-on purchase (`addon_<purchase_id>`) ---------------------------------
  // Matched by `addon_purchases.provider_ref`; the entitlement is created only by
  // `grantAddOn`, once, for a verified, matching "paid" result.
  if (await settleAddOnResult(providerId, result)) return 'addon_purchase'

  // 2) One-time per-site right (branding removal) -------------------------------
  const { data: ent } = await admin
    .from('project_entitlements')
    .select('id, user_id, project_id, code, name, amount_cents, currency, status')
    .eq('provider_ref', ref)
    .maybeSingle()

  if (ent) {
    const { data: entCharge } = await admin
      .from('billing_transactions')
      .select('status')
      .eq('provider_ref', ref)
      .maybeSingle()
    if (result.status === 'paid') {
      if (ent.status === 'active' || entCharge?.status === 'failed' || entCharge?.status === 'succeeded') return 'entitlement'
      // A right is released only when the PSP's retrieved charge matches the
      // amount/currency/order the server recorded before checkout (strict, to
      // the kuruş). An already-active right is never touched again by a replay.
      if (ent.status !== 'active') {
        const verdict = verifyPaidFacts(
          {
            amountCents: ent.amount_cents,
            currency: ent.currency,
            orderRef: `ent_${ent.project_id}_${ent.code}`,
          },
          result,
          { require: 'amount_and_currency' },
        )
        if (!verdict.ok) {
          console.log('[v0] settlePaymentResult: entitlement payment rejected, not granting', {
            refMasked,
            reason: verdict.reason,
            expectedAmountCents: ent.amount_cents,
            paidAmountCents: result.paidAmountCents,
          })
          await admin
            .from('billing_transactions')
            .update({ status: 'failed', description: `${ent.name} — ödeme reddedildi (${verdict.reason})` })
            .eq('provider_ref', ref)
            .neq('status', 'succeeded')
          await logUserEvent({
            userId: ent.user_id,
            type: 'payment_failed',
            subject: 'Ödeme doğrulanamadı',
            body: `${ent.name} ödemesi tutar doğrulamasından geçemedi; hak etkinleştirilmedi. Tahsilat varsa destek ekibimiz sizinle iletişime geçecektir.`,
            emailAdmin: true,
            adminSubject: (userEmail) => `${userEmail} ödeme tutar uyuşmazlığı (${ent.code})`,
            adminBody: (userEmail) =>
              `Kullanıcı e-posta adresi: ${userEmail}\nHak: ${ent.name}\nSebep: ${verdict.reason}\nBeklenen tutar (kuruş): ${ent.amount_cents}\nÖdenen tutar (kuruş): ${result.paidAmountCents ?? '-'}\nİşlem No: ${formatTicketNumber(ref)}\nİşlem tarihi: ${new Date().toLocaleString('tr-TR')}\nİşlem sonucu: Reddedildi — iade/manuel inceleme gerekir`,
          })
          return 'payment_rejected'
        }
        await admin
          .from('project_entitlements')
          .update({ status: 'active', granted_at: new Date().toISOString() })
          .eq('id', ent.id)
      }
      await admin.from('billing_transactions').upsert(
        {
          user_id: ent.user_id,
          kind: 'charge',
          amount_cents: ent.amount_cents,
          currency: ent.currency,
          status: 'succeeded',
          provider: providerId,
          provider_ref: ref,
          idempotency_key: `ent_${ent.project_id}_${ent.code}`,
          description: ent.name,
        },
        { onConflict: 'user_id,idempotency_key', ignoreDuplicates: false },
      )
      await logUserEvent({
        userId: ent.user_id,
        type: 'payment_succeeded',
  subject: 'Ödeme başarılı — hak etkinleştirildi',
  includeBillingProfileReminder: true,
  body: `Tek seferlik hak ödemesi onaylandı (${ent.name}).`,
        emailAdmin: true,
        adminSubject: (userEmail) => `${userEmail} üye ödemesi başarılı`,
        adminBody: (userEmail) => `Kullanıcı e-posta adresi: ${userEmail}\nPaket adı: ${ent.name}\nİşlem No: ${formatTicketNumber(ref)}\nİşlem tarihi: ${new Date().toLocaleString('tr-TR')}\nİşlem sonucu: Başarılı`,
      })
    }
    return 'entitlement'
  }

  // 3) New domain purchase (buy-a-domain, registrar registration) --------------
  const { data: domainOrder } = await admin
    .from('domain_orders')
    .select('id, user_id, status, price_cents, currency')
    .eq('payment_reference', ref)
    .maybeSingle()

  if (domainOrder) {
    if (result.status === 'paid') {
      // Never fulfil unless the PSP-reported charge matches the server-side
      // order snapshot. Fields are only present when the verified provider
      // response carried them (iyzico retrieve does).
      const verdict = verifyPaidFacts(
        { amountCents: domainOrder.price_cents, currency: domainOrder.currency, orderRef: `domreg_${domainOrder.id}` },
        result,
        { require: 'all' },
      )
      if (!verdict.ok) {
        console.log('[v0] settlePaymentResult: domain payment mismatch, not fulfilling', {
          orderId: domainOrder.id,
          reason: verdict.reason,
        })
        await admin
          .from('domain_orders')
          .update({ status: 'failed', error_message: 'payment_mismatch' })
          .eq('id', domainOrder.id)
          .eq('status', 'pending_payment')
        return 'domain_purchase'
      }
      if (domainOrder.status === 'pending_payment') {
        // Conditional so a concurrent callback holding a stale read cannot
        // roll an order already claimed for registration back to verified.
        await admin
          .from('domain_orders')
          .update({ status: 'payment_verified' })
          .eq('id', domainOrder.id)
          .eq('status', 'pending_payment')
      }
      await admin
        .from('billing_transactions')
        .update({ status: 'succeeded' })
        .eq('user_id', domainOrder.user_id)
        .eq('provider_ref', ref)
      // Runs the registrar call and every downstream side effect
      // (adding the domain, notifying the buyer) itself; never throws.
      await finalizeDomainOrder(domainOrder.id)
    } else if (result.status === 'failed') {
      // Only an unpaid order may fail; a late/duplicate failed callback must not
      // overwrite a paid, registering or active order.
      await admin
        .from('domain_orders')
        .update({ status: 'failed' })
        .eq('id', domainOrder.id)
        .eq('status', 'pending_payment')
      await admin
        .from('billing_transactions')
        .update({ status: 'failed' })
        .eq('user_id', domainOrder.user_id)
        .eq('provider_ref', ref)
        .neq('status', 'succeeded')
    }
    return 'domain_purchase'
  }

  // 3b) Inbound domain transfer ------------------------------------------------
  const { data: transferRow } = await admin
    .from('domain_transfers')
    .select('id, user_id, status, price_cents, currency')
    .eq('payment_reference', ref)
    .maybeSingle()

  if (transferRow) {
    if (result.status === 'paid') {
      const verdict = verifyPaidFacts(
        { amountCents: transferRow.price_cents, currency: transferRow.currency, orderRef: `domtrf_${transferRow.id}` },
        result,
        { require: 'all' },
      )
      if (!verdict.ok) {
        await admin
          .from('domain_transfers')
          .update({ status: 'failed', error_message: 'payment_mismatch', auth_code_enc: null })
          .eq('id', transferRow.id)
          .eq('status', 'pending_payment')
        return 'domain_purchase'
      }
      if (transferRow.status === 'pending_payment') {
        await admin
          .from('domain_transfers')
          .update({ status: 'payment_verified' })
          .eq('id', transferRow.id)
          .eq('status', 'pending_payment')
      }
      await admin
        .from('billing_transactions')
        .update({ status: 'succeeded' })
        .eq('user_id', transferRow.user_id)
        .eq('provider_ref', ref)
      await finalizeTransferIn(transferRow.id)
    } else if (result.status === 'failed') {
      await admin
        .from('domain_transfers')
        .update({ status: 'failed', auth_code_enc: null })
        .eq('id', transferRow.id)
        .eq('status', 'pending_payment')
      await admin
        .from('billing_transactions')
        .update({ status: 'failed' })
        .eq('user_id', transferRow.user_id)
        .eq('provider_ref', ref)
        .neq('status', 'succeeded')
    }
    return 'domain_purchase'
  }

  // 3c) Domain renewal ----------------------------------------------------------
  const { data: renewalRow } = await admin
    .from('domain_renewals')
    .select('id, user_id, status, price_cents, currency')
    .eq('payment_reference', ref)
    .maybeSingle()

  if (renewalRow) {
    if (result.status === 'paid') {
const verdict = verifyPaidFacts(
        { amountCents: renewalRow.price_cents, currency: renewalRow.currency, orderRef: `domren_${renewalRow.id}` },
        result,
        { require: 'all' },
      )
      // The buyer was charged, so a mismatch is never a plain "failed": it needs a
      // human to refund or correct it, and nothing is sent to the registrar.
      if (!verdict.ok) {
        await admin
          .from('domain_renewals')
          .update({
            status: 'manual_refund_required',
            error_message: 'payment_mismatch',
            updated_at: new Date().toISOString(),
          })
          .eq('id', renewalRow.id)
          .eq('status', 'pending_payment')
        return 'domain_purchase'
      }
      // A payment that lands after the row was cancelled/failed cannot be
      // renewed against the price/expiry captured earlier; flag it for a refund.
      if (renewalRow.status === 'cancelled' || renewalRow.status === 'failed') {
        await admin
          .from('domain_renewals')
          .update({
            status: 'manual_refund_required',
            error_message: 'late_payment',
            updated_at: new Date().toISOString(),
          })
          .eq('id', renewalRow.id)
          .eq('status', renewalRow.status)
        return 'domain_purchase'
      }
      if (renewalRow.status === 'pending_payment') {
        await admin
          .from('domain_renewals')
          .update({ status: 'payment_verified', updated_at: new Date().toISOString() })
          .eq('id', renewalRow.id)
          .eq('status', 'pending_payment')
      }
      await admin
        .from('billing_transactions')
        .update({ status: 'succeeded' })
        .eq('user_id', renewalRow.user_id)
        .eq('provider_ref', ref)
      await finalizeRenewal(renewalRow.id)
    } else if (result.status === 'failed') {
      await admin
        .from('domain_renewals')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', renewalRow.id)
        .eq('status', 'pending_payment')
      await admin
        .from('billing_transactions')
        .update({ status: 'failed' })
        .eq('user_id', renewalRow.user_id)
        .eq('provider_ref', ref)
        .neq('status', 'succeeded')
    }
    return 'domain_purchase'
  }

  // 4) Subscription renewal event (provider-native subscription webhooks) -------
  if (result.kind === 'subscription') {
    const subscriptionRef = result.subscriptionRef ?? ref
    const { data: renewSub } = await admin
      .from('billing_subscriptions')
      .select('id, user_id, status')
      .eq('provider_ref', subscriptionRef)
      .maybeSingle()
    if (renewSub) {
      const nextStatus =
        result.subscriptionStatus ??
        (result.status === 'paid'
          ? 'active'
          : result.status === 'failed'
            ? 'past_due'
            : renewSub.status)
      if (nextStatus !== renewSub.status) {
        await admin
          .from('billing_subscriptions')
          .update({ status: nextStatus })
          .eq('id', renewSub.id)
      }
    }
    return 'renewal'
  }

  console.log('[v0] settlePaymentResult: no_match — no subscription, entitlement, or renewal row found', {
    providerId,
    refMasked,
  })
  return 'no_match'
}
