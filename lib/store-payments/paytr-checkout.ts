import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { tenantUrl } from '@/lib/domains'
import {
  toMerchantOid,
  toPaytrCurrency,
  type PaytrCredentials,
} from '@/lib/store-payments/paytr-core'
import { requestPaytrToken } from '@/lib/store-payments/paytr-client'

type Admin = ReturnType<typeof createAdminClient>

export type StartPaytrCheckoutInput = {
  admin: Admin
  projectId: string
  storeSlug: string
  credentials: PaytrCredentials
  order: { id: string; totalCents: number; currency: string }
  /** `/site/<slug>/order/<id>?t=<token>` path of the signed order page. */
  orderPath: string
  customer: { name: string; email: string; phone: string; address: string }
  lines: { name: string; unit_price_cents: number; quantity: number }[]
  userIp: string
}

export type StartPaytrCheckoutResult =
  | { ok: true; paymentUrl: string }
  | { ok: false; error: 'payment_init_failed' }

/**
 * Absolute buyer return URL on the store's public host. The internal
 * `/site/<slug>` prefix is dropped: the tenant host rewrites `/order/...` back
 * onto the same route.
 */
export function buildPaytrReturnUrl(storeSlug: string, orderPath: string): string {
  const prefix = `/site/${storeSlug}`
  const path = orderPath.startsWith(prefix) ? orderPath.slice(prefix.length) : orderPath
  return `${tenantUrl(storeSlug)}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * Asks PayTR for a payment token with the store's own credentials and records
 * `merchant_oid` as the order's payment reference (what the callback is
 * matched on). On any failure nothing sensitive is returned or logged.
 */
export async function startPaytrCheckout(
  input: StartPaytrCheckoutInput,
): Promise<StartPaytrCheckoutResult> {
  const currency = toPaytrCurrency(input.order.currency)
  if (!currency) return { ok: false, error: 'payment_init_failed' }

  const merchantOid = toMerchantOid(input.order.id)
  const returnUrl = buildPaytrReturnUrl(input.storeSlug, input.orderPath)

  const { error: refError } = await input.admin
    .from('ecommerce_orders')
    .update({ payment_ref: merchantOid })
    .eq('id', input.order.id)
    .eq('project_id', input.projectId)
  if (refError) {
    console.error('[store-paytr] reference save failed', { orderId: input.order.id, code: refError.code })
    return { ok: false, error: 'payment_init_failed' }
  }

  const result = await requestPaytrToken({
    credentials: input.credentials,
    userIp: input.userIp,
    merchantOid,
    email: input.customer.email.slice(0, 100),
    amountCents: input.order.totalCents,
    currency,
    lines: input.lines.map((l) => ({
      name: l.name,
      unitPriceCents: l.unit_price_cents,
      quantity: l.quantity,
    })),
    userName: input.customer.name,
    userAddress: input.customer.address || '-',
    userPhone: input.customer.phone || '-',
    okUrl: returnUrl,
    failUrl: returnUrl,
  })

  if (!result.ok) {
    console.error('[store-paytr] token request failed', {
      orderId: input.order.id,
      projectId: input.projectId,
      reason: result.error,
    })
    return { ok: false, error: 'payment_init_failed' }
  }
  return { ok: true, paymentUrl: result.frameUrl }
}
