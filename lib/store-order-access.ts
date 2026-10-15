import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { platformUrl } from '@/lib/domains'
import { getCurrentCustomerIdForProject } from '@/lib/store-customer'
import { verifyOrderToken } from '@/lib/store-order-token'
import { buildOrderPath, issueOrderAccessToken, tokenSecret } from '@/lib/store-order-link'
import { canAccessOrder, firstNameOf, maskEmail } from '@/lib/store-order-privacy'
import { isManualStoreProvider } from '@/lib/store-payment-policy'
import {
  buildBankTransferInstructions,
  isAwaitingBankTransfer,
  type BankTransferInstructionsData,
} from '@/lib/bank-transfer-instructions'
import { loadBankTransferConfig } from '@/lib/bank-transfer-instructions-server'
import { orderCodFeeCents } from '@/lib/store-checkout-rules'
import { readOrderItems } from '@/lib/store-order-items'
import { carrierName } from '@/lib/shipping-carriers'
import { isMissingColumnError } from '@/lib/store-schema-compat'
import { needsAttention } from '@/lib/store-order-attention'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Every column the public order page reads; each must exist on `ecommerce_orders`. */
export const ORDER_CONFIRMATION_COLUMNS =
  'id, project_id, customer_id, status, payment_status, customer_name, customer_email, subtotal_cents, shipping_cents, total_cents, currency, created_at, payment_provider, shipping_status, tracking_carrier, tracking_number'

export { tokenSecret, issueOrderAccessToken, buildOrderPath }

/** Canonical absolute order URL. The platform route works on every host and preserves the signed token. */
export function orderStatusUrl(storeSlug: string, orderId: string, token = issueOrderAccessToken(orderId)): string {
  return platformUrl(buildOrderPath(storeSlug, orderId, token))
}

export type OrderConfirmation = {
  id: string
  status: string
  payment_status: string
  first_name: string
  masked_email: string
  total_cents: number
  subtotal_cents: number
  /** Shipping charge included in total_cents (0 = free, or an order from before shipping existed). */
  shipping_cents: number
  /** Cash-on-delivery surcharge included in total_cents (0 for other methods). */
  cod_fee_cents: number
  currency: string
  created_at: string
  payment_provider: string | null
  shipping_status: string | null
  carrier: string | null
  tracking_number: string | null
  /** Payment received but the order is still being completed (shown as processing, never as failed). */
  attention: boolean
  language: 'tr' | 'en'
  store_base_url: string | null
  contact_email: string | null
  has_contact_section: boolean
  /** Non-secret bank details, only for a bank-transfer order still awaiting payment. */
  bank: BankTransferInstructionsData | null
  /** Bank-transfer order still awaiting payment but the store has no IBAN on file. */
  bank_missing: boolean
  items: {
    name: string
    unit_price_cents: number
    quantity: number
    line_total_cents: number
    /** Frozen at order time; absent on orders placed before the VAT migration. */
    vat_rate?: number | null
    vat_cents?: number | null
  }[]
}

/**
 * Public order-confirmation read. Returns data only when the order belongs to
 * the store in the URL AND the caller holds a valid access token or is the
 * logged-in customer who owns the order. Every other case returns null, so the
 * caller renders the same "not found" page whether or not the order exists.
 * The result is deliberately minimal: first name and masked email only, never
 * phone or address.
 */
export async function getOrderConfirmation(
  orderId: string,
  storeSlug: string,
  accessToken: string | null | undefined,
): Promise<OrderConfirmation | null> {
  if (!UUID.test(orderId) || !storeSlug) return null

  const admin = createAdminClient()
  const { data: project } = await admin
    .from('projects')
    .select('id, schema_data')
    .eq('slug', storeSlug)
    .eq('published', true)
    .maybeSingle()
  if (!project) return null

  const { data: order, error: orderError } = await admin
    .from('ecommerce_orders')
    .select(ORDER_CONFIRMATION_COLUMNS)
    .eq('id', orderId)
    .eq('project_id', project.id)
    .maybeSingle()
  if (orderError) {
    console.error('[store-order-access] order read failed', { orderId, code: orderError.code, message: orderError.message })
    return null
  }
  if (!order) return null

  const tokenValid = verifyOrderToken(orderId, accessToken, tokenSecret())
  let sessionOwnsOrder = false
  if (!tokenValid && order.customer_id) {
    const sessionCustomerId = await getCurrentCustomerIdForProject(project.id)
    sessionOwnsOrder = !!sessionCustomerId && sessionCustomerId === order.customer_id
  }

  if (
    !canAccessOrder({
      orderProjectId: order.project_id,
      slugProjectId: project.id,
      tokenValid,
      sessionOwnsOrder,
    })
  ) {
    return null
  }

  const items = await readOrderItems<OrderConfirmation['items'][number]>(
    admin,
    orderId,
    'name, unit_price_cents, quantity, line_total_cents',
  )

  // Separate read: the column only exists once scripts/053 is applied.
  const { data: flag, error: flagError } = await admin
    .from('ecommerce_orders')
    .select('attention_at')
    .eq('id', orderId)
    .maybeSingle()
  if (flagError && !isMissingColumnError(flagError)) {
    console.error('[store-order-access] attention read failed', { orderId, code: flagError.code })
  }
  const attention = needsAttention({
    attention_at: (flag as { attention_at?: string | null } | null)?.attention_at ?? null,
    status: order.status,
    payment_status: order.payment_status,
  })

  const provider = (order.payment_provider as string | null) ?? null
  const bankInput = {
    id: order.id,
    created_at: order.created_at,
    status: order.status,
    payment_status: order.payment_status,
    payment_provider: provider,
    shipping_status: (order.shipping_status as string | null) ?? null,
  }
  const bankApplies = provider === 'bank_transfer' && isManualStoreProvider(provider)
  const bank = bankApplies
    ? buildBankTransferInstructions(await loadBankTransferConfig(admin, project.id), bankInput)
    : null
  const bankMissing = bankApplies && !bank && isAwaitingBankTransfer(bankInput)

  const schema = (project.schema_data ?? {}) as { meta?: { language?: 'tr' | 'en' }; sections?: Array<{ type?: string; email?: string; hidden?: boolean; sampleFields?: string[] }> }
  const contact = schema.sections?.find((section) => section.type === 'contact' && section.hidden !== true)
  const { data: domain } = await admin
    .from('custom_domains')
    .select('domain')
    .eq('website_project_id', project.id)
    .eq('status', 'active')
    .maybeSingle()

  return {
    id: order.id,
    status: order.status,
    shipping_status: (order.shipping_status as string | null) ?? null,
    carrier: carrierName(order.tracking_carrier as string | null) || null,
    tracking_number: (order.tracking_number as string | null) ?? null,
    attention,
    payment_provider: provider,
    language: schema.meta?.language === 'en' ? 'en' : 'tr',
    store_base_url: domain?.domain ? `https://${domain.domain}` : null,
    contact_email: contact?.sampleFields?.includes('email') ? null : (contact?.email ?? null),
    has_contact_section: !!contact,
    bank,
    bank_missing: bankMissing,
    payment_status: order.payment_status,
    first_name: firstNameOf(order.customer_name),
    masked_email: maskEmail(order.customer_email),
    total_cents: order.total_cents,
    subtotal_cents: order.subtotal_cents ?? 0,
    shipping_cents: order.shipping_cents ?? 0,
    cod_fee_cents: orderCodFeeCents(order),
    currency: order.currency,
    created_at: order.created_at,
    items: items ?? [],
  }
}
