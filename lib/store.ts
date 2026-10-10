'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPaymentProvider, isProviderImplemented, type PaymentProviderId } from '@/lib/payments'
import { getCurrentCustomerIdForProject } from '@/lib/store-customer'
import { loadStorePaymentConfig } from '@/lib/store-payment-config'
import {
  isManualStoreProvider,
  STORE_PAYMENT_ERROR_CODE,
  type StorePaymentUnavailableReason,
} from '@/lib/store-payment-policy'
import { buildOrderPath, issueOrderAccessToken } from '@/lib/store-order-access'
import { scheduleOrderNotification } from '@/lib/store-order-notifications'

export type StoreProduct = {
  id: string
  project_id: string
  name: string
  slug: string
  description: string | null
  price_cents: number
  currency: string
  stock: number
  images: string[]
  category_id: string | null
}

const MAX_QTY_PER_LINE = 99
const MAX_TOTAL_ITEMS = 999

/**
 * Public catalog read for a PUBLISHED store, via the SECURITY DEFINER RPC.
 * Uses the anon client — safe because the function only returns active
 * products of published projects.
 */
export async function getStoreProducts(slug: string): Promise<StoreProduct[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_store_products', {
    p_slug: slug,
  })
  if (error || !data) return []
  return (data as StoreProduct[]).map((p) => ({
    ...p,
    images: Array.isArray(p.images) ? p.images : [],
  }))
}

export async function getStoreProductBySlug(
  storeSlug: string,
  productSlug: string,
): Promise<StoreProduct | null> {
  const products = await getStoreProducts(storeSlug)
  return products.find((p) => p.slug === productSlug) ?? null
}

/**
 * Public read of a published store's buyer-selectable payment methods. Returns
 * only the enabled provider ids plus non-secret public config (e.g. bank
 * transfer instructions) — never any secret credential. Safe to call from the
 * checkout page. FAILS CLOSED: when the store has no usable config (or the
 * config could not be read) `available` is false and `methods` is empty — it
 * never falls back to the instant-"paid" mock provider (see
 * `lib/store-payment-policy.ts`).
 */
export async function getStorePaymentMethods(storeSlug: string): Promise<{
  available: boolean
  reason?: StorePaymentUnavailableReason
  methods: PaymentProviderId[]
  publicConfig: Record<string, unknown>
}> {
  const closed = (reason: StorePaymentUnavailableReason) => ({
    available: false as const,
    reason,
    methods: [] as PaymentProviderId[],
    publicConfig: {},
  })

  const admin = createAdminClient()
  const { data: project, error } = await admin
    .from('projects')
    .select('id')
    .eq('slug', storeSlug)
    .eq('published', true)
    .maybeSingle()
  if (error) {
    console.error('[store-payments] project lookup failed', {
      code: error.code,
      message: error.message,
    })
    return closed('config_unreadable')
  }
  if (!project) return closed('not_configured')

  const resolution = await loadStorePaymentConfig(project.id)
  if (!resolution.ok) return closed(resolution.reason)

  return {
    available: true,
    methods: resolution.methods,
    publicConfig: resolution.publicConfig,
  }
}

export type CheckoutInput = {
  storeSlug: string
  idempotencyKey: string
  customer: {
    name: string
    lastName?: string
    email: string
    phone?: string
    address?: string
    district?: string
    city?: string
    postalCode?: string
  }
  items: { productId: string; quantity: number }[]
  /** Buyer-selected payment method. Validated server-side against the owner's
   *  enabled set; ignored (falls back to the store default) if not permitted. */
  paymentMethod?: PaymentProviderId
  /** Optional invoice details (individual/corporate) captured at checkout. */
  invoice?: {
    type: 'individual' | 'corporate'
    tckn?: string
    companyName?: string
    taxOffice?: string
    taxNumber?: string
    address?: string
  } | null
}

export type CheckoutResult =
  | {
      ok: true
      orderId: string
      totalCents: number
      currency: string
      /** Order page path including the signed access token. */
      orderPath: string
    }
  | { ok: false; error: string }

/**
 * Sanitizes checkout invoice input into a stored jsonb shape, keeping only the
 * fields relevant to the chosen type. Returns null when nothing usable is
 * provided so guest orders without invoice details stay clean.
 */
function normalizeCheckoutInvoice(
  raw: CheckoutInput['invoice'],
): Record<string, string> | null {
  if (!raw || typeof raw !== 'object') return null
  const clean = (v?: string) => (typeof v === 'string' ? v.trim() : '')
  if (raw.type === 'corporate') {
    const companyName = clean(raw.companyName)
    const taxNumber = clean(raw.taxNumber)
    if (!companyName && !taxNumber) return null
    return {
      type: 'corporate',
      companyName,
      taxOffice: clean(raw.taxOffice),
      taxNumber,
      address: clean(raw.address),
    }
  }
  const tckn = clean(raw.tckn)
  const address = clean(raw.address)
  if (!tckn && !address) return { type: 'individual' }
  return { type: 'individual', tckn, address }
}

/**
 * Creates an order for an anonymous buyer. All money math is recomputed
 * server-side from authoritative DB prices — the client's prices are ignored.
 * Idempotency prevents a retry/double-submit from creating duplicate orders.
 */
export async function createOrder(input: CheckoutInput): Promise<CheckoutResult> {
  const { storeSlug, customer, items, idempotencyKey } = input

  if (!customer?.name?.trim() || !customer?.email?.trim()) {
    return { ok: false, error: 'missing_customer' }
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'empty_cart' }
  }
  if (!idempotencyKey || idempotencyKey.length < 8) {
    return { ok: false, error: 'bad_request' }
  }

  const admin = createAdminClient()

  // Resolve the published project for this slug.
  const { data: project } = await admin
    .from('projects')
    .select('id, owner_id, published')
    .eq('slug', storeSlug)
    .eq('published', true)
    .maybeSingle()

  if (!project) return { ok: false, error: 'store_not_found' }

  // Idempotency: if this key already produced an order, return it.
  const { data: existing } = await admin
    .from('ecommerce_orders')
    .select('id, total_cents, currency')
    .eq('project_id', project.id)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle()
  if (existing) {
    return {
      ok: true,
      orderId: existing.id,
      totalCents: existing.total_cents,
      currency: existing.currency,
      orderPath: buildOrderPath(storeSlug, existing.id, issueOrderAccessToken(existing.id)),
    }
  }

  // Payment gate: resolved BEFORE any order/stock write. A store with no usable
  // payment config, or whose config cannot be read, takes no orders at all.
  const payment = await loadStorePaymentConfig(project.id)
  if (!payment.ok) {
    return { ok: false, error: STORE_PAYMENT_ERROR_CODE[payment.reason] }
  }

  // Fetch authoritative product data for the requested ids.
  const ids = Array.from(new Set(items.map((i) => i.productId)))
  const { data: products } = await admin
    .from('ecommerce_products')
    .select('id, name, price_cents, currency, stock, status, project_id')
    .eq('project_id', project.id)
    .in('id', ids)

  if (!products || products.length === 0) {
    return { ok: false, error: 'invalid_items' }
  }

  const productById = new Map(products.map((p) => [p.id, p]))

  // Aggregate requested quantity per product (handles duplicate lines).
  const qtyByProduct = new Map<string, number>()
  for (const item of items) {
    const qty = Math.floor(Number(item.quantity))
    if (!Number.isFinite(qty) || qty <= 0) {
      return { ok: false, error: 'invalid_quantity' }
    }
    qtyByProduct.set(
      item.productId,
      (qtyByProduct.get(item.productId) ?? 0) + qty,
    )
  }

  let subtotal = 0
  let totalItems = 0
  let currency = 'TRY'
  const orderItems: {
    product_id: string
    name: string
    unit_price_cents: number
    quantity: number
    line_total_cents: number
    project_id: string
  }[] = []

  for (const [productId, qty] of qtyByProduct) {
    const product = productById.get(productId)
    if (!product || product.status !== 'active') {
      return { ok: false, error: 'invalid_items' }
    }
    if (qty > MAX_QTY_PER_LINE) {
      return { ok: false, error: 'quantity_too_high' }
    }
    if (product.stock < qty) {
      return { ok: false, error: 'insufficient_stock' }
    }
    totalItems += qty
    currency = product.currency || 'TRY'
    const lineTotal = product.price_cents * qty
    subtotal += lineTotal
    orderItems.push({
      product_id: product.id,
      name: product.name,
      unit_price_cents: product.price_cents,
      quantity: qty,
      line_total_cents: lineTotal,
      project_id: project.id,
    })
  }

  if (totalItems > MAX_TOTAL_ITEMS) {
    return { ok: false, error: 'too_many_items' }
  }

  const shipping = 0
  const total = subtotal + shipping

  // The owner's default method (used when the buyer sends nothing or a method
  // that is not permitted) and the authoritative allow-list. The client's
  // selection can never widen it.
  const enabledSet = new Set<PaymentProviderId>(payment.methods)

  // Honor the buyer's choice only if the owner enabled it; else fall back.
  const requested = input.paymentMethod
  const providerId: PaymentProviderId =
    requested && enabledSet.has(requested) ? requested : payment.defaultProvider

  // Never route to a provider without a real implementation: the registry's
  // generic fallback is the mock provider, which would settle as "paid".
  if (!isManualStoreProvider(providerId) && !isProviderImplemented(providerId)) {
    return { ok: false, error: STORE_PAYMENT_ERROR_CODE.not_configured }
  }

  // Attribute the order to the logged-in store customer, if any. Guests get
  // null — the column is nullable, so nothing changes for anonymous checkout.
  const customerId = await getCurrentCustomerIdForProject(project.id)

  // Create the order (pending) first.
  const { data: order, error: orderError } = await admin
    .from('ecommerce_orders')
    .insert({
      project_id: project.id,
      owner_id: project.owner_id,
      customer_id: customerId,
      status: 'pending',
      customer_name: [customer.name.trim(), customer.lastName?.trim()]
        .filter(Boolean)
        .join(' '),
      customer_email: customer.email.trim(),
      customer_phone: customer.phone?.trim() || null,
      shipping_address: {
        address: customer.address?.trim() || '',
        district: customer.district?.trim() || '',
        city: customer.city?.trim() || '',
        postalCode: customer.postalCode?.trim() || '',
      },
      subtotal_cents: subtotal,
      shipping_cents: shipping,
      total_cents: total,
      currency,
      payment_provider: providerId,
      payment_status: 'pending',
      idempotency_key: idempotencyKey,
      invoice: normalizeCheckoutInvoice(input.invoice),
    })
    .select('id')
    .single()

  if (orderError || !order) {
    // Unique violation => a concurrent request already created it.
    const { data: race } = await admin
      .from('ecommerce_orders')
      .select('id, total_cents, currency')
      .eq('project_id', project.id)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()
    if (race) {
      return {
        ok: true,
        orderId: race.id,
        totalCents: race.total_cents,
        currency: race.currency,
        orderPath: buildOrderPath(storeSlug, race.id, issueOrderAccessToken(race.id)),
      }
    }
    return { ok: false, error: 'order_failed' }
  }

  await admin
    .from('ecommerce_order_items')
    .insert(orderItems.map((oi) => ({ ...oi, order_id: order.id })))

  const orderPath = buildOrderPath(storeSlug, order.id, issueOrderAccessToken(order.id))

  // Bank transfer has no PSP: the order stays pending (no stock change) until
  // the owner confirms the transfer. It must never reach a provider adapter.
  if (isManualStoreProvider(providerId)) {
    scheduleOrderNotification(order.id)
    return { ok: true, orderId: order.id, totalCents: total, currency, orderPath }
  }

  // Create the payment intent through the resolved provider.
  const provider = getPaymentProvider(providerId)
  let intent: Awaited<ReturnType<typeof provider.createIntent>>
  try {
    intent = await provider.createIntent({
      orderId: order.id,
      amountCents: total,
      currency,
      customerEmail: customer.email.trim(),
      returnUrl: orderPath,
      publicConfig: payment.publicConfig,
      secret: null,
    })
  } catch (err) {
    console.error('[store-payments] createIntent failed', {
      projectId: project.id,
      orderId: order.id,
      provider: providerId,
      message: err instanceof Error ? err.message : 'unknown',
    })
    await admin
      .from('ecommerce_orders')
      .update({ status: 'failed', payment_status: 'failed' })
      .eq('id', order.id)
    return { ok: false, error: 'order_failed' }
  }

  // Only the mock provider settles synchronously (and only where explicitly
  // allowed); mark paid and decrement stock.
  if (intent.action === 'completed' && intent.status === 'paid') {
    await admin
      .from('ecommerce_orders')
      .update({
        status: 'paid',
        payment_status: 'paid',
        payment_ref: intent.reference,
      })
      .eq('id', order.id)

    for (const oi of orderItems) {
      const product = productById.get(oi.product_id)
      if (product) {
        await admin
          .from('ecommerce_products')
          .update({ stock: Math.max(0, product.stock - oi.quantity) })
          .eq('id', oi.product_id)
      }
    }
  } else {
    await admin
      .from('ecommerce_orders')
      .update({ payment_ref: intent.reference, payment_status: intent.status })
      .eq('id', order.id)
  }

  scheduleOrderNotification(order.id)

  return { ok: true, orderId: order.id, totalCents: total, currency, orderPath }
}
