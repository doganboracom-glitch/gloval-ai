import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getPublishedSite, type PublishedSite } from '@/lib/projects'
import { getStoreProducts } from '@/lib/store'
import { isMissingColumnError } from '@/lib/store-schema-compat'
import { isPlaceholderNumber } from '@/lib/commerce-mode'
import { getCatalogContext, loadProjectCommerce } from '@/lib/commerce-mode-server'
import { resolveContactActions } from '@/lib/site-contact-actions'
import {
  buildCatalogPaths,
  type CatalogPaths,
  categoryIdentity,
  groupByCategory,
  parseVideoUrl,
  type CatalogGroup,
  type CatalogItem,
} from '@/lib/catalog-public'

export type PublicCatalog = {
  slug: string
  site: PublishedSite
  origin: string
  items: CatalogItem[]
  groups: CatalogGroup[]
  whatsappNumber: string | null
  phone: { display: string; href: string } | null
}

type CategoryRow = { id: string; name: string; slug: string }

async function loadCategories(projectId: string): Promise<Map<string, CategoryRow>> {
  const { data } = await createAdminClient()
    .from('ecommerce_categories')
    .select('id, name, slug')
    .eq('project_id', projectId)
  return new Map(((data ?? []) as CategoryRow[]).map((row) => [row.id, row]))
}

/** Category-aware canonical addresses for already-loaded products (home page + menu links). */
export async function loadCatalogPaths(
  projectId: string,
  products: { slug: string; category_id: string | null }[],
): Promise<CatalogPaths> {
  return buildCatalogPaths(products, await loadCategories(projectId))
}

/** `video_url` lives outside the public RPC; a database without migration 064 simply has no videos. */
async function loadVideoUrls(projectId: string): Promise<Map<string, string>> {
  const { data, error } = await createAdminClient()
    .from('ecommerce_products')
    .select('id, video_url')
    .eq('project_id', projectId)
  if (error) {
    if (!isMissingColumnError(error)) console.error('[catalog] video read failed', { code: error.code })
    return new Map()
  }
  const map = new Map<string, string>()
  for (const row of (data ?? []) as { id: string; video_url: string | null }[]) {
    if (row.video_url && parseVideoUrl(row.video_url)) map.set(row.id, row.video_url)
  }
  return map
}

/**
 * Everything the /urunlerimiz pages render. Returns null (-> 404) unless the site is
 * published and its EFFECTIVE mode is `catalog` (stores use /store, a catalog whose
 * owner left PRO reads as `none`).
 */
export async function loadPublicCatalog(slug: string): Promise<PublicCatalog | null> {
  const site = await getPublishedSite(slug)
  if (!site) return null
  const commerce = await loadProjectCommerce({ slug }).catch(() => null)
  if (!commerce?.published || commerce.mode !== 'catalog') return null

  const [products, categories, videos, context] = await Promise.all([
    getStoreProducts(slug),
    loadCategories(commerce.id),
    loadVideoUrls(commerce.id),
    getCatalogContext(slug, site.schema, 'catalog'),
  ])

  const items: CatalogItem[] = products.map((product) => {
    const category = product.category_id ? categories.get(product.category_id) : undefined
    const identity = categoryIdentity(category?.name, category?.slug)
    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      priceCents: product.price_cents,
      currency: product.currency,
      priceMode: product.price_mode ?? 'show',
      compareAtCents: product.compare_at_price_cents ?? null,
      sku: product.sku ?? null,
      images: product.images,
      specs: product.specs ?? [],
      videoUrl: videos.get(product.id) ?? null,
      categoryName: identity.name,
      categorySlug: identity.slug,
      seoTitle: product.seo_title ?? null,
      seoDescription: product.seo_description ?? null,
    }
  })

  const phone = resolveContactActions(site.schema)?.phone ?? null
  return {
    slug,
    site,
    origin: context.origin,
    items,
    groups: groupByCategory(items),
    whatsappNumber: context.whatsappNumber,
    phone: phone && !isPlaceholderNumber(phone.display) ? phone : null,
  }
}
