import { countCappedSections, type Section, type WebsiteSchema } from '@/lib/website-schema'
import { SITE_SECTION_HARD_CAP } from '@/lib/pricing-config'
import { MENU_MAX } from '@/lib/site-menu'
import {
  findReferencesPage,
  referencesLinkDefaultLabel,
  referencesPageTitle,
  type ReferenceItem,
} from '@/lib/references'

/**
 * Showcase demo references
 * ------------------------
 * Twelve made-up wordmarks per demo so the home strip, the "show more" page and the logo grid can be
 * judged on a realistic amount of content. Every item is flagged `sample` and the demo shows one
 * "Örnek içerik" tag, so nothing reads as a real client. The names are invented and not trademarks
 * of any real company. Demo-only: generation never reads this file.
 */

const FICTIONAL_NAMES = [
  'Norvia',
  'Kelmora',
  'Aldervane',
  'Tavlin',
  'Brisko',
  'Quenta',
  'Orbelis',
  'Marnex',
  'Lumiera',
  'Veldora',
  'Pyrane',
  'Zentrik',
]

const INK = '#64748b'

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)
}

/** A plain wordmark on a transparent 600x300 canvas, with a simple mark so it reads as a logo. */
function wordmarkDataUri(name: string, variant: number): string {
  const mark =
    variant % 3 === 0
      ? `<circle cx="150" cy="150" r="34" fill="none" stroke="${INK}" stroke-width="10"/>`
      : variant % 3 === 1
        ? `<rect x="116" y="116" width="68" height="68" rx="10" fill="${INK}"/>`
        : `<path d="M150 112 L188 188 L112 188 Z" fill="${INK}"/>`
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 300" width="600" height="300">` +
    mark +
    `<text x="218" y="172" font-family="Helvetica, Arial, sans-serif" font-size="64" font-weight="700" fill="${INK}">${escapeXml(name)}</text>` +
    `</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export function demoReferenceItems(slug: string): ReferenceItem[] {
  const offset = [...slug].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % FICTIONAL_NAMES.length
  return FICTIONAL_NAMES.map((_, i) => {
    const name = FICTIONAL_NAMES[(i + offset) % FICTIONAL_NAMES.length]
    return { name, logo: { src: wordmarkDataUri(name, i + offset), alt: name }, sample: true }
  })
}

function insertionIndex(sections: Section[]): number {
  const contact = sections.findIndex((s) => s.type === 'contact')
  if (contact !== -1) return contact
  const footer = sections.findIndex((s) => s.type === 'footer')
  return footer === -1 ? sections.length : footer
}

/**
 * Gives a demo a labelled example-logo strip and its own references page at
 * `/demo/<slug>/referanslar`, and puts the link in the demo's menu. Other sections are not touched.
 */
export function applyDemoReferences(site: WebsiteSchema, slug: string, lang: 'tr' | 'en'): void {
  if (site.sections.some((s) => s.type === 'references')) return
  // A demo that already uses every section slot (the store) stays as it is.
  if (countCappedSections(site.sections) >= SITE_SECTION_HARD_CAP) return

  const section: Section = {
    type: 'references',
    title: referencesPageTitle(lang),
    subtitle:
      lang === 'tr'
        ? 'Bu demodaki firmalar kurgusaldır; logo alanının nasıl görüneceğini göstermek için eklenmiştir.'
        : 'The companies in this demo are fictional, added to show how the logo area would look.',
    items: demoReferenceItems(slug),
    pageEnabled: true,
    linkEnabled: true,
    linkLabel: referencesLinkDefaultLabel(lang),
    autoplay: true,
  }
  const at = insertionIndex(site.sections)
  site.sections = [...site.sections.slice(0, at), section, ...site.sections.slice(at)]

  if (!findReferencesPage(site)) {
    site.pages = [
      ...(site.pages ?? []),
      { slug: 'referanslar', title: referencesPageTitle(lang), kind: 'detail', detailOf: 'references' },
    ]
  }

  const links = site.navigation.links
  if (links.length < MENU_MAX && !links.some((l) => l.href.includes('referanslar'))) {
    const entry = { label: referencesPageTitle(lang), href: `/demo/${slug}/referanslar?lang=${lang}` }
    const contactAt = links.findIndex((l) => l.href.includes('/iletisim'))
    links.splice(contactAt === -1 ? links.length : contactAt, 0, entry)
  }
}
