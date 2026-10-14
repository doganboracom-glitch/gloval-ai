import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { STORE_PAYMENT_ERROR_CODE } from '@/lib/store-payment-policy'
import { tokenSecret } from '@/lib/store-order-access'
import {
  buildInitializeBody,
  checkBuyer,
  initializeCheckoutForm,
  type BuyerCheck,
  type IyzicoBasketLine,
  type IyzicoCredentials,
} from '@/lib/store-payments/iyzico'
import { buildReturnUrl, newReturnNonce } from '@/lib/store-payments/iyzico-callback'
import { loadIyzicoCredentials, orderColumnsReady } from '@/lib/store-payments/iyzico-credentials'

type Admin = ReturnType<typeof createAdminClient>
type Buyer = Extract<BuyerCheck, { ok: true }>['buyer']

export const CARD_ERROR = {
  buyerInfoMissing: 'card_buyer_info_missing',
  unavailable: 'card_payment_unavailable',
} as const

export type PrepareResult =
  | { ok: true; creds: IyzicoCredentials; buyer: Buyer }
  | { ok: false; error: string; missing?: string[] }

/**
 * Everything that can be checked BEFORE an order and its stock reservation
 * exist: the store's keys are present, readable and connection-tested, the
 * order table can carry the callback nonce, and iyzico's mandatory buyer data
 * is complete. A failure here costs the store nothing.
 */
export async function prepareIyzicoCheckout(
  admin: Admin,
  projectId: string,
  customer: {
    name: string
    lastName?: string
    email: string
    phone?: string
    address?: string
    city?: string
    district?: string
    postalCode?: string
  },
  invoiceTckn: string | undefined,
  ip: string,
): Promise<PrepareResult> {
  const loaded = await loadIyzicoCredentials(admin, projectId)
  if (!loaded.ok || !loaded.tested || !(await orderColumnsReady(admin))) {
    return { ok: false, error: STORE_PAYMENT_ERROR_CODE.not_configured }
  }
  const check = checkBuyer({
    name: customer.name,
    lastName: customer.lastName || '',
    email: customer.email,
    phone: customer.phone || '',
    address: customer.address || '',
    city: customer.city || '',
    district: customer.district,
    postalCode: customer.postalCode,
    ip,
    identityNumber: invoiceTckn,
  })
  if (!check.ok) return { ok: false, error: CARD_ERROR.buyerInfoMissing, missing: check.missing }
  return { ok: true, creds: loaded.creds, buyer: check.buyer }
}

export type StartResult = { ok: true; paymentUrl: string } | { ok: false; error: string }

/**
 * Opens the iyzico checkout form for a freshly created order and records the
 * form token as the order's payment reference. The amount comes from the
 * server-side order, never from the client.
 */
export async function startIyzicoPayment(
  admin: Admin,
  input: {
    projectId: string
    orderId: string
    totalCents: number
    currency: string
    lines: IyzicoBasketLine[]
    shippingCents: number
    creds: IyzicoCredentials
    buyer: Buyer
  },
): Promise<StartResult> {
  const fail = (error: string): StartResult => ({ ok: false, error })
  try {
    const nonce = newReturnNonce()
    const { error: nonceError } = await admin
      .from('ecommerce_orders')
      .update({ payment_nonce: nonce })
      .eq('id', input.orderId)
      .eq('project_id', input.projectId)
    if (nonceError) return fail(CARD_ERROR.unavailable)

    const body = buildInitializeBody({
      orderId: input.orderId,
      totalCents: input.totalCents,
      currency: input.currency,
      lines: input.lines,
      shippingCents: input.shippingCents,
      buyer: input.buyer,
      callbackUrl: buildReturnUrl(input.projectId, input.orderId, nonce, tokenSecret()),
    })
    const result = await initializeCheckoutForm(input.creds, body)
    if (!result.ok) {
      console.error('[store-iyzico] initialize failed', {
        projectId: input.projectId,
        orderId: input.orderId,
        reason: result.reason,
      })
      return fail(result.reason === 'auth' ? STORE_PAYMENT_ERROR_CODE.not_configured : CARD_ERROR.unavailable)
    }

    const { error: refError } = await admin
      .from('ecommerce_orders')
      .update({ payment_ref: result.token })
      .eq('id', input.orderId)
      .eq('project_id', input.projectId)
    if (refError) return fail(CARD_ERROR.unavailable)
    return { ok: true, paymentUrl: result.paymentPageUrl }
  } catch (err) {
    console.error('[store-iyzico] start threw', {
      projectId: input.projectId,
      orderId: input.orderId,
      message: err instanceof Error ? err.message : 'unknown',
    })
    return fail(CARD_ERROR.unavailable)
  }
}
