import { getCommerceMode } from '@/lib/commerce-mode'

/**
 * The three things a site can be, as an admin sees them. Stored as the
 * `project_type` + `commerce_mode` column pair, which must always change
 * together (a lone `project_type = 'ecommerce'` next to `commerce_mode = 'none'`
 * is the contradiction that made corporate sites look like empty stores).
 */
export type SiteKind = 'corporate' | 'ecommerce' | 'catalog'

export const SITE_KINDS: readonly SiteKind[] = ['corporate', 'ecommerce', 'catalog']

export function isSiteKind(value: unknown): value is SiteKind {
  return typeof value === 'string' && (SITE_KINDS as readonly string[]).includes(value)
}

export function siteKindOf(project: { commerce_mode?: string | null; project_type?: string | null }): SiteKind {
  const mode = getCommerceMode(project)
  return mode === 'ecommerce' ? 'ecommerce' : mode === 'catalog' ? 'catalog' : 'corporate'
}

/**
 * Whether the dashboard offers "Ürünleri yönet" for a project: only stores
 * (`project_type = 'ecommerce'`) and catalogs (`commerce_mode = 'catalog'`).
 * A corporate site never shows it, whatever sections its draft contains.
 */
export function canManageProducts(project: {
  commerce_mode?: string | null
  project_type?: string | null
}): boolean {
  return project.project_type === 'ecommerce' || project.commerce_mode === 'catalog'
}

export function columnsForKind(kind: SiteKind): { project_type: 'corporate' | 'ecommerce'; commerce_mode: 'none' | 'ecommerce' | 'catalog' } {
  if (kind === 'ecommerce') return { project_type: 'ecommerce', commerce_mode: 'ecommerce' }
  if (kind === 'catalog') return { project_type: 'ecommerce', commerce_mode: 'catalog' }
  return { project_type: 'corporate', commerce_mode: 'none' }
}

export type SiteTypeBlocker = 'has_store_data' | 'has_orders'

/**
 * Whether a switch would orphan store data. Leaving a store for a corporate
 * site requires an empty catalog and no orders; a catalog takes no orders, so
 * moving an e-commerce site with orders to catalog is refused as well.
 */
export function siteTypeBlocker(
  from: SiteKind,
  to: SiteKind,
  counts: { products: number; orders: number },
): SiteTypeBlocker | null {
  if (from === to) return null
  if (to === 'corporate' && (counts.products > 0 || counts.orders > 0)) return 'has_store_data'
  if (to === 'catalog' && counts.orders > 0) return 'has_orders'
  return null
}

export const MIN_TYPE_CHANGE_NOTE = 3
export const MAX_TYPE_CHANGE_NOTE = 500
