import { isStorefront, type Section, type WebsiteSchema } from '@/lib/website-schema'
import { blankSection } from '@/lib/website-edit-operations'

/** True when the site has an about section, visible or hidden. */
export function hasAboutSection(site: Pick<WebsiteSchema, 'sections'>): boolean {
  return site.sections.some((section) => section.type === 'about')
}

/**
 * Deterministic post-generation guard: every NEWLY generated STOREFRONT must
 * carry an about ("Hakkımızda") section, because payment-provider review and
 * buyers expect to see who runs the store. Non-store sites are returned as is.
 * When missing, a starter section is inserted before the contact section (or
 * the footer, or appended when neither exists). Existing sites never pass
 * through this; it only runs at generation time.
 */
export function ensureStoreAboutSection<T extends Pick<WebsiteSchema, 'sections' | 'meta'>>(site: T): T {
  if (!isStorefront(site as unknown as WebsiteSchema) || hasAboutSection(site)) return site

  const about: Section = blankSection('about', site.meta.language)
  const sections = [...site.sections]
  const anchor = (type: Section['type']) => sections.findIndex((s) => s.type === type)
  const contactIndex = anchor('contact')
  const footerIndex = anchor('footer')
  const at = contactIndex !== -1 ? contactIndex : footerIndex !== -1 ? footerIndex : sections.length
  sections.splice(at, 0, about)
  return { ...site, sections }
}

type Copy = {
  suggestionText: string
  suggestionAction: string
}

const TR: Copy = {
  suggestionText: 'Mağazanız hakkımızda bölümü içermiyor; alıcılar ve ödeme sağlayıcısı bunu bekler.',
  suggestionAction: 'Ekleyin.',
}

const EN: Copy = {
  suggestionText: 'Your store has no about section; buyers and payment providers expect one.',
  suggestionAction: 'Add one.',
}

export function aboutSectionCopy(lang: string): Copy {
  return lang === 'tr' ? TR : EN
}
