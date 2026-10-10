import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { WebsiteSchema } from '@/lib/website-schema'
import { slugify, parsePriceToCents, inferCurrency } from '@/lib/slug'

/**
 * Sync the generated site's schema catalog into the REAL e-commerce tables.
 * ------------------------------------------------------------------------
 * A generated storefront describes its products/categories only inside the
 * website schema (display cards). The working store engine — product detail
 * pages, cart, checkout, orders — reads exclusively from `ecommerce_products` /
 * `ecommerce_categories`. This bridge runs on publish so the products a visitor
 * sees on the generated homepage become real, purchasable catalog rows.
 *
 * Design guarantees:
 *  - Idempotent: keyed on the `(project_id, slug)` unique index, so
 *    re-publishing updates the same rows instead of duplicating them.
 *  - Non-destructive to owner edits: on an existing product it refreshes only
 *    the presentation fields (name, description, price, images, category) and
 *    NEVER overwrites owner-managed `stock`, `sku` or `sort_order`. It also
 *    never deletes rows the owner added by hand in the admin panel.
 *  - Best-effort: any failure is swallowed by the caller so a sync problem can
 *    never block a publish.
 */

type ProductSeed = {
  name: string
  slug: string
  description: string | null
  priceCents: number
  currency: string
  images: string[]
  categorySlug: string | null
}

type CategorySeed = { name: string; slug: string }

function collectSeeds(schema: WebsiteSchema): {
  categories: CategorySeed[]
  products: ProductSeed[]
} {
  const categories = new Map<string, CategorySeed>()
  const products = new Map<string, ProductSeed>()

  for (const section of schema.sections) {
    if (section.type === 'categories') {
      for (const item of section.items) {
        const name = (item.name || '').trim()
        if (!name) continue
        const slug = slugify(name)
        if (!categories.has(slug)) categories.set(slug, { name, slug })
      }
    }
    if (section.type === 'products') {
      for (const item of section.items) {
        const name = (item.name || '').trim()
        if (!name) continue
        const slug = slugify(name)
        // First occurrence wins (e.g. "featured" before "weekly deals"), so a
        // product listed twice stays one catalog row.
        if (products.has(slug)) continue
        products.set(slug, {
          name,
          slug,
          description: (item.description || '').trim() || null,
          priceCents: parsePriceToCents(item.price),
          currency: inferCurrency(item.price),
          images: item.src ? [item.src] : [],
          categorySlug: item.category ? slugify(item.category) : null,
        })
      }
    }
  }

  return { categories: [...categories.values()], products: [...products.values()] }
}

export async function syncStoreFromSchema(
  projectId: string,
  ownerId: string,
  schema: WebsiteSchema,
  options: { productLimit?: number | null } = {},
): Promise<void> {
  const { categories, products } = collectSeeds(schema)
  if (categories.length === 0 && products.length === 0) return

  const admin = createAdminClient()

  // --- Categories: insert missing, keep existing. -------------------------
  const { data: existingCats } = await admin
    .from('ecommerce_categories')
    .select('id, slug')
    .eq('project_id', projectId)

  const catIdBySlug = new Map<string, string>(
    (existingCats ?? []).map((c) => [c.slug as string, c.id as string]),
  )

  const newCats = categories.filter((c) => !catIdBySlug.has(c.slug))
  if (newCats.length > 0) {
    const { data: inserted } = await admin
      .from('ecommerce_categories')
      .insert(
        newCats.map((c, i) => ({
          project_id: projectId,
          owner_id: ownerId,
          name: c.name,
          slug: c.slug,
          sort_order: (existingCats?.length ?? 0) + i,
        })),
      )
      .select('id, slug')
    for (const c of inserted ?? []) catIdBySlug.set(c.slug as string, c.id as string)
  }

  if (products.length === 0) return

  // --- Products: update presentation of existing, insert the rest. --------
  const { data: existingProducts } = await admin
    .from('ecommerce_products')
    .select('id, slug')
    .eq('project_id', projectId)

  const existingSlugs = new Set((existingProducts ?? []).map((p) => p.slug as string))

  let toInsert = products.filter((p) => !existingSlugs.has(p.slug))
  if (options.productLimit != null && toInsert.length > 0) {
    // The limit is per owner across all of their stores, so count every row.
    const { count } = await admin
      .from('ecommerce_products')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', ownerId)
    toInsert = toInsert.slice(0, Math.max(0, options.productLimit - (count ?? 0)))
  }
  const toUpdate = products.filter((p) => existingSlugs.has(p.slug))

  if (toInsert.length > 0) {
    // Synced products start with stock tracking OFF (always purchasable); the
    // owner opts into tracking per product and then sets the on-hand count.
    const { error: insertError } = await admin.from('ecommerce_products').insert(
      toInsert.map((p, i) => ({
        project_id: projectId,
        owner_id: ownerId,
        category_id: p.categorySlug ? catIdBySlug.get(p.categorySlug) ?? null : null,
        name: p.name,
        slug: p.slug,
        description: p.description,
        price_cents: p.priceCents,
        currency: p.currency,
        stock: 0,
        track_stock: false,
        status: 'active',
        images: p.images,
        sort_order: (existingProducts?.length ?? 0) + i,
      })),
    )
    if (insertError) {
      console.error('[store-sync] product insert failed', { projectId, code: insertError.code })
    }
  }

  // Refresh presentation fields only — never touch owner-managed stock, sku,
  // sort order or status (so an archived product stays archived on republish).
  for (const p of toUpdate) {
    await admin
      .from('ecommerce_products')
      .update({
        name: p.name,
        description: p.description,
        price_cents: p.priceCents,
        currency: p.currency,
        images: p.images,
        category_id: p.categorySlug ? catIdBySlug.get(p.categorySlug) ?? null : null,
      })
      .eq('project_id', projectId)
      .eq('slug', p.slug)
  }
}
