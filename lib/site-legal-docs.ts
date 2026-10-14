import { docToBlocks, docToMarkup, parseLegalMarkup, type LegalBlock } from '@/lib/legal-markup'
import {
  LEGAL_TEMPLATE_VERSION,
  SITE_LEGAL_BUILDERS,
  companyFromSite,
  getSiteLegalDoc,
  type SiteLegalCompany,
  type SiteLegalSlug,
} from '@/lib/site-legal-templates'
import { isStorefront, type WebsiteSchema } from '@/lib/website-schema'

/**
 * Resolves what a legal page actually shows: the owner's saved text when there
 * is one, otherwise the template filled with the owner's company details.
 */

export const SITE_LEGAL_SLUGS = Object.keys(SITE_LEGAL_BUILDERS) as SiteLegalSlug[]

/** Required for a store's checkout, so the owner can edit them but never hide them. */
export const REQUIRED_STORE_LEGAL: readonly SiteLegalSlug[] = [
  'gizlilik-politikasi',
  'mesafeli-satis-sozlesmesi',
  'teslimat-ve-iade',
]

export function isSiteLegalSlug(slug: string): slug is SiteLegalSlug {
  return Object.prototype.hasOwnProperty.call(SITE_LEGAL_BUILDERS, slug)
}

export function canHideLegalDoc(site: WebsiteSchema, slug: string): boolean {
  if (!isSiteLegalSlug(slug)) return false
  return !(isStorefront(site) && REQUIRED_STORE_LEGAL.includes(slug))
}

/**
 * Slugs renamed after owners may already have saved edits or hidden flags under
 * the old name. Stored data is read through this map so nothing is lost; writes
 * use the new slug only (and clear the old key, see `legalSlugKeys`).
 */
export const LEGACY_LEGAL_SLUGS: Readonly<Record<string, SiteLegalSlug>> = {
  'iptal-ve-iade': 'teslimat-ve-iade',
}

/** The slug plus any legacy slug that used to name the same document. */
export function legalSlugKeys(slug: string): string[] {
  return [slug, ...Object.entries(LEGACY_LEGAL_SLUGS).filter(([, v]) => v === slug).map(([k]) => k)]
}

export function isLegalDocHidden(site: WebsiteSchema, slug: string): boolean {
  if (!canHideLegalDoc(site, slug)) return false
  const hidden = site.legalDocs?.hidden ?? []
  return legalSlugKeys(slug).some((key) => hidden.includes(key))
}

export function customLegalBody(site: WebsiteSchema, slug: string) {
  const docs = site.legalDocs?.docs
  if (!docs) return null
  for (const key of legalSlugKeys(slug)) {
    if (!Object.prototype.hasOwnProperty.call(docs, key)) continue
    const entry = docs[key]
    if (entry.body.trim()) return entry
  }
  return null
}

export function companyForSite(site: WebsiteSchema, siteName: string): SiteLegalCompany {
  return companyFromSite(siteName, site.sections, site.company)
}

const day = (iso: string) => iso.slice(0, 10)

export type ResolvedLegalDoc = {
  slug: SiteLegalSlug
  title: string
  blocks: LegalBlock[]
  source: 'template' | 'custom'
  /** ISO date (yyyy-mm-dd) of the text the visitor is reading. */
  updatedAt: string
}

/** The document for a public page. Null when unknown or hidden by the owner. */
export function resolveLegalDoc(
  slug: string,
  site: WebsiteSchema,
  siteName: string,
): ResolvedLegalDoc | null {
  if (!isSiteLegalSlug(slug) || isLegalDocHidden(site, slug)) return null
  const template = getSiteLegalDoc(slug, companyForSite(site, siteName))
  if (!template) return null

  const custom = customLegalBody(site, slug)
  if (custom) {
    return {
      slug,
      title: template.title,
      blocks: parseLegalMarkup(custom.body),
      source: 'custom',
      updatedAt: day(custom.updatedAt),
    }
  }
  // A template's content changes with the company details, so those count too.
  const companyDay = site.company?.updatedAt ? day(site.company.updatedAt) : ''
  return {
    slug,
    title: template.title,
    blocks: docToBlocks(template),
    source: 'template',
    updatedAt: companyDay > LEGAL_TEMPLATE_VERSION ? companyDay : LEGAL_TEMPLATE_VERSION,
  }
}

/** Template text (company details filled in) the editor starts from. */
export function legalTemplateMarkup(
  slug: string,
  site: WebsiteSchema,
  siteName: string,
): string | null {
  const template = getSiteLegalDoc(slug, companyForSite(site, siteName))
  return template ? docToMarkup(template) : null
}

/** Stored with an order as proof of which wording the buyer accepted. */
export function legalVersionStamp(site: WebsiteSchema, siteName: string): string | null {
  const doc = resolveLegalDoc('mesafeli-satis-sozlesmesi', site, siteName)
  return doc ? `${doc.updatedAt}:${doc.source}` : null
}

/** dd.mm.yyyy from an ISO date, with no timezone shifting. */
export function formatLegalDate(iso: string): string {
  const [y, m, d] = day(iso).split('-')
  return d && m && y ? `${d}.${m}.${y}` : iso
}
