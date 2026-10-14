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
  'iptal-ve-iade',
]

export function isSiteLegalSlug(slug: string): slug is SiteLegalSlug {
  return Object.prototype.hasOwnProperty.call(SITE_LEGAL_BUILDERS, slug)
}

export function canHideLegalDoc(site: WebsiteSchema, slug: string): boolean {
  if (!isSiteLegalSlug(slug)) return false
  return !(isStorefront(site) && REQUIRED_STORE_LEGAL.includes(slug))
}

export function isLegalDocHidden(site: WebsiteSchema, slug: string): boolean {
  return canHideLegalDoc(site, slug) && (site.legalDocs?.hidden ?? []).includes(slug)
}

export function customLegalBody(site: WebsiteSchema, slug: string) {
  const docs = site.legalDocs?.docs
  if (!docs || !Object.prototype.hasOwnProperty.call(docs, slug)) return null
  const entry = docs[slug]
  return entry.body.trim() ? entry : null
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
