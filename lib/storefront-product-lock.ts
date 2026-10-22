import { isStorefront, type WebsiteSchema } from '@/lib/website-schema'
import type { EditOperation } from '@/lib/website-edit-operations'

/**
 * On a storefront the product catalog lives in the database ("Ürünleri yönet").
 * The schema's product items are only a first-time seed, so no editor or AI
 * operation may write product data into the schema afterwards.
 */

export const PRODUCTS_MANAGED_IN_PANEL = 'products_managed_in_panel'

const ITEM_OPERATIONS = new Set<EditOperation['op']>([
  'updateItemField',
  'updateItemImage',
  'updateItemList',
  'updateItemLink',
  'addItemLink',
  'addItem',
  'removeItem',
  'moveItem',
  'updateProductItem',
  'updateProductsCatalog',
])

/** True when the operation edits one item of a storefront's product section. */
export function isBlockedProductOperation(site: WebsiteSchema, operation: EditOperation): boolean {
  if (!ITEM_OPERATIONS.has(operation.op)) return false
  if (!isStorefront(site)) return false
  const index = (operation as { index?: number }).index
  if (typeof index !== 'number') return false
  return site.sections[index]?.type === 'products'
}

/**
 * Puts the original product items back into every product section of a
 * storefront, so a model edit can never rewrite the catalog in the schema.
 * `touched` reports whether the candidate tried to change them.
 */
export function lockStorefrontProducts(
  original: WebsiteSchema,
  candidate: WebsiteSchema,
): { schema: WebsiteSchema; touched: boolean } {
  if (!isStorefront(original)) return { schema: candidate, touched: false }

  let touched = false
  const sections = candidate.sections.map((section, i) => {
    const before = original.sections[i]
    if (section.type !== 'products' || before?.type !== 'products') return section
    if (JSON.stringify(section.items) !== JSON.stringify(before.items)) touched = true
    return { ...section, items: before.items }
  })
  return { schema: touched ? { ...candidate, sections } : candidate, touched }
}
