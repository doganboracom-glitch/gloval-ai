'use server'

import { revalidatePath } from 'next/cache'
import { revalidateStorefront } from '@/lib/store-revalidate'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOwnedEcommerceProject, requireUser } from '@/lib/ecommerce-access'
import {
  normalizeProductImages,
  prepareProductImagesForSave,
  type ProductImage,
} from '@/lib/product-images'
import { discardProjectImageUrls, removeUnreferencedProjectImages } from '@/lib/product-image-service'
import { createProductImageCleanupDeps, getProductImageStorageBase } from '@/lib/product-image-store'
import { fallbackWebsite } from '@/lib/website-schema'
import { createProject } from '@/lib/projects'
import { getMyCurrentPlan } from '@/lib/billing'
import { getEffectiveProductLimit } from '@/lib/effective-limits'
import { PRODUCT_LIMIT_ERROR } from '@/lib/pricing-config'
import { finalizePaidStock, releaseOrderStock } from '@/lib/store-order-stock'
import { isMissingColumnError } from '@/lib/store-schema-compat'
import {
  checkProductInput,
  normalizeProductInput,
  withoutOptionalColumns,
  type ProductFieldError,
  type ProductInput,
} from '@/lib/product-input'
import { orderCodFeeCents } from '@/lib/store-checkout-rules'
import {
  cancelManualOrder,
  confirmManualPayment,
  defaultManualOrderDeps,
  type ManualOrderOutcome,
} from '@/lib/store-manual-orders'
import { isManualStoreProvider } from '@/lib/store-payment-policy'
import { scheduleOrderNotification } from '@/lib/store-order-notifications'

/**
 * Phase 1 e-commerce data layer.
 *
 * Fully additive and isolated from the existing corporate website flow. Every
 * query is scoped to the authenticated owner both by an explicit server-side
 * ownership check on the parent project AND by RLS on the e-commerce tables, so
 * guessing another user's projectId returns nothing.
 */

export type ProductStatus = 'active' | 'draft' | 'archived'

export type CategoryRow = {
  id: string
  project_id: string
  owner_id: string
  name: string
  slug: string
  sort_order: number
  created_at: string
}

export type ProductRow = {
  id: string
  project_id: string
  owner_id: string
  category_id: string | null
  name: string
  slug: string
  description: string | null
  price_cents: number
  currency: string
  sku: string | null
  stock: number
  /** Absent until scripts/032 is applied; treated as tracked (true). */
  track_stock?: boolean
  status: ProductStatus
  /** Normalized on read: legacy URL strings become `{ url, alt: '' }`. Cover first. */
  images: ProductImage[]
  compare_at_price_cents: number | null
  vat_rate: number
  specs: Array<{ name: string; value: string }>
  shipping_note: string | null
  seo_title: string | null
  seo_description: string | null
  /** Absent until scripts/038 is applied; treated as false. */
  show_on_home?: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

/**
 * Creates a new e-commerce project with a product-forward starter site, then
 * returns its id so the caller can jump to the product panel. Reuses the exact
 * same schema pipeline as corporate sites (fallbackWebsite) — it just tags the
 * project as `ecommerce` so the product catalog and store features apply.
 */
export async function createEcommerceProject(input: {
  prompt: string
  language?: 'tr' | 'en'
}): Promise<string> {
  const language = input.language === 'en' ? 'en' : 'tr'
  const prompt = input.prompt?.trim() || (language === 'tr' ? 'online mağaza' : 'online store')
  const schema = fallbackWebsite(prompt, language)
  const id = await createProject({
    name: schema.meta.name,
    sector: 'ecommerce',
    language,
    prompt,
    schema,
    projectType: 'ecommerce',
  })
  revalidatePath('/dashboard')
  return id
}

function slugify(input: string): string {
  return (
    input
      .toLocaleLowerCase('tr')
      .replace(/ı/g, 'i')
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || `urun-${Date.now().toString(36)}`
  )
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function listCategories(projectId: string): Promise<CategoryRow[]> {
  const { supabase } = await requireOwnedEcommerceProject(projectId)
  const { data, error } = await supabase
    .from('ecommerce_categories')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as CategoryRow[]) ?? []
}

export async function createCategory(projectId: string, name: string): Promise<CategoryRow> {
  const { supabase, userId } = await requireOwnedEcommerceProject(projectId)
  const trimmed = name.trim()
  if (!trimmed) throw new Error('INVALID_NAME')
  const { data, error } = await supabase
    .from('ecommerce_categories')
    .insert({
      project_id: projectId,
      owner_id: userId,
      name: trimmed,
      slug: slugify(trimmed),
    })
    .select('*')
    .single()
  if (error) throw error
  revalidatePath(`/ecommerce/${projectId}`)
  return data as CategoryRow
}

export async function deleteCategory(projectId: string, categoryId: string): Promise<void> {
  const { supabase } = await requireOwnedEcommerceProject(projectId)
  const { error } = await supabase
    .from('ecommerce_categories')
    .delete()
    .eq('id', categoryId)
    .eq('project_id', projectId)
  if (error) throw error
  revalidatePath(`/ecommerce/${projectId}`)
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export async function listProducts(projectId: string): Promise<ProductRow[]> {
  const { supabase } = await requireOwnedEcommerceProject(projectId)
  const { data, error } = await supabase
    .from('ecommerce_products')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data as ProductRow[]) ?? []).map(withNormalizedImages)
}

export type { ProductInput }

/** Legacy rows store plain URL strings; the app always works with `{ url, alt }`. */
function withNormalizedImages(row: ProductRow): ProductRow {
  return { ...row, images: normalizeProductImages(row.images) }
}

/**
 * Removes unsaved uploads the owner discarded (or a failed save left behind).
 * Only this project's own files that no product references are ever deleted.
 */
export async function discardProductImages(projectId: string, urls: string[]): Promise<void> {
  await requireOwnedEcommerceProject(projectId)
  if (!Array.isArray(urls) || urls.length === 0) return
  await discardProjectImageUrls(
    createProductImageCleanupDeps(),
    projectId,
    urls.filter((u): u is string => typeof u === 'string').slice(0, 100),
  )
}


type OwnedSupabase = Awaited<ReturnType<typeof requireOwnedEcommerceProject>>['supabase']

function refreshStorefront(supabase: OwnedSupabase, projectId: string) {
  return revalidateStorefront(
    {
      findSlug: async (id) => {
        const { data } = await supabase.from('projects').select('slug').eq('id', id).maybeSingle()
        return typeof data?.slug === 'string' && data.slug ? data.slug : null
      },
      revalidatePath,
    },
    projectId,
  )
}

export async function createProduct(projectId: string, input: ProductInput): Promise<ProductRow> {
  const { supabase, userId } = await requireOwnedEcommerceProject(projectId)
  const normalized = normalizeProductInput(input)
  const fields = {
    ...normalized,
    images: prepareProductImagesForSave({
      images: normalized.images,
      projectId,
      storageBase: getProductImageStorageBase(),
      existingUrls: [],
    }).images,
  }

  // Server-side capacity: plan product limit + active "Ek Ürün" add-ons.
  // Nothing the client sends influences this number.
  const plan = await getMyCurrentPlan()
  const limit = await getEffectiveProductLimit(userId, plan?.code)
  if (limit !== null) {
    const { count, error: countErr } = await supabase
      .from('ecommerce_products')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', userId)
    if (countErr) throw countErr
    if ((count ?? 0) >= limit) throw new Error(PRODUCT_LIMIT_ERROR)
  }

  const base = { project_id: projectId, owner_id: userId, slug: slugify(fields.name) }
  let { data, error } = await supabase
    .from('ecommerce_products')
    .insert({ ...base, ...fields })
    .select('*')
    .single()
  if (isMissingColumnError(error)) {
    ;({ data, error } = await supabase
      .from('ecommerce_products')
      .insert({ ...base, ...withoutOptionalColumns(fields) })
      .select('*')
      .single())
  }
  if (error) throw error
  revalidatePath(`/ecommerce/${projectId}`)
  await refreshStorefront(supabase, projectId)
  return withNormalizedImages(data as ProductRow)
}

export async function updateProduct(
  projectId: string,
  productId: string,
  input: ProductInput,
): Promise<ProductRow> {
  const { supabase } = await requireOwnedEcommerceProject(projectId)
  const normalized = normalizeProductInput(input)

  const { data: current, error: currentErr } = await supabase
    .from('ecommerce_products')
    .select('images')
    .eq('id', productId)
    .eq('project_id', projectId)
    .single()
  if (currentErr) throw currentErr

  const { images, removedPaths } = prepareProductImagesForSave({
    images: normalized.images,
    projectId,
    storageBase: getProductImageStorageBase(),
    existingUrls: normalizeProductImages(current?.images).map((i) => i.url),
  })
  const fields = { ...normalized, images }

  let { data, error } = await supabase
    .from('ecommerce_products')
    .update(fields)
    .eq('id', productId)
    .eq('project_id', projectId)
    .select('*')
    .single()
  if (isMissingColumnError(error)) {
    ;({ data, error } = await supabase
      .from('ecommerce_products')
      .update(withoutOptionalColumns(fields))
      .eq('id', productId)
      .eq('project_id', projectId)
      .select('*')
      .single())
  }
  if (error) throw error
  await removeUnreferencedProjectImages(createProductImageCleanupDeps(), projectId, removedPaths)
  revalidatePath(`/ecommerce/${projectId}`)
  await refreshStorefront(supabase, projectId)
  return withNormalizedImages(data as ProductRow)
}

export type SaveProductResult =
  | { ok: true; product: ProductRow }
  | {
      ok: false
      /** Problems tied to a field; empty for limit and unexpected failures. */
      errors: ProductFieldError[]
      reason: 'invalid' | 'limit_reached' | 'unexpected'
    }

/**
 * Create (`productId` null) or update, answering with per-field problems
 * instead of throwing: a thrown server-action error reaches the browser as an
 * opaque message in production, so the form could not say which field is wrong.
 */
export async function saveProduct(
  projectId: string,
  productId: string | null,
  input: ProductInput,
): Promise<SaveProductResult> {
  const checked = checkProductInput(input)
  if (!checked.ok) return { ok: false, errors: checked.errors, reason: 'invalid' }

  try {
    const product = productId
      ? await updateProduct(projectId, productId, input)
      : await createProduct(projectId, input)
    return { ok: true, product }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === PRODUCT_LIMIT_ERROR) return { ok: false, errors: [], reason: 'limit_reached' }
    if (message === 'INVALID_IMAGES' || message === 'INVALID_IMAGE_URL') {
      return { ok: false, errors: [{ field: 'images', code: message }], reason: 'invalid' }
    }
    return { ok: false, errors: [], reason: 'unexpected' }
  }
}

/** Hides the product from the store without touching its data or its orders. */
export async function archiveProduct(projectId: string, productId: string): Promise<void> {
  const { supabase } = await requireOwnedEcommerceProject(projectId)
  const { error } = await supabase
    .from('ecommerce_products')
    .update({ status: 'archived' })
    .eq('id', productId)
    .eq('project_id', projectId)
  if (error) throw error
  revalidatePath(`/ecommerce/${projectId}`)
  await refreshStorefront(supabase, projectId)
}

export type DeleteProductResult = { ok: true } | { ok: false; reason: 'has_orders' }

/** A product that appears on any order is never deleted; it can only be archived. */
export async function deleteProduct(projectId: string, productId: string): Promise<DeleteProductResult> {
  const { supabase } = await requireOwnedEcommerceProject(projectId)

  const { count: orderLines, error: orderErr } = await createAdminClient()
    .from('ecommerce_order_items')
    .select('order_id', { count: 'exact', head: true })
    .eq('product_id', productId)
  if (orderErr) throw orderErr
  if ((orderLines ?? 0) > 0) return { ok: false, reason: 'has_orders' }

  const { data: current } = await supabase
    .from('ecommerce_products')
    .select('images')
    .eq('id', productId)
    .eq('project_id', projectId)
    .maybeSingle()
  const { error } = await supabase
    .from('ecommerce_products')
    .delete()
    .eq('id', productId)
    .eq('project_id', projectId)
  if (error) throw error

  const deps = createProductImageCleanupDeps()
  await discardProjectImageUrls(
    deps,
    projectId,
    normalizeProductImages(current?.images).map((i) => i.url),
  )
  revalidatePath(`/ecommerce/${projectId}`)
  await refreshStorefront(supabase, projectId)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Orders (seller side)
// ---------------------------------------------------------------------------

export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'processing'
  | 'shipped'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'refunded'
  | 'fulfilled'

export type OrderRow = {
  id: string
  project_id: string
  status: OrderStatus
  customer_name: string
  customer_email: string
  customer_phone: string | null
  subtotal_cents: number
  shipping_cents: number
  /** Cash-on-delivery fee, derived; 0 for any other payment method. */
  cod_fee_cents: number
  total_cents: number
  currency: string
  payment_provider: string
  payment_status: string
  created_at: string
}

export type OrderItemRow = {
  id: string
  name: string
  unit_price_cents: number
  quantity: number
  line_total_cents: number
  /** Frozen at order time; absent before scripts/037. */
  vat_rate?: number | null
  vat_cents?: number | null
}

export type OrderWithItems = OrderRow & { items: OrderItemRow[] }

/** Lists a store's orders (newest first). Owner + RLS scoped. */
export async function listOrders(projectId: string): Promise<OrderWithItems[]> {
  const { supabase } = await requireOwnedEcommerceProject(projectId)
  const { data: orders, error } = await supabase
    .from('ecommerce_orders')
    .select(
      'id, project_id, status, customer_name, customer_email, customer_phone, subtotal_cents, shipping_cents, total_cents, currency, payment_provider, payment_status, created_at',
    )
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw error
  if (!orders || orders.length === 0) return []

  const orderIds = orders.map((o) => o.id)
  const itemColumns = 'id, order_id, name, unit_price_cents, quantity, line_total_cents'
  // vat_rate / vat_cents arrive with scripts/037; read without them until then.
  const withVat = await supabase
    .from('ecommerce_order_items')
    .select(`${itemColumns}, vat_rate, vat_cents`)
    .in('order_id', orderIds)
  let items: Record<string, unknown>[] | null = withVat.data
  if (isMissingColumnError(withVat.error)) {
    const legacy = await supabase
      .from('ecommerce_order_items')
      .select(itemColumns)
      .in('order_id', orderIds)
    items = legacy.data
  }

  const itemsByOrder = new Map<string, OrderItemRow[]>()
  for (const it of items ?? []) {
    const list = itemsByOrder.get(it.order_id as string) ?? []
    list.push(it as OrderItemRow)
    itemsByOrder.set(it.order_id as string, list)
  }

  return (orders as Omit<OrderRow, 'cod_fee_cents'>[]).map((o) => ({
    ...o,
    cod_fee_cents: orderCodFeeCents(o),
    items: itemsByOrder.get(o.id) ?? [],
  }))
}

const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'paid',
  'processing',
  'shipped',
  'completed',
  'cancelled',
  'failed',
  'refunded',
  'fulfilled',
]

export type ManualOrderActionResult =
  | { ok: true; outcome: 'confirmed' | 'cancelled'; oversold?: boolean }
  | { ok: false; error: 'not_found' | 'not_manual' | 'not_pending' | 'failed' }

function toActionResult(res: ManualOrderOutcome): ManualOrderActionResult {
  if (res.outcome === 'confirmed') return { ok: true, outcome: 'confirmed', oversold: res.oversold }
  if (res.outcome === 'cancelled') return { ok: true, outcome: 'cancelled' }
  return { ok: false, error: res.outcome }
}

/**
 * Owner confirms that a pending bank-transfer / cash-on-delivery order has been
 * paid. Ownership of `projectId` is proven first (owner or allow-listed admin);
 * the order is then resolved inside that project only, so another store's
 * order id is "not_found". The transition is a conditional update, so it runs
 * once and the "payment received" e-mail is sent exactly once.
 */
export async function confirmOrderPayment(
  projectId: string,
  orderId: string,
): Promise<ManualOrderActionResult> {
  await requireOwnedEcommerceProject(projectId)
  const { userId: actorId } = await requireUser()
  const res = await confirmManualPayment(
    createAdminClient(),
    { projectId, orderId, actorId },
    defaultManualOrderDeps(scheduleOrderNotification),
  )
  revalidatePath(`/ecommerce/${projectId}/orders`)
  return toActionResult(res)
}

/** Owner cancels a pending manual order; its reserved stock is released. */
export async function cancelOrderPayment(
  projectId: string,
  orderId: string,
): Promise<ManualOrderActionResult> {
  await requireOwnedEcommerceProject(projectId)
  const { userId: actorId } = await requireUser()
  const res = await cancelManualOrder(
    createAdminClient(),
    { projectId, orderId, actorId },
    defaultManualOrderDeps(scheduleOrderNotification),
  )
  revalidatePath(`/ecommerce/${projectId}/orders`)
  return toActionResult(res)
}

/**
 * Updates an order's fulfilment status. Owner + RLS scoped.
 *
 * Orders waiting on a manual payment never change payment state through this
 * generic path: "paid" / "cancelled" / "failed" are routed to the audited,
 * conditional confirm/cancel actions, and a bank-transfer order cannot move to
 * a fulfilment status before the transfer is confirmed.
 */
export async function updateOrderStatus(
  projectId: string,
  orderId: string,
  status: OrderStatus,
): Promise<void> {
  const { supabase } = await requireOwnedEcommerceProject(projectId)
  if (!ORDER_STATUSES.includes(status)) throw new Error('INVALID_STATUS')

  const { data: current } = await supabase
    .from('ecommerce_orders')
    .select('payment_provider, payment_status')
    .eq('id', orderId)
    .eq('project_id', projectId)
    .maybeSingle()
  if (!current) throw new Error('NOT_FOUND')

  if (
    isManualStoreProvider(current.payment_provider as string) &&
    current.payment_status === 'pending'
  ) {
    if (status === 'paid') {
      const r = await confirmOrderPayment(projectId, orderId)
      if (!r.ok) throw new Error(r.error.toUpperCase())
      return
    }
    if (status === 'cancelled' || status === 'failed') {
      const r = await cancelOrderPayment(projectId, orderId)
      if (!r.ok) throw new Error(r.error.toUpperCase())
      return
    }
    if (status === 'pending') return
    if (current.payment_provider === 'bank_transfer') throw new Error('PAYMENT_PENDING')
  }

  const { error } = await supabase
    .from('ecommerce_orders')
    .update({ status })
    .eq('id', orderId)
    .eq('project_id', projectId)
  if (error) throw error

  if (status === 'paid') {
    await finalizePaidStock(createAdminClient(), orderId)
  } else if (status === 'cancelled' || status === 'failed') {
    await releaseOrderStock(createAdminClient(), orderId, { onlyUnpaid: true })
  }
  revalidatePath(`/ecommerce/${projectId}/orders`)
}
