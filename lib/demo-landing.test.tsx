import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { icons as lucideIcons } from 'lucide-react'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import { resolveTheme } from '@/components/website-renderer/theme'
import { DemoCtaStrip } from '@/components/demo-site/demo-cta-strip'
import { isMeasurementSurface } from '@/lib/analytics-config'
import { ATTRIBUTION_KEYS } from '@/lib/attribution'
import { DEMO_CTA_STRIP_HEIGHT_PX, demoCtaHref, demoCtaStripVars } from '@/lib/demo-chrome'
import { LANDING_DEMOS, LANDING_DEMO_PHONE, landingDemoSlugs } from '@/lib/demo-landing'
import { allDemoSlugs, allDemos, buildDemoSite, demos, getDemo, landingDemos } from '@/lib/demos'
import { resolveContactActions } from '@/lib/site-contact-actions'
import { websiteSchema, type WebsiteSchema } from '@/lib/website-schema'

const LANGS = ['tr', 'en'] as const
const SLUGS = ['oto-cekici', 'nakliyat', 'kombi-klima', 'insaat']
const SECTION_ORDER = [
  'hero',
  'services',
  'gallery',
  'process',
  'features',
  'testimonials',
  'references',
  'about',
  'faq',
  'contact',
  'footer',
]

const CTA: Record<string, { tr: string; en: string }> = {
  'oto-cekici': { tr: 'Hemen ara', en: 'Call now' },
  nakliyat: { tr: 'Ücretsiz keşif iste', en: 'Request a free survey' },
  'kombi-klima': { tr: 'Servis çağır', en: 'Request service' },
  insaat: { tr: 'Teklif al', en: 'Get a quote' },
}

const CAMPAIGN: Record<string, string> = {
  'oto-cekici': 'oto_cekici',
  nakliyat: 'nakliyat',
  'kombi-klima': 'kombi_klima',
  insaat: 'insaat',
}

/** Unverifiable claims a sample business must not make. */
const CLAIM =
  /7\/24|24\/7|garanti|guarantee|ödül|award|sertifika|certif|yıllık|yıldır|years|müşteri memnuniyeti|satisfaction|%|lider|leading|en iyi|\bbest\b|yetkili servis|authori[sz]ed|binlerce|thousands/i

function build(slug: string, lang: (typeof LANGS)[number]): WebsiteSchema {
  return buildDemoSite(getDemo(slug)!, lang)
}

function section<T extends WebsiteSchema['sections'][number]['type']>(site: WebsiteSchema, type: T) {
  const found = site.sections.find((s) => s.type === type)
  if (!found) throw new Error(`missing ${type}`)
  return found as Extract<WebsiteSchema['sections'][number], { type: T }>
}

/** Every visitor-facing string of the page except the placeholder phone and the copyright year. */
function copyOf(site: WebsiteSchema): string[] {
  const out: string[] = []
  const walk = (value: unknown, key = '') => {
    if (typeof value === 'string') {
      if (!['type', 'icon', 'href', 'src', 'aspectRatio', 'variant', 'phone', 'email', 'copyright', 'trustText'].includes(key)) out.push(value)
    } else if (Array.isArray(value)) {
      for (const entry of value) walk(entry, key)
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, k)
    }
  }
  walk(site.sections)
  walk(site.navigation)
  walk([site.meta.name, site.meta.tagline, site.meta.description])
  return out
}

describe('sector landing demos: registry', () => {
  it('adds exactly the four sector demos, next to the untouched showcase demos', () => {
    expect(landingDemos.map((d) => d.slug)).toEqual(SLUGS)
    expect(landingDemoSlugs.sort()).toEqual([...SLUGS].sort())
    expect(demos).toHaveLength(8)
    expect(demos.every((d) => d.campaign === undefined)).toBe(true)
    expect(allDemos).toHaveLength(12)
    expect(new Set(allDemoSlugs).size).toBe(12)
    for (const slug of SLUGS) expect(getDemo(slug)?.slug).toBe(slug)
  })

  it('uses the requested display names and underscore campaign names', () => {
    expect(landingDemos.map((d) => d.tag.tr)).toEqual([
      'Oto Kurtarıcı & Çekici',
      'Nakliyat & Evden Eve Taşıma',
      'Kombi & Klima Servisi',
      'İnşaat & Taahhüt',
    ])
    for (const demo of landingDemos) expect(demo.campaign).toBe(CAMPAIGN[demo.slug])
  })
})

describe.each(SLUGS)('sector landing demo %s', (slug) => {
  it.each(LANGS)('builds a valid one-page site with the required sections (%s)', (lang) => {
    const site = build(slug, lang)
    expect(websiteSchema.safeParse(site).success).toBe(true)
    expect(site.sections.map((s) => s.type)).toEqual(SECTION_ORDER)
    expect(site.pages).toHaveLength(1)
    expect(site.meta.language).toBe(lang)
    expect(JSON.stringify(build(slug, lang))).toBe(JSON.stringify(site))

    const steps = section(site, 'process').steps.length
    expect(steps).toBeGreaterThanOrEqual(3)
    expect(steps).toBeLessThanOrEqual(4)
    const questions = section(site, 'faq').items.length
    expect(questions).toBeGreaterThanOrEqual(4)
    expect(questions).toBeLessThanOrEqual(5)
  })

  it.each(LANGS)('leads with the sector call to action (%s)', (lang) => {
    const site = build(slug, lang)
    expect(section(site, 'hero').primaryButton).toEqual({ label: CTA[slug][lang], href: '#contact' })
    expect(site.navigation.cta).toEqual({ label: CTA[slug][lang], href: '#contact' })
  })

  it.each(LANGS)('every menu link points at a section that exists (%s)', (lang) => {
    const site = build(slug, lang)
    const html = renderToStaticMarkup(<WebsiteRenderer site={site} />)
    for (const link of site.navigation.links) {
      expect(link.href.startsWith('#')).toBe(true)
      expect(html, link.href).toContain(`id="${link.href.slice(1)}"`)
    }
  })

  it.each(LANGS)('shows only the placeholder phone, no address, no real contact data (%s)', (lang) => {
    const site = build(slug, lang)
    const contact = section(site, 'contact')
    expect(contact.phone).toBe(LANDING_DEMO_PHONE)
    expect(LANDING_DEMO_PHONE).toBe('0212 000 00 00')
    expect(contact.address).toBeUndefined()
    expect(contact.mapEmbed).toBeUndefined()
    expect(contact.email).toMatch(/@ornek-[a-z]+\.demo$/)
    expect(resolveContactActions(site)?.phone?.href).toBe('tel:02120000000')
    expect(site.meta.name).toMatch(/^(Örnek|Sample) /)
  })

  it.each(LANGS)('carries no invented figures or claims; reviews and logos are labelled samples (%s)', (lang) => {
    const site = build(slug, lang)
    const types = site.sections.map((s) => s.type)
    for (const banned of ['stats', 'pricing', 'team', 'portfolio']) {
      expect(types).not.toContain(banned)
    }
    const reviews = section(site, 'testimonials')
    expect(reviews.items.length).toBeGreaterThanOrEqual(3)
    expect(reviews.pageEnabled).toBe(false)
    expect(reviews.subtitle).toMatch(lang === 'tr' ? /kurgusal/i : /fictional/i)
    const refs = section(site, 'references')
    expect(refs.items.length).toBeGreaterThan(0)
    expect(refs.pageEnabled).toBe(false)
    expect(refs.subtitle).toMatch(lang === 'tr' ? /kurgusal/i : /fictional/i)
    expect(section(site, 'gallery').items.length).toBeGreaterThanOrEqual(3)
    for (const item of section(site, 'services').items) expect(item.src).toMatch(/^\/demos\/.+\.webp$/)
    for (const text of copyOf(site)) {
      expect(text, text).not.toMatch(/\d/)
      expect(text, text).not.toMatch(CLAIM)
    }
    const places = section(site, 'about').highlights ?? []
    expect(places.length).toBeGreaterThan(0)
    for (const place of places) expect(place).toMatch(lang === 'tr' ? /\(örnek\)$/ : /\(sample\)$/)
  })

  it('has the same structure in Turkish and English, with translated copy', () => {
    const tr = build(slug, 'tr')
    const en = build(slug, 'en')
    expect(section(en, 'services').items.length).toBe(section(tr, 'services').items.length)
    expect(section(en, 'features').items.length).toBe(section(tr, 'features').items.length)
    expect(section(en, 'faq').items.length).toBe(section(tr, 'faq').items.length)
    expect(section(en, 'hero').title).not.toBe(section(tr, 'hero').title)
    const trCopy = copyOf(tr).join(' ')
    expect(trCopy).not.toContain('\uFFFD')
    expect(trCopy).toMatch(/[şğıİüöç]/)
  })

  it('uses icons that exist', () => {
    const content = LANDING_DEMOS[slug]
    const names = [...content.services.items, ...content.process.steps, ...content.why.items].map((i) => i.icon)
    for (const name of names) {
      const key = name
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('')
      expect(lucideIcons[key as keyof typeof lucideIcons], name).toBeDefined()
    }
  })
})

/* ---- contrast ------------------------------------------------------------ */

type Rgb = [number, number, number]

function parseColor(value: string): Rgb {
  const hex = /^#([0-9a-f]{6})$/i.exec(value)
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) as Rgb
  const rgb = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(value)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  throw new Error(`unexpected color ${value}`)
}

function luminance(color: Rgb): number {
  const [r, g, b] = color.map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

function over(top: Rgb, bottom: Rgb, alpha: number): Rgb {
  return top.map((v, i) => v * alpha + bottom[i] * (1 - alpha)) as Rgb
}

describe('sector landing demos: palettes', () => {
  it('each sector has its own palette', () => {
    const primaries = SLUGS.map((slug) => resolveTheme(build(slug, 'tr')).primary)
    const backgrounds = SLUGS.map((slug) => resolveTheme(build(slug, 'tr')).background)
    expect(new Set(primaries).size).toBe(SLUGS.length)
    expect(new Set(backgrounds).size).toBe(SLUGS.length)
  })

  it.each(SLUGS)('%s meets WCAG AA for text (4.5:1) and icons (3:1)', (slug) => {
    const theme = resolveTheme(build(slug, 'tr'))
    const primary = parseColor(theme.primary)
    const background = parseColor(theme.background)
    const foreground = parseColor(theme.foreground)
    const card = parseColor(theme.card)
    const accent = parseColor(theme.accent)
    // Muted copy is the foreground at 65% opacity (see `resolveTheme`).
    const mutedAlpha = 0.65

    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(over(foreground, background, mutedAlpha), background)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(over(foreground, card, mutedAlpha), card)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(parseColor(theme.primaryFg), primary)).toBeGreaterThanOrEqual(4.5)
    // Primary is also a text color: the hero badge sits on a 14% primary tint.
    expect(contrast(primary, over(primary, background, 0.14))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(primary, card)).toBeGreaterThanOrEqual(4.5)
    // Icons: service icons on a 16% primary tint, feature icons on an 18% accent tint.
    expect(contrast(primary, over(primary, card, 0.16))).toBeGreaterThanOrEqual(3)
    expect(contrast(accent, over(accent, card, 0.18))).toBeGreaterThanOrEqual(3)
    expect(contrast(accent, card)).toBeGreaterThanOrEqual(3)
  })
})

/* ---- return path to gloval.ai -------------------------------------------- */

describe('sector landing demos: "Ücretsiz dene" strip', () => {
  it.each(SLUGS)('%s links to the home page with the demo UTM parameters', (slug) => {
    const href = demoCtaHref(CAMPAIGN[slug], 'tr')
    expect(href).toBe(
      `/?utm_source=demo&utm_medium=landing&utm_campaign=${CAMPAIGN[slug]}&utm_content=demo_cta`,
    )
    expect(demoCtaHref(CAMPAIGN[slug], 'en')).toBe(`${href}&lang=en`)
  })

  it('the existing attribution capture reads every parameter, on a surface it measures', () => {
    const url = new URL(demoCtaHref('oto_cekici', 'tr'), 'https://gloval.ai')
    const captured = ATTRIBUTION_KEYS.filter((key) => url.searchParams.has(key))
    expect(captured).toEqual(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'])
    expect(isMeasurementSurface('gloval.ai', url.pathname)).toBe(true)
    // The demo pages themselves are measured too, so an ad's own UTMs are captured on landing.
    for (const slug of SLUGS) expect(isMeasurementSurface('gloval.ai', `/demo/${slug}`)).toBe(true)
  })

  it('renders the message, the button and the shared height, as a full page link', () => {
    const html = renderToStaticMarkup(
      <DemoCtaStrip
        href={demoCtaHref('insaat', 'tr')}
        lead="Bu bir örnek demodur."
        text="Kendi sitenizi GLOVAL AI ile dakikalar içinde kurun."
        cta="Ücretsiz dene"
      />,
    )
    expect(html).toContain('Bu bir örnek demodur.')
    expect(html).toContain('Kendi sitenizi GLOVAL AI ile dakikalar içinde kurun.')
    expect(html).toContain('Ücretsiz dene')
    expect(html).toContain('utm_campaign=insaat')
    expect(html).toContain(`height:${DEMO_CTA_STRIP_HEIGHT_PX}px`)
    expect(demoCtaStripVars(true)).toEqual({ '--demo-cta-h': `${DEMO_CTA_STRIP_HEIGHT_PX}px` })
    expect(demoCtaStripVars(false)).toEqual({})
  })

  it('raises the same fixed controls the site cookie card raises', () => {
    const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')
    const cookie = css.match(/html\[data-cookie-banner-site\] :is\((.+?)\)\s*\{\s*translate:/)
    const strip = css.match(/\[data-demo-cta-root\] :is\((.+?)\)\s*\{\s*translate:/)
    expect(cookie).not.toBeNull()
    expect(strip?.[1]).toBe(cookie?.[1])
  })

  it('lifts the cookie card by exactly the strip height', () => {
    const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')
    const lift = css.match(/html:has\(\[data-demo-cta-root\]\) \.cookie-card\s*\{\s*translate: 0 calc\(-(\d+)px/)
    expect(Number(lift?.[1])).toBe(DEMO_CTA_STRIP_HEIGHT_PX)
  })
})
