import type { Section, WebsiteSchema } from '@/lib/website-schema'
import { isStorefront } from '@/lib/website-schema'

/**
 * Guards that keep the AI from inventing a product catalog on a corporate site.
 * A corporate site's products are the owner's own data (name, code, price), so
 * neither generation nor an AI edit may fabricate them. Pure: no I/O.
 */

type ProductsSection = Extract<Section, { type: 'products' }>
type ProductItem = ProductsSection['items'][number]

function fold(value: string): string {
  return value
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .trim()
}

const STORE_LINK = /^(#|\/)?(products|categories|urunler|kategoriler)\/?$/i

/** An item with no name is an empty draft row, never a product. */
export function hasNamedProducts(section: Pick<ProductsSection, 'items'>): boolean {
  return section.items.some((item) => item.name.trim().length > 0)
}

/** The empty draft row a freshly added corporate "Ürünler" section starts with. */
export function emptyProductDraft(): ProductItem {
  return { name: '', price: '', imagePrompt: '' }
}

function isStoreSection(section: Section): boolean {
  return (section.type === 'products' && !section.inline) || section.type === 'categories'
}

/**
 * Removes the storefront sections (showcase products, categories) a model
 * invented on a site that was not asked to be a store. Pages, menu links that
 * pointed at them are dropped too; the site is returned untouched when the cut
 * would leave it below the schema's minimum of three home sections.
 */
export function stripInventedStoreSections(site: WebsiteSchema): WebsiteSchema {
  if (!site.sections.some(isStoreSection) && !site.pages.some((p) => p.sections?.some(isStoreSection))) return site

  const sections = site.sections.filter((s) => !isStoreSection(s))
  if (sections.length < 3) return site

  const pages = site.pages
    .filter((p) => p.isHome || !STORE_LINK.test(`/${p.slug}`.replace(/^\/+/, '')))
    .map((p) => (p.sections ? { ...p, sections: p.sections.filter((s) => !isStoreSection(s)) } : p))
  const links = site.navigation.links.filter((l) => !STORE_LINK.test((l.href ?? '').replace(/^\/+/, '')))

  return {
    ...site,
    sections,
    pages: pages.length > 0 ? pages : site.pages,
    navigation: { ...site.navigation, links: links.length > 0 ? links : site.navigation.links },
  }
}

/**
 * After an AI edit of a corporate site: no storefront section may appear, and
 * every NEW catalog item must carry a name the user actually wrote in the
 * instruction. Items already in the catalog are always kept.
 */
export function guardCorporateCatalog(
  original: WebsiteSchema,
  candidate: WebsiteSchema,
  instruction: string,
): WebsiteSchema {
  if (isStorefront(original)) return candidate

  const stripped = stripInventedStoreSections(candidate)
  const typed = fold(instruction)
  const before = new Set(
    original.sections.flatMap((s) => (s.type === 'products' ? s.items.map((i) => fold(i.name)) : [])),
  )

  let changed = stripped !== candidate
  const sections = stripped.sections.map((section) => {
    if (section.type !== 'products' || !section.inline) return section
    const items = section.items.filter((item) => {
      const name = fold(item.name)
      return name === '' || before.has(name) || typed.includes(name)
    })
    if (items.length === section.items.length) return section
    changed = true
    return { ...section, items: items.length > 0 ? items : [emptyProductDraft()] }
  })
  return changed ? { ...stripped, sections } : candidate
}
