import type { Section } from '@/lib/website-schema'
import { UNCATEGORIZED_NAME, UNCATEGORIZED_SLUG, type CatalogGroup } from '@/lib/catalog-public'
import { slugify } from '@/lib/slug'

/**
 * Owner-managed product categories
 * --------------------------------
 * The inline catalog stores each product's category as free text (`item.category`). The owner now also keeps
 * an ordered list (`section.categories`). A site saved before the list existed has none, so the list is rebuilt
 * from the products' own values the first time it is needed and nothing the owner typed is lost.
 * Pure: no I/O, shared by the editor, the edit operations and the public catalog.
 */

type ProductsSection = Extract<Section, { type: 'products' }>

export const PRODUCT_CATEGORY_NAME_MAX = 40
export const PRODUCT_CATEGORY_MAX = 30
export const OTHER_CATEGORY = UNCATEGORIZED_NAME

export type CategoryError = 'empty' | 'duplicate' | 'reserved' | 'full' | 'missing'
export type CategoryResult = { ok: true; section: ProductsSection } | { ok: false; error: CategoryError }

export function cleanCategoryName(raw: string | undefined | null): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, PRODUCT_CATEGORY_NAME_MAX)
}

/** Case- and diacritic-insensitive identity used for the "unique name" rule. */
export function categoryKey(name: string | undefined | null): string {
  return cleanCategoryName(name)
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
}

const OTHER_KEY = categoryKey(OTHER_CATEGORY)

export function isOtherCategory(name: string | undefined | null): boolean {
  const key = categoryKey(name)
  return key === '' || key === OTHER_KEY
}

/** The owner's list: stored names (deduplicated) plus any category a product already uses, "Diğer" always last. */
export function effectiveCategories(section: Pick<ProductsSection, 'categories' | 'items'>): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  const add = (raw: string | undefined) => {
    const name = cleanCategoryName(raw)
    const key = categoryKey(name)
    if (!name || key === OTHER_KEY || seen.has(key)) return
    seen.add(key)
    names.push(name)
  }
  for (const name of section.categories ?? []) add(name)
  for (const item of section.items) add(item.category)
  return [...names, OTHER_CATEGORY]
}

/** What the product-detail dropdown shows as selected: its category, or "Diğer" when it has none. */
export function selectedCategory(section: Pick<ProductsSection, 'categories' | 'items'>, itemCategory: string | undefined): string {
  if (isOtherCategory(itemCategory)) return OTHER_CATEGORY
  const key = categoryKey(itemCategory)
  return effectiveCategories(section).find((name) => categoryKey(name) === key) ?? cleanCategoryName(itemCategory)
}

/** Writes the effective list into the section (idempotent; same object when nothing changes). */
export function withCategories(section: ProductsSection): ProductsSection {
  const next = effectiveCategories(section).filter((name) => !isOtherCategory(name))
  const stored = section.categories ?? []
  const same = stored.length === next.length && stored.every((name, i) => name === next[i])
  return same ? section : { ...section, categories: next }
}

/** Items whose category is `name` ("Diğer" also counts the products that have none). */
export function categoryProductCount(section: Pick<ProductsSection, 'items'>, name: string): number {
  const key = categoryKey(name)
  return section.items.filter((item) => (isOtherCategory(name) ? isOtherCategory(item.category) : categoryKey(item.category) === key)).length
}

function customNames(section: ProductsSection): string[] {
  return effectiveCategories(section).filter((name) => !isOtherCategory(name))
}

export function addCategory(section: ProductsSection, raw: string): CategoryResult {
  const name = cleanCategoryName(raw)
  if (!name) return { ok: false, error: 'empty' }
  if (isOtherCategory(name)) return { ok: false, error: 'reserved' }
  const names = customNames(section)
  if (names.some((existing) => categoryKey(existing) === categoryKey(name))) return { ok: false, error: 'duplicate' }
  if (names.length >= PRODUCT_CATEGORY_MAX) return { ok: false, error: 'full' }
  return { ok: true, section: { ...section, categories: [...names, name] } }
}

/** Renames a category everywhere: the list and every product that uses it (its page address follows the name). */
export function renameCategory(section: ProductsSection, from: string, raw: string): CategoryResult {
  if (isOtherCategory(from)) return { ok: false, error: 'reserved' }
  const name = cleanCategoryName(raw)
  if (!name) return { ok: false, error: 'empty' }
  if (isOtherCategory(name)) return { ok: false, error: 'reserved' }
  const names = customNames(section)
  const at = names.findIndex((existing) => categoryKey(existing) === categoryKey(from))
  if (at < 0) return { ok: false, error: 'missing' }
  if (names.some((existing, i) => i !== at && categoryKey(existing) === categoryKey(name))) return { ok: false, error: 'duplicate' }
  const fromKey = categoryKey(from)
  return {
    ok: true,
    section: {
      ...section,
      categories: names.map((existing, i) => (i === at ? name : existing)),
      items: section.items.map((item) => (categoryKey(item.category) === fromKey ? { ...item, category: name } : item)),
    },
  }
}

export function moveCategory(section: ProductsSection, name: string, direction: -1 | 1): CategoryResult {
  const names = customNames(section)
  const at = names.findIndex((existing) => categoryKey(existing) === categoryKey(name))
  if (at < 0) return { ok: false, error: 'missing' }
  const to = at + direction
  if (to < 0 || to >= names.length) return { ok: true, section: { ...section, categories: names } }
  const next = [...names]
  ;[next[at], next[to]] = [next[to], next[at]]
  return { ok: true, section: { ...section, categories: next } }
}

/** Deletes a category; its products fall back to "Diğer" (no category). "Diğer" itself can never be deleted. */
export function removeCategory(section: ProductsSection, name: string): CategoryResult {
  if (isOtherCategory(name)) return { ok: false, error: 'reserved' }
  const names = customNames(section)
  const key = categoryKey(name)
  if (!names.some((existing) => categoryKey(existing) === key)) return { ok: false, error: 'missing' }
  return {
    ok: true,
    section: {
      ...section,
      categories: names.filter((existing) => categoryKey(existing) !== key),
      items: section.items.map((item) => {
        if (categoryKey(item.category) !== key) return item
        const { category: _removed, ...rest } = item
        return rest
      }),
    },
  }
}

/** Sets one product's category; empty or "Diğer" clears it so it lands in "Diğer". */
export function categoryPatchValue(section: ProductsSection, raw: string): string | undefined {
  if (isOtherCategory(raw)) return undefined
  const key = categoryKey(raw)
  return customNames(section).find((name) => categoryKey(name) === key) ?? cleanCategoryName(raw)
}

/**
 * Orders the public groups (sidebar, counters) by the owner's list. Sites that never used the list keep their
 * first-appearance order, so their published markup is untouched.
 */
export function orderCatalogGroups<T extends Pick<CatalogGroup, 'name' | 'slug'>>(
  groups: T[],
  section: Pick<ProductsSection, 'categories'>,
): T[] {
  const list = section.categories
  if (!list || list.length === 0) return groups
  const rank = new Map(list.map((name, i) => [slugify(name), i]))
  const rankOf = (g: T) => (g.slug === UNCATEGORIZED_SLUG ? Number.MAX_SAFE_INTEGER : (rank.get(g.slug) ?? list.length))
  return [...groups].sort((a, b) => rankOf(a) - rankOf(b))
}
