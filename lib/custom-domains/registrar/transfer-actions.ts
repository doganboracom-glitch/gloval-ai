'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPlatformPaymentProvider, getPlatformPaymentProviderId } from '@/lib/payments'
import type { CheckoutBuyer } from '@/lib/billing'
import { listDomainsForUser } from '../service'
import { toQuoteView, type DomainQuoteView } from '../pricing/calc'
import { loadPricingContext } from '../pricing/context'
import { resolveOrderPricing, type OrderPricing } from '../pricing/order'
import { REGISTRAR_CAPABILITIES } from './capabilities'
import { requireRegisteredByUs } from './ownership'
import { getDomainRegistrarProvider } from './provider'
import { parsePurchaseDomain } from './service'
import { encryptAuthCode, isTransferSecretConfigured } from './transfer-crypto'
import { finalizeTransferIn, isTransferSupportedTld, syncTransfersForUser } from './transfer-service'
import { isTransferCapable } from './types'

/**
 * Transfer-in (bring a domain to us) and transfer-out (lock / unlock / EPP
 * code) server actions. The EPP code is never logged, never returned from a
 * check/start action, and is persisted only encrypted until it is submitted.
 */

export type TransferErrorCode =
  | 'NOT_CONFIGURED'
  | 'INVALID_DOMAIN'
  | 'UNSUPPORTED_TLD'
  | 'AUTH_CODE_REQUIRED'
  | 'NOT_TRANSFERABLE'
  | 'INVALID_AUTH_CODE'
  | 'DOMAIN_LOCKED'
  | 'ALREADY_OWNED'
  | 'PENDING_EXISTS'
  | 'PRICING_UNAVAILABLE'
  | 'NOT_FOUND'
  | 'RESTRICTED_60_DAYS'
  | 'PROVIDER_ERROR'
  | 'UNSUPPORTED'
  | 'FAILED'

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('UNAUTHENTICATED')
  return { userId: user.id, email: user.email ?? '' }
}

async function resolveClientIp(): Promise<string> {
  try {
    const h = await headers()
    return h.get('x-forwarded-for')?.split(',')[0].trim() || h.get('x-real-ip')?.trim() || '127.0.0.1'
  } catch {
    return '127.0.0.1'
  }
}

/* ------------------------------ transfer-in ------------------------------ */

type Prepared =
  | { ok: true; domain: string; tld: string; pricing: Extract<OrderPricing, { ok: true }>; userId: string; email: string }
  | { ok: false; error: TransferErrorCode }

async function prepareTransferIn(domainInput: string, authCode: string): Promise<Prepared> {
  const { userId, email } = await requireUser()
  const registrar = getDomainRegistrarProvider()
  if (!isTransferCapable(registrar) || !isTransferSecretConfigured()) return { ok: false, error: 'NOT_CONFIGURED' }

  const parsed = parsePurchaseDomain(domainInput)
  if (!parsed) return { ok: false, error: 'INVALID_DOMAIN' }
  if (!isTransferSupportedTld(parsed.tld)) return { ok: false, error: 'UNSUPPORTED_TLD' }
  const code = authCode.trim()
  if (code.length < 4 || code.length > 128) return { ok: false, error: 'AUTH_CODE_REQUIRED' }

  const mine = await listDomainsForUser(userId)
  if (mine.some((d) => d.domain === parsed.domain)) return { ok: false, error: 'ALREADY_OWNED' }

  try {
    const check = await registrar.checkTransferIn(parsed.domain, code)
    if (check.locked) return { ok: false, error: 'DOMAIN_LOCKED' }
    if (!check.authCodeValid) return { ok: false, error: 'INVALID_AUTH_CODE' }
    if (!check.transferable) return { ok: false, error: 'NOT_TRANSFERABLE' }

    const price = await registrar.getTransferPrice(parsed.tld)
    if (!price) return { ok: false, error: 'PRICING_UNAVAILABLE' }
    const pricing = resolveOrderPricing({
      price: { registerCents: price.transferCents, currency: price.currency },
      periodYears: 1,
      context: await loadPricingContext(),
    })
    if (!pricing.ok) return { ok: false, error: 'PRICING_UNAVAILABLE' }
    return { ok: true, domain: parsed.domain, tld: parsed.tld, pricing, userId, email }
  } catch {
    return { ok: false, error: 'PROVIDER_ERROR' }
  }
}

export type CheckTransferInResult =
  | { ok: true; domain: string; quote: DomainQuoteView }
  | { ok: false; error: TransferErrorCode }

export async function checkMyTransferIn(domainInput: string, authCode: string): Promise<CheckTransferInResult> {
  const prepared = await prepareTransferIn(domainInput, authCode)
  if (!prepared.ok) return prepared
  return { ok: true, domain: prepared.domain, quote: toQuoteView(prepared.pricing.snapshot) }
}

export type StartTransferInResult =
  | { ok: true; transferId: string; redirectUrl?: string }
  | { ok: false; error: TransferErrorCode }

export async function startMyTransferIn(
  domainInput: string,
  authCode: string,
  buyer?: CheckoutBuyer,
): Promise<StartTransferInResult> {
  // Everything (eligibility, lock, price) is re-derived server-side here.
  const prepared = await prepareTransferIn(domainInput, authCode)
  if (!prepared.ok) return prepared
  const { userId, email, domain, tld, pricing } = prepared

  const encrypted = encryptAuthCode(authCode.trim())
  if (!encrypted) return { ok: false, error: 'NOT_CONFIGURED' }

  const admin = createAdminClient()
  const { data: row, error: insertErr } = await admin
    .from('domain_transfers')
    .insert({
      user_id: userId,
      domain,
      tld,
      period_years: 1,
      status: 'pending_payment',
      price_cents: pricing.orderFields.price_cents,
      currency: pricing.orderFields.currency,
      price_snapshot: pricing.orderFields.price_snapshot,
      auth_code_enc: encrypted,
    })
    .select('id')
    .single()
  if (insertErr || !row) {
    // Unique partial index: an open transfer for this user+domain already exists.
    return { ok: false, error: insertErr?.code === '23505' ? 'PENDING_EXISTS' : 'FAILED' }
  }

  const abort = async (message: string) => {
    await admin
      .from('domain_transfers')
      .update({ status: 'failed', error_message: message, auth_code_enc: null })
      .eq('id', row.id)
  }

  const providerId = getPlatformPaymentProviderId()
  let intent
  try {
    intent = await getPlatformPaymentProvider().createIntent({
      orderId: `domtrf_${row.id}`,
      amountCents: pricing.paymentAmount.amountCents,
      currency: pricing.paymentAmount.currency,
      customerEmail: email,
      returnUrl: '/dashboard/domains',
      publicConfig: buyer
        ? {
            buyer: {
              fullName: buyer.fullName,
              phone: buyer.phone,
              address: buyer.address,
              identityNumber: buyer.taxId,
              ip: await resolveClientIp(),
            },
          }
        : undefined,
    })
  } catch {
    await abort('payment_init_failed')
    return { ok: false, error: 'FAILED' }
  }
  if (intent.status === 'failed') {
    await abort('payment_failed')
    return { ok: false, error: 'FAILED' }
  }

  await admin
    .from('domain_transfers')
    .update({ payment_provider: providerId, payment_reference: intent.reference })
    .eq('id', row.id)

  await admin.from('billing_transactions').upsert(
    {
      user_id: userId,
      kind: 'charge',
      amount_cents: pricing.paymentAmount.amountCents,
      currency: pricing.paymentAmount.currency,
      status: intent.action === 'completed' ? 'succeeded' : 'pending',
      provider: providerId,
      provider_ref: intent.reference,
      idempotency_key: `domtrf_${row.id}`,
      description: `Alan adı transferi — ${domain}`,
    },
    { onConflict: 'user_id,idempotency_key', ignoreDuplicates: false },
  )

  if (intent.action === 'completed') {
    await admin.from('domain_transfers').update({ status: 'payment_verified' }).eq('id', row.id)
    await finalizeTransferIn(row.id)
    revalidatePath('/dashboard/domains')
    return { ok: true, transferId: row.id }
  }
  return { ok: true, transferId: row.id, redirectUrl: intent.redirectUrl }
}

export type MyDomainTransfer = {
  id: string
  domain: string
  status: string
  priceCents: number
  currency: string
  createdAt: string
  errorMessage: string | null
}

export async function getMyDomainTransfers(): Promise<MyDomainTransfer[]> {
  const { userId } = await requireUser()
  await syncTransfersForUser(userId)
  const admin = createAdminClient()
  const { data } = await admin
    .from('domain_transfers')
    .select('id, domain, status, price_cents, currency, created_at, error_message')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    domain: String(r.domain),
    status: String(r.status),
    priceCents: Number(r.price_cents),
    currency: String(r.currency),
    createdAt: String(r.created_at),
    errorMessage: r.error_message ? String(r.error_message) : null,
  }))
}

/* ------------------------------ transfer-out ----------------------------- */

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000

export type TransferOutStatus =
  | {
      ok: true
      supported: true
      locked: boolean
      expiresAt: string | null
      /** ISO date after which transfer-out is allowed; null when already allowed. */
      restrictedUntil: string | null
    }
  | { ok: true; supported: false; reason: 'UNSUPPORTED_TLD' | 'NOT_REGISTERED_HERE' }
  | { ok: false; error: TransferErrorCode }

export async function getMyTransferOutStatus(domainInput: string): Promise<TransferOutStatus> {
  const { userId } = await requireUser()
  const registrar = getDomainRegistrarProvider()
  if (!isTransferCapable(registrar)) return { ok: false, error: 'NOT_CONFIGURED' }
  const domain = await requireRegisteredByUs(userId, domainInput)
  if (!domain) return { ok: true, supported: false, reason: 'NOT_REGISTERED_HERE' }
  const parsed = parsePurchaseDomain(domain)
  if (!parsed || !isTransferSupportedTld(parsed.tld)) return { ok: true, supported: false, reason: 'UNSUPPORTED_TLD' }
  try {
    const info = await registrar.getOwnedDomainInfo(domain)
    if (!info) return { ok: false, error: 'NOT_FOUND' }
    const startedMs = info.startedAt ? Date.parse(info.startedAt) : Number.NaN
    const until = Number.isFinite(startedMs) ? startedMs + SIXTY_DAYS_MS : 0
    return {
      ok: true,
      supported: true,
      locked: info.locked,
      expiresAt: info.expiresAt,
      restrictedUntil: until > Date.now() ? new Date(until).toISOString() : null,
    }
  } catch {
    return { ok: false, error: 'PROVIDER_ERROR' }
  }
}

export async function setMyTransferLock(
  domainInput: string,
  locked: boolean,
): Promise<{ ok: true; locked: boolean } | { ok: false; error: TransferErrorCode }> {
  const { userId } = await requireUser()
  const registrar = getDomainRegistrarProvider()
  if (!isTransferCapable(registrar)) return { ok: false, error: 'NOT_CONFIGURED' }
  const domain = await requireRegisteredByUs(userId, domainInput)
  if (!domain) return { ok: false, error: 'NOT_FOUND' }
  // OTE showed an `OK` reply with no state change, so a "success" here cannot be trusted.
  if (!REGISTRAR_CAPABILITIES.transferLockChange) return { ok: false, error: 'UNSUPPORTED' }
  try {
  await registrar.setTransferLock(domain, locked)
    return { ok: true, locked }
  } catch {
    return { ok: false, error: 'PROVIDER_ERROR' }
  }
}

/** Returns the EPP code once to the authenticated owner. The code is not logged or stored. */
export async function revealMyAuthCode(
  domainInput: string,
): Promise<{ ok: true; authCode: string } | { ok: false; error: TransferErrorCode }> {
  const status = await getMyTransferOutStatus(domainInput)
  if (!status.ok) return status
  if (!status.supported) return { ok: false, error: status.reason === 'UNSUPPORTED_TLD' ? 'UNSUPPORTED_TLD' : 'NOT_FOUND' }
  if (status.restrictedUntil) return { ok: false, error: 'RESTRICTED_60_DAYS' }
  if (status.locked) return { ok: false, error: 'DOMAIN_LOCKED' }

  const { userId } = await requireUser()
  const registrar = getDomainRegistrarProvider()
  if (!isTransferCapable(registrar)) return { ok: false, error: 'NOT_CONFIGURED' }
  const domain = await requireRegisteredByUs(userId, domainInput)
  if (!domain) return { ok: false, error: 'NOT_FOUND' }
  try {
    const authCode = await registrar.getAuthCode(domain)
    return authCode ? { ok: true, authCode } : { ok: false, error: 'NOT_FOUND' }
  } catch {
    return { ok: false, error: 'PROVIDER_ERROR' }
  }
}
