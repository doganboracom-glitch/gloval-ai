import { createAdminClient } from '@/lib/supabase/admin'
import { logUserEvent, formatTicketNumber } from '@/lib/notify'
import { evaluateDomainPaymentStackFromEnv } from '@/lib/payments/domain-e2e-mode'
import { getDomainProvider } from '../provider'
import { getDomainRegistrarProvider } from './provider'
import { isOutcomeUnknown, STALE_PENDING_MS } from './transfer-service'
import {
  isTransferCapable,
  RegistrarError,
  type DomainAvailabilityResult,
  type RegistrantContact,
} from './types'

/**
 * Data-access layer for buying a brand-new domain (search + finalize
 * registration). Mirrors the read/write split of `../service.ts`: server
 * actions in `./actions.ts` never touch Supabase directly, they call in here.
 */

// Reasonable default spread for a bare label search (no TLD typed). Kept
// short — every extra TLD is one more `CheckAvailability` call to the
// registrar per search.
const DEFAULT_SEARCH_TLDS = ['com', 'net', 'org', 'co', 'com.tr', 'info']

export type ParsedSearchQuery = { label: string; tld: string | null }

/**
 * Accepts either a bare label ("myshop") or a full domain ("myshop.com").
 * Deliberately looser than `../normalize.ts` (which is for domains a customer
 * already owns elsewhere): a search box needs to tolerate a half-typed label.
 */
export function parseSearchQuery(raw: string): ParsedSearchQuery | null {
  const value = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
  if (!value || /\s/.test(value)) return null

  const parts = value.split('.')
  if (parts.length === 1) {
    if (!/^[a-z0-9-]{1,63}$/.test(parts[0])) return null
    return { label: parts[0], tld: null }
  }

  const label = parts[0]
  const tld = parts.slice(1).join('.')
  if (!label || !tld || !/^[a-z0-9-]{1,63}$/.test(label)) return null
  if (!/^[a-z0-9.-]+$/.test(tld)) return null
  return { label, tld }
}

/** Full parsed-domain re-check used at purchase time, stricter than the search parser. */
export function parsePurchaseDomain(raw: string): { domain: string; tld: string } | null {
  const value = raw.trim().toLowerCase()
  if (!value || /\s/.test(value)) return null
  const parts = value.split('.')
  if (parts.length < 2 || parts.some((p) => !p)) return null
  if (!/^[a-z0-9-]{1,63}$/.test(parts[0])) return null
  const tld = parts.slice(1).join('.')
  return { domain: value, tld }
}

export async function searchDomainAvailability(rawQuery: string): Promise<DomainAvailabilityResult[]> {
  const parsed = parseSearchQuery(rawQuery)
  if (!parsed) throw new RegistrarError('INVALID_DOMAIN')

  const registrar = getDomainRegistrarProvider()
  if (!registrar) throw new RegistrarError('NOT_CONFIGURED')

  const primaryTld = parsed.tld ?? DEFAULT_SEARCH_TLDS[0]
  const altTlds = parsed.tld ? [] : DEFAULT_SEARCH_TLDS.slice(1)
  return registrar.checkAvailability(`${parsed.label}.${primaryTld}`, altTlds)
}

type DomainOrderRow = {
  id: string
  user_id: string
  domain: string
  period_years: number
  status: string
  price_cents: number
  currency: string
  payment_reference: string | null
  provider_response: { contact?: RegistrantContact } | null
  provider_domain_id?: string | null
}

/**
 * Runs the actual registrar call for an already-paid order and hands the
 * result off into the existing `DomainProvider` (the purchased domain shows
 * up in the customer's list the same way a manually-added one would).
 *
 * Idempotent: safe to call more than once for the same order (e.g. once
 * synchronously from the mock payment path and again from a retried
 * webhook) — a terminal `active`/`registration_failed` status short-circuits.
 * Never throws; every failure path is recorded on the order row instead, so a
 * caller (payment settlement) can treat this as fire-and-forget.
 */
/**
 * Looks up orders whose registrar outcome was unknown. Only a registrar report
 * of the domain as ours and active completes the order; anything else stays
 * for manual review (no automatic failure, delete, or refund).
 */
export async function reconcileDomainOrders(): Promise<{ checked: number; completed: number }> {
  const registrar = getDomainRegistrarProvider()
  if (!isTransferCapable(registrar)) return { checked: 0, completed: 0 }
  const admin = createAdminClient()
  const { data: rows } = await admin
    .from('domain_orders')
    .select('id, user_id, domain')
    .eq('status', 'registration_reconciliation_required')
    .order('updated_at', { ascending: true })
    .limit(50)
  let completed = 0
  const touch = (id: string) =>
    admin
      .from('domain_orders')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'registration_reconciliation_required')
  for (const row of (rows ?? []) as { id: string; user_id: string; domain: string }[]) {
    try {
      const info = await registrar.getOwnedDomainInfo(row.domain)
      if (!info || info.status.toLowerCase() !== 'active') {
        await touch(row.id)
        continue
      }
      const claimed = await admin
        .from('domain_orders')
        .update({ status: 'active', expires_at: info.expiresAt })
        .eq('id', row.id)
        .eq('status', 'registration_reconciliation_required')
        .select('id')
      if (!claimed.data || claimed.data.length === 0) continue
      const custom = await getDomainProvider().addDomain({
        userId: row.user_id,
        domain: row.domain,
        registered: { orderId: row.id, expiresAt: info.expiresAt },
      })
      await admin.from('domain_orders').update({ custom_domain_id: custom.id }).eq('id', row.id)
      completed++
    } catch (error) {
      console.log('[v0] order reconciliation failed', row.id, error instanceof Error ? error.message : 'unknown')
      await touch(row.id)
    }
  }
  return { checked: rows?.length ?? 0, completed }
}

/**
 * Orders stuck in `registration_pending` lost their worker mid registrar call.
 * The conditional UPDATE is the lock (only one cron can match a row). They go
 * to the uncertain state; no re-register, no second payment, no refund.
 */
export async function sweepStaleOrders(olderThanMs = STALE_PENDING_MS): Promise<number> {
  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - olderThanMs).toISOString()
  const { data } = await admin
    .from('domain_orders')
    .update({
      status: 'registration_reconciliation_required',
      error_message: 'register_outcome_unknown_stale',
      updated_at: new Date().toISOString(),
    })
    .eq('status', 'registration_pending')
    .lt('updated_at', cutoff)
    .select('id')
  return data?.length ?? 0
}

export async function finalizeDomainOrder(orderId: string): Promise<void> {
  const admin = createAdminClient()
  const { data: order } = await admin
    .from('domain_orders')
    .select('id, user_id, domain, period_years, status, price_cents, currency, payment_reference, provider_response')
    .eq('id', orderId)
    .maybeSingle<DomainOrderRow>()
  if (!order) return
  if (order.status === 'active' || order.status === 'registration_failed') return

  // Operator kill-switch for payment-flow testing: a verified payment is
  // recorded (`payment_verified`) but the registrar is never called. Unset it
  // and re-run finalize to release held orders.
  if (process.env.DOMAIN_REGISTRATION_HOLD === 'true') {
    console.log('[v0] finalizeDomainOrder: registration held (DOMAIN_REGISTRATION_HOLD)', { orderId })
    return
  }

  // Re-check the payment/registrar pairing right before the paid registrar
  // call. A mismatch leaves the order `payment_verified` (retryable once the
  // configuration is fixed) and never reaches the registrar.
  const stack = evaluateDomainPaymentStackFromEnv()
  if (!stack.allowed) {
    console.log('[v0] finalizeDomainOrder: blocked by payment stack guard', { orderId, reason: stack.reason })
    await admin
      .from('domain_orders')
      .update({ error_message: `stack_guard:${stack.reason}`, updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .in('status', ['pending_payment', 'payment_verified'])
    return
  }

  const contact = order.provider_response?.contact
  if (!contact) {
    await admin
      .from('domain_orders')
      .update({ status: 'registration_failed', error_message: 'missing_registrant_contact' })
      .eq('id', orderId)
    return
  }

  const registrar = getDomainRegistrarProvider()
  if (!registrar) {
    await admin
      .from('domain_orders')
      .update({ status: 'registration_failed', error_message: 'registrar_not_configured' })
      .eq('id', orderId)
    return
  }

  // Atomic claim: only one concurrent caller (webhook retry, sync path) may
  // reach the registrar, otherwise the customer could be registered/charged twice.
  const { data: claimed } = await admin
    .from('domain_orders')
    .update({ status: 'registration_pending', updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .in('status', ['pending_payment', 'payment_verified'])
    .select('id')
  if (!claimed || claimed.length === 0) return

  try {
    const result = await registrar.registerDomain({
      domain: order.domain,
      periodYears: order.period_years,
      contact,
    })

    // We registered this domain on the customer's behalf, so ownership is
    // already proven: it is created `active` (idempotent per order).
    const finalDomain = await getDomainProvider().addDomain({
      userId: order.user_id,
      domain: order.domain,
      registered: { orderId, expiresAt: result.expiresAt },
    })

    await admin
      .from('domain_orders')
      .update({
        status: 'active',
        provider_domain_id: result.providerDomainId,
        custom_domain_id: finalDomain.id,
        expires_at: result.expiresAt,
      })
      .eq('id', orderId)

    await logUserEvent({
      userId: order.user_id,
  type: 'domain_registered',
  subject: 'Alan adı kaydı tamamlandı',
  includeBillingProfileReminder: true,
      body: `${order.domain} alan adınız başarıyla kaydedildi ve hesabınıza eklendi. İşlem No: ${formatTicketNumber(order.payment_reference ?? orderId)}.`,
      emailAdmin: true,
      adminSubject: (userEmail) => `${userEmail} yeni alan adı satın aldı: ${order.domain}`,
      adminBody: (userEmail) =>
        `Kullanıcı e-posta adresi: ${userEmail}\nAlan adı: ${order.domain}\nSüre: ${order.period_years} yıl\nTutar: ${(order.price_cents / 100).toFixed(2)} ${order.currency}\nİşlem No: ${formatTicketNumber(order.payment_reference ?? orderId)}\nİşlem sonucu: Başarılı`,
    })
  } catch (error) {
    const code = error instanceof RegistrarError ? error.code : 'PROVIDER_ERROR'
    // Registrar errors already carry a sanitized one-line diagnostic as their
    // message; anything else is an unexpected local error, so keep it short.
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 900)
    console.log('[v0] finalizeDomainOrder: registration failed', {
      orderId,
      code,
      diagnostic: error instanceof RegistrarError ? error.diagnostic : undefined,
      message: error instanceof RegistrarError ? undefined : message,
    })

    if (isOutcomeUnknown(error)) {
      // The registrar may have registered the domain: hold the order for
      // reconciliation instead of declaring failure or refunding.
      await admin
        .from('domain_orders')
        .update({ status: 'registration_reconciliation_required', error_message: message })
        .eq('id', orderId)
      await logUserEvent({
        userId: order.user_id,
        type: 'domain_registration_failed',
        subject: 'Alan adı kaydı doğrulanıyor',
        body: `${order.domain} alan adı kaydının sonucu henüz doğrulanamadı. Otomatik olarak kontrol ediliyor; gerekirse destek ekibimiz sizinle iletişime geçecek. İşlem No: ${formatTicketNumber(order.payment_reference ?? orderId)}.`,
        emailAdmin: true,
        adminSubject: (userEmail) => `${userEmail} alan adı kaydı BELİRSİZ (reconciliation gerekli)`,
        adminBody: (userEmail) =>
          `Kullanıcı e-posta adresi: ${userEmail}\nAlan adı: ${order.domain}\nÖdeme referansı: ${order.payment_reference ?? 'yok'}\nİşlem No: ${formatTicketNumber(order.payment_reference ?? orderId)}\nRegistrar sonucu bilinmiyor; iade etmeden önce registrar panelinden kontrol edin.`,
      })
      return
    }

    await admin
      .from('domain_orders')
      .update({ status: 'registration_failed', error_message: message })
      .eq('id', orderId)

    // The buyer's payment already succeeded at this point — a registration
    // failure here means real money was charged for a domain that was not
    // delivered, which needs a human (refund or manual retry), not a silent
    // failure.
    await logUserEvent({
      userId: order.user_id,
      type: 'domain_registration_failed',
      subject: 'Alan adı kaydı başarısız oldu',
      body: `${order.domain} alan adı kaydı sırasında bir sorun oluştu. Destek ekibimiz ödemenizle ilgili sizinle iletişime geçecek. İşlem No: ${formatTicketNumber(order.payment_reference ?? orderId)}.`,
      emailAdmin: true,
      adminSubject: (userEmail) => `${userEmail} alan adı kaydı BAŞARISIZ (ödeme alınmış olabilir)`,
      adminBody: (userEmail) =>
        `Kullanıcı e-posta adresi: ${userEmail}\nAlan adı: ${order.domain}\nHata kodu: ${code}\nHata: ${message}\nÖdeme referansı: ${order.payment_reference ?? 'yok'}\nTutar: ${(order.price_cents / 100).toFixed(2)} ${order.currency}\nİşlem No: ${formatTicketNumber(order.payment_reference ?? orderId)}\nBu ödeme için manuel inceleme / iade gerekebilir.`,
    })
  }
}
