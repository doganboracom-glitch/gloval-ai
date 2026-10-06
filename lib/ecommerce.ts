'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminEmail } from '@/lib/mail/admin-guard'
import { fallbackWebsite } from '@/lib/website-schema'
import { createProject } from '@/lib/projects'
import { getMyCurrentPlan } from '@/lib/billing'
import { getEffectiveProductLimit } from '@/lib/effective-limits'
import { PRODUCT_LIMIT_ERROR } from '@/lib/pricing-config'

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
  status: ProductStatus
  images: string[]
  sort_order: number
  created_at: string
  updated_at: string
}

/** Requires an authenticated user; returns the Supabase client + user id. */
async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('UNAUTHENTICATED')
  return { supabase, userId: user.id }
}

/**
 * Resolves access to a single e-commerce project's data.
 *
 * Normal users stay on their RLS-scoped session client and can only ever reach
 * a project they own — behavior is completely unchanged. A verified admin
 * (server-side `ADMIN_EMAILS` allowlist) operating on a project they do NOT own
 * is elevated to the service-role client so the back office can manage ANY
 * tenant's catalog and orders. RLS is never weakened; elevation is gated by the
 * same allowlist that guards the admin panel and only for rows the caller
 * cannot already reach.
 *
 * `ownerId` is always the PROJECT's real owner (not the caller), so admin-created
 * categories/products are stamped with the correct owner_id and remain visible
 * to the tenant under their own RLS.
 *
 * Note: the returned key stays `supabase` so every existing call site keeps
 * working — it's a Supabase client either way, just at a different privilege.
 */
async function requireOwnedEcommerceProject(projectId: string): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>
  userId: string
  elevated: boolean
}> {
  const { supabase, userId } = await requireUser()

  // Owner path (RLS): unchanged for normal users.
  const { data: owned, error } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('owner_id', userId)
    .maybeSingle()
  if (error) throw error
  if (owned) return { supabase, userId, elevated: false }

  // Admin path: verified admin editing another tenant's store.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (isAdminEmail(user?.email ?? null)) {
    const admin = createAdminClient()
    const { data: proj, error: pErr } = await admin
      .from('projects')
      .select('id, owner_id')
      .eq('id', projectId)
      .maybeSingle()
    if (pErr) throw pErr
    if (!proj) throw new Error('NOT_FOUND')
    // userId = the project's real owner so inserts stamp the correct owner_id.
    return { supabase: admin, userId: proj.owner_id as string, elevated: true }
  }

  throw new Error('NOT_FOUND')
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
  return (data as ProductRow[]) ?? []
}

export type ProductInput = {
  name: string
  description?: string | null
  priceCents: number
  currency?: string
  sku?: string | null
  stock: number
  status?: ProductStatus
  categoryId?: string | null
  images?: string[]
}

/** Server-side validation shared by create + update. */
function normalizeProductInput(input: ProductInput) {
  const name = input.name?.trim()
  if (!name) throw new Error('INVALID_NAME')

  const priceCents = Math.round(Number(input.priceCents))
  if (!Number.isFinite(priceCents) || priceCents < 0) throw new Error('INVALID_PRICE')

  const stock = Math.round(Number(input.stock))
  if (!Number.isFinite(stock) || stock < 0) throw new Error('INVALID_STOCK')

  const status: ProductStatus = input.status ?? 'active'
  if (!['active', 'draft', 'archived'].includes(status)) throw new Error('INVALID_STATUS')

  const images = Array.isArray(input.images) ? input.images.filter((s) => typeof s === 'string') : []

  return {
    name,
    description: input.description?.trim() || null,
    price_cents: priceCents,
    currency: (input.currency || 'TRY').slice(0, 8),
    sku: input.sku?.trim() || null,
    stock,
    status,
    category_id: input.categoryId || null,
    images,
  }
}

export async function createProduct(projectId: string, input: ProductInput): Promise<ProductRow> {
  const { supabase, userId } = await requireOwnedEcommerceProject(projectId)
  const fields = normalizeProductInput(input)

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

  const { data, error } = await supabase
    .from('ecommerce_products')
    .insert({
      project_id: projectId,
      owner_id: userId,
      slug: slugify(fields.name),
      ...fields,
    })
    .select('*')
    .single()
  if (error) throw error
  revalidatePath(`/ecommerce/${projectId}`)
  return data as ProductRow
}

export async function updateProduct(
  projectId: string,
  productId: string,
  input: ProductInput,
): Promise<ProductRow> {
  const { supabase } = await requireOwnedEcommerceProject(projectId)
  const fields = normalizeProductInput(input)
  const { data, error } = await supabase
    .from('ecommerce_products')
    .update(fields)
    .eq('id', productId)
    .eq('project_id', projectId)
    .select('*')
    .single()
  if (error) throw error
  revalidatePath(`/ecommerce/${projectId}`)
  return data as ProductRow
}

export async function deleteProduct(projectId: string, productId: string): Promise<void> {
  const { supabase } = await requireOwnedEcommerceProject(projectId)
  const { error } = await supabase
    .from('ecommerce_products')
    .delete()
    .eq('id', productId)
    .eq('project_id', projectId)
  if (error) throw error
  revalidatePath(`/ecommerce/${projectId}`)
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

  const { data: items } = await supabase
    .from('ecommerce_order_items')
    .select('id, order_id, name, unit_price_cents, quantity, line_total_cents')
    .in(
      'order_id',
      orders.map((o) => o.id),
    )

  const itemsByOrder = new Map<string, OrderItemRow[]>()
  for (const it of items ?? []) {
    const list = itemsByOrder.get(it.order_id as string) ?? []
    list.push(it as OrderItemRow)
    itemsByOrder.set(it.order_id as string, list)
  }

  return (orders as OrderRow[]).map((o) => ({
    ...o,
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

/** Updates an order's fulfilment status. Owner + RLS scoped. */
export async function updateOrderStatus(
  projectId: string,
  orderId: string,
  status: OrderStatus,
): Promise<void> {
  const { supabase } = await requireOwnedEcommerceProject(projectId)
  if (!ORDER_STATUSES.includes(status)) throw new Error('INVALID_STATUS')
  const { error } = await supabase
    .from('ecommerce_orders')
    .update({ status })
    .eq('id', orderId)
    .eq('project_id', projectId)
  if (error) throw error
  revalidatePath(`/ecommerce/${projectId}/orders`)
}
