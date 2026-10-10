'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPaymentProvider, isProviderImplemented, type PaymentProviderId } from '@/lib/payments'
import { getCurrentCustomerIdForProject } from '@/lib/store-customer'
import { sanitizeInvoice } from '@/lib/store-invoice'
import { loadStorePaymentConfig } from '@/lib/store-payment-config'
import { isValidTurkishIban } from '@/lib/iban'
import { expireStaleManualOrders } from '@/lib/store-manual-orders'
import {
  isManualStoreProvider,
  readBankTransferConfig,
  STORE_PAYMENT_ERROR_CODE,
  type StorePaymentUnavailableReason,
} from '@/lib/store-payment-policy'
import { buildOrderPath, issueOrderAccessToken } from '@/lib/store-order-access'
import { scheduleOrderNotification } from '@/lib/store-order-notifications'
import { buildOrderLines, type OrderProductRow } from '@/lib/store-order-rules'
import {
  finalizePaidStock,
  releaseOrderStock,
  releaseStaleOrderStock,
  reserveOrderStock,
} from '@/lib/store-order-stock'
import { isMissingColumnError } from '@/lib/store-schema-compat'

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
  /** False for made-to-order/digital products. Missing on a pre-migration DB. */
  track_stock?: boolean
}

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
  /** Server-verified demo store: the mock card is offered, no real money moves. */
  demo: boolean
}> {
  const closed = (reason: StorePaymentUnavailableReason) => ({
    available: false as const,
    reason,
    methods: [] as PaymentProviderId[],
    publicConfig: {},
    demo: false,
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
    demo: resolution.demo,
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
  | {
      ok: false
      error: string
      /** Set for line-level failures so the UI can name the product. */
      productId?: string
      productName?: string
      available?: number
    }

/**
 * Sanitizes checkout invoice input into a stored jsonb shape, keeping only the
 * fields relevant to the chosen type. Returns null when nothing usable is
 * provided so guest orders without invoice details stay clean.
 */
function normalizeCheckoutInvoice(
  raw: CheckoutInput['invoice'],
): Record<string, string> | null {
  const result = sanitizeInvoice(raw, 'clamp')
  return result.ok ? result.value : null
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

  // Free stock of abandoned online-payment orders in this store (best effort).
  await releaseStaleOrderStock(admin, project.id)

  // Fetch authoritative product data for the requested ids.
  const requestedIds = Array.from(
    new Set(
      items
        .map((i) => i?.productId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  )
  if (requestedIds.length === 0) {
    return { ok: false, error: 'invalid_items' }
  }

  const products = await loadOrderProducts(admin, project.id, requestedIds)
  if (!products) return { ok: false, error: 'order_failed' }

  const built = buildOrderLines(items, new Map(products.map((p) => [p.id, p])))
  if (!built.ok) {
    return {
      ok: false,
      error: built.error,
      productId: built.productId,
      productName: built.productName,
      available: built.available,
    }
  }

  const { lines: orderItems, subtotalCents: subtotal, currency } = built

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

  // A bank-transfer order is only worth taking if the buyer can be told where
  // to pay: refuse when the owner's IBAN is missing or malformed.
  if (providerId === 'bank_transfer') {
    const bank = readBankTransferConfig(payment.publicConfig)
    if (!isValidTurkishIban(bank.iban)) {
      return { ok: false, error: STORE_PAYMENT_ERROR_CODE.not_configured }
    }
  }

  // Free stock of abandoned bank-transfer orders past their term (best effort).
  await expireStaleManualOrders(admin, project.id, { releaseOrderStock })

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

  const { error: itemsError } = await admin
    .from('ecommerce_order_items')
    .insert(orderItems.map((oi) => ({ ...oi, project_id: project.id, order_id: order.id })))

  // An order without its lines would be unfulfillable and could never take
  // stock, so it must not survive.
  if (itemsError) {
    console.error('[store-order] item insert failed', {
      projectId: project.id,
      orderId: order.id,
      code: itemsError.code,
    })
    await voidOrder(admin, order.id, idempotencyKey)
    return { ok: false, error: 'order_failed' }
  }

  // Take the stock of every line atomically (all or nothing). Every payment
  // method holds stock from here: online payments are released again on
  // failure/timeout, bank transfers when the owner cancels the order.
  const reserved = await reserveOrderStock(admin, order.id)
  if (!reserved.ok) {
    await voidOrder(admin, order.id, idempotencyKey)
    if (reserved.error === 'insufficient_stock') {
      const short = reserved.productId
        ? products.find((p) => p.id === reserved.productId)
        : undefined
      return {
        ok: false,
        error: 'insufficient_stock',
        productId: reserved.productId ?? undefined,
        productName: short?.name,
      }
    }
    return { ok: false, error: 'order_failed' }
  }

  const orderPath = buildOrderPath(storeSlug, order.id, issueOrderAccessToken(order.id))

  // Bank transfer has no PSP: the order stays pending until the owner confirms
  // the transfer. It must never reach a provider adapter.
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
    await releaseOrderStock(admin, order.id)
    await admin
      .from('ecommerce_orders')
      .update({ status: 'failed', payment_status: 'failed' })
      .eq('id', order.id)
    return { ok: false, error: 'order_failed' }
  }

  // Only the mock provider settles synchronously (and only where explicitly
  // allowed). Its stock is already reserved above; finalizing is a no-op there
  // and only does work on a database without the stock functions.
  if (intent.action === 'completed' && intent.status === 'paid') {
    await admin
      .from('ecommerce_orders')
      .update({
        status: 'paid',
        payment_status: 'paid',
        payment_ref: intent.reference,
      })
      .eq('id', order.id)
    await finalizePaidStock(admin, order.id)
  } else {
    await admin
      .from('ecommerce_orders')
      .update({ payment_ref: intent.reference, payment_status: intent.status })
      .eq('id', order.id)
  }

  scheduleOrderNotification(order.id)

  return { ok: true, orderId: order.id, totalCents: total, currency, orderPath }
}

/**
 * Reads the authoritative product rows. `track_stock` only exists after the
 * order-integrity migration, so the query falls back to the legacy columns
 * until then. Returns null when the catalog cannot be read.
 */
async function loadOrderProducts(
  admin: ReturnType<typeof createAdminClient>,
  projectId: string,
  ids: string[],
): Promise<OrderProductRow[] | null> {
  const base = 'id, name, price_cents, currency, stock, status'
  const withTracking = await admin
    .from('ecommerce_products')
    .select(`${base}, track_stock`)
    .eq('project_id', projectId)
    .in('id', ids)
  if (!withTracking.error) return (withTracking.data ?? []) as unknown as OrderProductRow[]

  if (!isMissingColumnError(withTracking.error)) {
    console.error('[store-order] product read failed', { projectId, code: withTracking.error.code })
    return null
  }

  const legacy = await admin
    .from('ecommerce_products')
    .select(base)
    .eq('project_id', projectId)
    .in('id', ids)
  if (legacy.error) {
    console.error('[store-order] product read failed', { projectId, code: legacy.error.code })
    return null
  }
  return (legacy.data ?? []) as unknown as OrderProductRow[]
}

/**
 * Discards an order that never became valid. The idempotency key is retired so
 * a retry of the same checkout creates a fresh order instead of resolving to
 * this cancelled one.
 */
async function voidOrder(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string,
  idempotencyKey: string,
): Promise<void> {
  await admin
    .from('ecommerce_orders')
    .update({
      status: 'cancelled',
      payment_status: 'failed',
      idempotency_key: `${idempotencyKey}#void-${orderId}`,
    })
    .eq('id', orderId)
}
