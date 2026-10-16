import { isLegalDocHidden } from '@/lib/site-legal-docs'
import { canonicalSectionAnchor, resolveHrefToPageSlug } from '@/lib/website-pages'
import { isStorefront, type NavLink, type WebsiteSchema } from '@/lib/website-schema'

/**
 * Footer link rules (pure, shared by the renderer, the editor and the AI).
 *
 * A footer link is only ever shown or saved when its target really exists.
 * Empty targets, `#` placeholders, unknown pages, anchors to missing sections,
 * non-https URLs and malformed mailto/tel values are all rejected, so the
 * footer never contains a dead link. Legacy sites keep their stored data: the
 * invalid links are simply hidden at render time and flagged in the editor.
 */

export type FooterTargetKind =
  | 'page'
  | 'section'
  | 'store'
  | 'cart'
  | 'legal'
  | 'external'
  | 'mail'
  | 'tel'

export type FooterLinkIssue =
  | 'empty'
  | 'placeholder'
  | 'insecure'
  | 'malformed'
  | 'unknown-page'
  | 'unknown-section'
  | 'unknown-legal'
  | 'store-unavailable'

export type FooterLinkCheck =
  | { ok: true; kind: FooterTargetKind }
  | { ok: false; issue: FooterLinkIssue }

/** Store routes a footer link may point to (tenant-relative). */
export const FOOTER_STORE_TARGETS = [
  { href: '/store', key: 'products' },
  { href: '/store?indirim=1', key: 'campaigns' },
  { href: '/hesap', key: 'account' },
  { href: '#cart', key: 'cart' },
] as const

export const FOOTER_CART_HREF = '#cart'

/** Official-text pages served by every published site under `/yasal/<slug>`. */
export const FOOTER_LEGAL_DOCS = [
  { slug: 'gizlilik-politikasi', tr: 'Gizlilik Politikası', en: 'Privacy Policy' },
  { slug: 'mesafeli-satis-sozlesmesi', tr: 'Mesafeli Satış Sözleşmesi', en: 'Distance Sales Agreement' },
  { slug: 'hizmet-sozlesmesi', tr: 'Hizmet Sözleşmesi', en: 'Terms of Service' },
  { slug: 'teslimat-ve-iade', tr: 'Teslimat ve İade', en: 'Delivery & Returns' },
  { slug: 'uyelik-sozlesmesi', tr: 'Üyelik Sözleşmesi', en: 'Membership Agreement' },
] as const

export type FooterLegalSlug = (typeof FOOTER_LEGAL_DOCS)[number]['slug']

const LEGAL_SLUGS = new Set<string>(FOOTER_LEGAL_DOCS.map((d) => d.slug))

export function legalDocPath(slug: FooterLegalSlug): string {
  return `/yasal/${slug}`
}

export function isFooterLegalSlug(slug: string): slug is FooterLegalSlug {
  return LEGAL_SLUGS.has(slug)
}

const MAIL_RE = /^mailto:[^\s@?]+@[^\s@?]+\.[^\s@?]+(\?[^\s]*)?$/i
const TEL_RE = /^tel:\+?[0-9][0-9\s\-().]{5,}$/i

function storeTargetKnown(href: string): boolean {
  return FOOTER_STORE_TARGETS.some((t) => t.href === href)
}

/**
 * Validates one footer link target.
 *
 * `site` is optional: without it page and section targets cannot be verified
 * and are accepted when they are at least well-formed.
 */
export function validateFooterHref(
  rawHref: string | null | undefined,
  site?: WebsiteSchema | null,
): FooterLinkCheck {
  const href = (rawHref ?? '').trim()
  if (!href) return { ok: false, issue: 'empty' }
  if (href === '#') return { ok: false, issue: 'placeholder' }

  const lower = href.toLowerCase()
  if (lower.startsWith('mailto:')) {
    return MAIL_RE.test(href) ? { ok: true, kind: 'mail' } : { ok: false, issue: 'malformed' }
  }
  if (lower.startsWith('tel:')) {
    return TEL_RE.test(href) ? { ok: true, kind: 'tel' } : { ok: false, issue: 'malformed' }
  }
  if (lower.startsWith('http://')) return { ok: false, issue: 'insecure' }
  if (lower.startsWith('https://')) {
    try {
      const url = new URL(href)
      return url.hostname.includes('.') ? { ok: true, kind: 'external' } : { ok: false, issue: 'malformed' }
    } catch {
      return { ok: false, issue: 'malformed' }
    }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) {
    return { ok: false, issue: 'malformed' }
  }

  const store = site ? isStorefront(site) : true

  if (href === FOOTER_CART_HREF) {
    return store ? { ok: true, kind: 'cart' } : { ok: false, issue: 'store-unavailable' }
  }

  if (href.startsWith('#')) {
    const id = href.slice(1)
    if (!site) return { ok: true, kind: 'section' }
    const type = canonicalSectionAnchor(id) ?? id
    return site.sections.some((s) => s.type === type)
      ? { ok: true, kind: 'section' }
      : { ok: false, issue: 'unknown-section' }
  }

  if (href.startsWith('/yasal/')) {
    return LEGAL_SLUGS.has(href.slice('/yasal/'.length))
      ? { ok: true, kind: 'legal' }
      : { ok: false, issue: 'unknown-legal' }
  }

  if (storeTargetKnown(href)) {
    return store ? { ok: true, kind: 'store' } : { ok: false, issue: 'store-unavailable' }
  }

  if (href.startsWith('/')) {
    if (!site) return href === '/' ? { ok: true, kind: 'page' } : { ok: false, issue: 'unknown-page' }
    return resolveHrefToPageSlug(site, href)
      ? { ok: true, kind: 'page' }
      : { ok: false, issue: 'unknown-page' }
  }

  return { ok: false, issue: 'malformed' }
}

export function isValidFooterHref(href: string | null | undefined, site?: WebsiteSchema | null): boolean {
  return validateFooterHref(href, site).ok
}

export type FooterColumnInput = { title: string; links: NavLink[] }

/**
 * The columns the footer really renders: links without a label or with an
 * invalid target are dropped, and columns left without links disappear.
 */
export function resolveFooterColumns(
  columns: FooterColumnInput[] | undefined,
  site?: WebsiteSchema | null,
): FooterColumnInput[] {
  if (!columns) return []
  const out: FooterColumnInput[] = []
  for (const column of columns) {
    const links = column.links.filter(
      (l) => l.label.trim() !== '' && isValidFooterHref(l.href, site),
    )
    if (links.length > 0) out.push({ title: column.title, links })
  }
  return out
}

export type FooterLegalInput = { hidden?: boolean; links?: NavLink[] } | undefined

const CORPORATE_LEGAL_SLUGS: FooterLegalSlug[] = ['gizlilik-politikasi']

/** What corporate footers showed before the privacy-only default; kept for sites that never stored `legal`. */
const LEGACY_CORPORATE_LEGAL_SLUGS: FooterLegalSlug[] = [
  'gizlilik-politikasi',
  'hizmet-sozlesmesi',
  'uyelik-sozlesmesi',
]

function legalLinksFor(slugs: readonly FooterLegalSlug[], lang: 'tr' | 'en'): NavLink[] {
  return slugs.map((slug) => {
    const doc = FOOTER_LEGAL_DOCS.find((d) => d.slug === slug)!
    return { label: doc[lang === 'en' ? 'en' : 'tr'], href: legalDocPath(slug) }
  })
}

/**
 * Default official-text links for a NEW site: a store carries every document,
 * a corporate site only the privacy policy.
 */
export function defaultLegalLinks(
  kind: 'ecommerce' | 'corporate',
  lang: 'tr' | 'en' = 'tr',
): NavLink[] {
  return legalLinksFor(kind === 'ecommerce' ? FOOTER_LEGAL_DOCS.map((d) => d.slug) : CORPORATE_LEGAL_SLUGS, lang)
}

/**
 * What an existing site shows when it never stored `legal`. Corporate sites
 * keep their original three links so already-published footers do not change.
 */
export function implicitLegalLinks(kind: 'ecommerce' | 'corporate', lang: 'tr' | 'en' = 'tr'): NavLink[] {
  return kind === 'ecommerce' ? defaultLegalLinks(kind, lang) : legalLinksFor(LEGACY_CORPORATE_LEGAL_SLUGS, lang)
}

/** Persists the privacy-only legal bar on a newly generated corporate site (stores and existing choices are left alone). */
export function seedFooterLegal(site: WebsiteSchema, lang: 'tr' | 'en' = 'tr'): WebsiteSchema {
  if (isStorefront(site)) return site
  const index = site.sections.findIndex((s) => s.type === 'footer')
  const footer = site.sections[index]
  if (!footer || footer.type !== 'footer' || footer.legal) return site
  const sections = site.sections.slice()
  sections[index] = { ...footer, legal: { links: defaultLegalLinks('corporate', lang) } }
  return { ...site, sections }
}

/**
 * The official-text links the footer bar shows. Unset => defaults for the site
 * kind; `hidden` => none; an explicit list (even empty) is used as stored, with
 * invalid entries dropped.
 */
export function resolveFooterLegal(
  legal: FooterLegalInput,
  site: WebsiteSchema | null | undefined,
  lang: 'tr' | 'en' = 'tr',
): NavLink[] {
  const store = Boolean(site && isStorefront(site))
  if (legal?.hidden && !store) return []
  const kind = store ? 'ecommerce' : 'corporate'
  const owned = legal?.hidden ? [] : (legal?.links ?? implicitLegalLinks(kind, lang))
  const links = store ? withStoreEssentialLegal(owned, lang) : owned
  return links.filter((l) => {
    if (l.label.trim() === '' || !isValidFooterHref(l.href, site)) return false
    const legalSlug = /\/yasal\/([^/?#]+)/.exec(l.href)?.[1]
    return !(site && legalSlug && isLegalDocHidden(site, legalSlug))
  })
}

/**
 * Official texts a store footer must always carry (payment-provider review and
 * consumer law): privacy, delivery & returns, distance sales. The owner may
 * relabel or reorder them, but never remove or hide them.
 */
export const STORE_ESSENTIAL_LEGAL_SLUGS: readonly FooterLegalSlug[] = [
  'gizlilik-politikasi',
  'teslimat-ve-iade',
  'mesafeli-satis-sozlesmesi',
]

function withStoreEssentialLegal(owned: NavLink[], lang: 'tr' | 'en'): NavLink[] {
  const essentialHrefs = new Set(STORE_ESSENTIAL_LEGAL_SLUGS.map(legalDocPath))
  const essentials = STORE_ESSENTIAL_LEGAL_SLUGS.map((slug) => {
    const href = legalDocPath(slug)
    const doc = FOOTER_LEGAL_DOCS.find((d) => d.slug === slug)!
    const stored = owned.find((l) => l.href.trim() === href && l.label.trim() !== '')
    return stored ?? { label: doc[lang === 'en' ? 'en' : 'tr'], href }
  })
  return [...essentials, ...owned.filter((l) => !essentialHrefs.has(l.href.trim()))]
}

/**
 * "Hakkımızda" and "İletişim" links a store footer must always show. A link is
 * only offered when its section really is visible on the site (no dead links),
 * and is skipped when the footer's link columns already carry it.
 */
export function resolveStoreEssentialPageLinks(
  site: WebsiteSchema | null | undefined,
  columns: FooterColumnInput[],
  lang: 'tr' | 'en' = 'tr',
): NavLink[] {
  if (!site || !isStorefront(site)) return []
  const tr = lang !== 'en'
  const inColumns = new Set(columns.flatMap((c) => c.links.map((l) => l.href.trim())))
  const visible = (type: string) => site.sections.some((s) => s.type === type && !s.hidden)
  const wanted: NavLink[] = [
    { label: tr ? 'Hakkımızda' : 'About', href: '#about' },
    { label: tr ? 'İletişim' : 'Contact', href: '#contact' },
  ]
  return wanted.filter((l) => visible(l.href.slice(1)) && !inColumns.has(l.href))
}

/**
 * Default footer columns for a new site. Only targets that really exist are
 * linked: store routes on storefronts, sections the site actually has, and the
 * site's own pages. Returns undefined when nothing real can be linked.
 */
export function buildDefaultFooterColumns(
  site: WebsiteSchema,
  lang: 'tr' | 'en' = 'tr',
): FooterColumnInput[] | undefined {
  const tr = lang !== 'en'
  const columns: FooterColumnInput[] = []
  const has = (type: string) => site.sections.some((s) => s.type === type)

  if (isStorefront(site)) {
    columns.push({
      title: tr ? 'Alışveriş' : 'Shop',
      links: [
        { label: tr ? 'Ürünler' : 'Products', href: '/store' },
        { label: tr ? 'Kampanyalar' : 'Deals', href: '/store?indirim=1' },
        { label: tr ? 'Sepetim' : 'Cart', href: FOOTER_CART_HREF },
      ],
    })
  }

  const about: NavLink[] = []
  if (has('about')) about.push({ label: tr ? 'Hakkımızda' : 'About', href: '#about' })
  if (has('services')) about.push({ label: tr ? 'Hizmetler' : 'Services', href: '#services' })
  if (has('faq')) about.push({ label: tr ? 'Sıkça Sorulanlar' : 'FAQ', href: '#faq' })
  if (about.length) columns.push({ title: tr ? 'Kurumsal' : 'Company', links: about })

  const help: NavLink[] = []
  if (has('contact')) help.push({ label: tr ? 'İletişim' : 'Contact', href: '#contact' })
  if (isStorefront(site)) help.push({ label: tr ? 'Hesabım' : 'My account', href: '/hesap' })
  if (help.length) columns.push({ title: tr ? 'Yardım' : 'Help', links: help })

  return columns.length ? columns : undefined
}

const MAX_COLUMNS = 5
const MAX_LINKS = 8

/** Same rules the editor applies on save: no empty titles, labels or dead targets. */
export function sanitizeFooterColumns(
  columns: FooterColumnInput[],
  site?: WebsiteSchema | null,
): FooterColumnInput[] {
  return columns
    .map((c) => ({
      title: c.title.trim(),
      links: c.links
        .filter((l) => l.label.trim() !== '' && isValidFooterHref(l.href, site))
        .slice(0, MAX_LINKS),
    }))
    .filter((c) => c.title !== '' && c.links.length > 0)
    .slice(0, MAX_COLUMNS)
}

export function sanitizeFooterLegalLinks(links: NavLink[], site?: WebsiteSchema | null): NavLink[] {
  return links
    .filter((l) => l.label.trim() !== '' && isValidFooterHref(l.href, site))
    .slice(0, MAX_LINKS)
}

export type FooterTargetOption = { value: string; label: string }
export type FooterTargetGroup = { group: string; options: FooterTargetOption[] }

const SECTION_LABELS: Record<string, { tr: string; en: string }> = {
  about: { tr: 'Hakkımızda', en: 'About' },
  services: { tr: 'Hizmetler', en: 'Services' },
  features: { tr: 'Özellikler', en: 'Features' },
  testimonials: { tr: 'Referanslar', en: 'Testimonials' },
  gallery: { tr: 'Galeri', en: 'Gallery' },
  portfolio: { tr: 'Portföy', en: 'Portfolio' },
  products: { tr: 'Ürünler (bölüm)', en: 'Products (section)' },
  categories: { tr: 'Kategoriler (bölüm)', en: 'Categories (section)' },
  process: { tr: 'Süreç', en: 'Process' },
  team: { tr: 'Ekip', en: 'Team' },
  pricing: { tr: 'Fiyatlandırma', en: 'Pricing' },
  faq: { tr: 'Sıkça Sorulanlar', en: 'FAQ' },
  contact: { tr: 'İletişim', en: 'Contact' },
}

const STORE_LABELS: Record<string, { tr: string; en: string }> = {
  products: { tr: 'Ürünler', en: 'Products' },
  campaigns: { tr: 'Kampanyalar (indirimdekiler)', en: 'Deals (discounted)' },
  account: { tr: 'Hesabım', en: 'My account' },
  cart: { tr: 'Sepet', en: 'Cart' },
}

/** Every internal target a footer link can point to on this site. */
export function footerTargetOptions(
  site: WebsiteSchema,
  lang: 'tr' | 'en' = 'tr',
  pages: Array<{ slug: string; title: string; isHome: boolean }> = [],
): FooterTargetGroup[] {
  const l = lang === 'en' ? 'en' : 'tr'
  const groups: FooterTargetGroup[] = []

  const pageOptions = pages
    .filter((p) => p.slug && validateFooterHref(p.isHome ? '/' : `/${p.slug}`, site).ok)
    .map((p) => ({ value: p.isHome ? '/' : `/${p.slug}`, label: p.title }))
  if (pages.length > 1 && pageOptions.length) {
    groups.push({ group: l === 'tr' ? 'Site sayfaları' : 'Site pages', options: pageOptions })
  }

  if (isStorefront(site)) {
    groups.push({
      group: l === 'tr' ? 'Mağaza' : 'Store',
      options: FOOTER_STORE_TARGETS.map((t) => ({ value: t.href, label: STORE_LABELS[t.key][l] })),
    })
  }

  const seen = new Set<string>()
  const sectionOptions: FooterTargetOption[] = []
  for (const s of site.sections) {
    const label = SECTION_LABELS[s.type]
    if (!label || seen.has(s.type)) continue
    seen.add(s.type)
    sectionOptions.push({ value: `#${s.type}`, label: label[l] })
  }
  if (sectionOptions.length) {
    groups.push({ group: l === 'tr' ? 'Sayfa içi bölüm' : 'On-page section', options: sectionOptions })
  }

  groups.push({
    group: l === 'tr' ? 'Resmi yazılar' : 'Official texts',
    options: FOOTER_LEGAL_DOCS.map((d) => ({ value: legalDocPath(d.slug), label: d[l] })),
  })
  return groups
}

export type FooterCustomKind = 'external' | 'mail' | 'tel'

/** The editor's custom-target kind for a stored href, or null for a listed target. */
export function customKindOf(href: string): FooterCustomKind | null {
  const lower = href.trim().toLowerCase()
  if (lower.startsWith('mailto:')) return 'mail'
  if (lower.startsWith('tel:')) return 'tel'
  if (lower.startsWith('http://') || lower.startsWith('https://')) return 'external'
  return null
}

const ISSUE_TEXT: Record<FooterLinkIssue, { tr: string; en: string }> = {
  empty: { tr: 'Hedef seçilmedi; bu bağlantı kaydedilmez.', en: 'No target; this link is not saved.' },
  placeholder: { tr: '"#" geçerli bir hedef değil.', en: '"#" is not a valid target.' },
  insecure: { tr: 'Yalnızca https:// adresleri kabul edilir.', en: 'Only https:// URLs are accepted.' },
  malformed: { tr: 'Hedef biçimi geçersiz.', en: 'Target format is invalid.' },
  'unknown-page': { tr: 'Bu sayfa sitede yok.', en: 'This page does not exist on the site.' },
  'unknown-section': { tr: 'Bu bölüm sitede yok.', en: 'This section does not exist on the site.' },
  'unknown-legal': { tr: 'Bilinmeyen resmi yazı.', en: 'Unknown official text.' },
  'store-unavailable': { tr: 'Mağaza hedefi yalnızca e-ticaret sitelerinde kullanılır.', en: 'Store targets only work on e-commerce sites.' },
}

export function describeFooterIssue(issue: FooterLinkIssue, lang: 'tr' | 'en' = 'tr'): string {
  return ISSUE_TEXT[issue][lang === 'en' ? 'en' : 'tr']
}

/**
 * Persists default link columns onto a freshly generated site's footer, so the
 * footer links exist in the saved schema (and are editable) from the first save.
 * Sites whose footer already carries columns are left untouched.
 */
export function seedFooterColumns(site: WebsiteSchema, lang: 'tr' | 'en' = 'tr'): WebsiteSchema {
  const index = site.sections.findIndex((s) => s.type === 'footer')
  const footer = site.sections[index]
  if (!footer || footer.type !== 'footer' || (footer.columns && footer.columns.length > 0)) {
    return site
  }
  const columns = buildDefaultFooterColumns(site, lang)
  if (!columns || columns.length === 0) return site
  const sections = site.sections.slice()
  sections[index] = { ...footer, columns }
  return { ...site, sections }
}
