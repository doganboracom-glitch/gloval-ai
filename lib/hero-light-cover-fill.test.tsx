import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import { resolveTheme } from '@/components/website-renderer/theme'
import { applyOperation } from '@/lib/website-edit-operations'
import {
  HEADER_BACKDROP,
  isHeroUnderHeader,
  resolveHeroLayout,
} from '@/lib/hero-layout'
import { buildDemoSite, demos } from '@/lib/demos'
import type { WebsiteSchema } from '@/lib/website-schema'

const UNDER_HEADER = 'mt-[calc(var(--site-header-h,6rem)*-1)]'

function dbajans(): WebsiteSchema {
  return JSON.parse(
    readFileSync(new URL('./__fixtures__/published-dbajans.json', import.meta.url), 'utf8'),
  )
}

type HeroPatch = {
  layout?: 'split' | 'light-cover' | 'full-bleed'
  align?: 'left' | 'center' | 'right'
  imageFit?: 'contain' | 'cover'
}

function withHero(site: WebsiteSchema, patch: HeroPatch): WebsiteSchema {
  const copy = structuredClone(site)
  const hero = copy.sections.find((s) => s.type === 'hero')
  if (!hero || hero.type !== 'hero') throw new Error('no hero')
  Object.assign(hero, patch)
  return copy
}

function render(site: WebsiteSchema): string {
  return renderToStaticMarkup(<WebsiteRenderer site={site} />)
}

function heroHtml(html: string): string {
  const start = html.indexOf('<section id="hero"')
  return html.slice(start, html.indexOf('</section>', start))
}

function headerHtml(html: string): string {
  const start = html.indexOf('<header')
  return html.slice(start, html.indexOf('</header>', start))
}

describe('light-cover image fit defaults', () => {
  it('fills the half unless the owner explicitly chose "contain"', () => {
    expect(resolveHeroLayout({ layout: 'light-cover' }).imageFit).toBe('cover')
    expect(resolveHeroLayout({ layout: 'light-cover', imageFit: 'cover' }).imageFit).toBe('cover')
    expect(resolveHeroLayout({ layout: 'light-cover', imageFit: 'contain' }).imageFit).toBe('contain')
  })

  it('switching to light-cover selects fill; an explicit choice or an existing light-cover is kept', () => {
    const site = dbajans()
    const hero = (s: WebsiteSchema) => {
      const h = s.sections.find((x) => x.type === 'hero')
      if (!h || h.type !== 'hero') throw new Error('no hero')
      return h
    }
    const switched = applyOperation(site, { op: 'updateHeroLayout', patch: { layout: 'light-cover' } })
    expect(hero(switched).imageFit).toBe('cover')

    const explicit = applyOperation(site, {
      op: 'updateHeroLayout',
      patch: { layout: 'light-cover', imageFit: 'contain' },
    })
    expect(hero(explicit).imageFit).toBe('contain')

    const existing = withHero(site, { layout: 'light-cover', imageFit: 'contain' })
    const realigned = applyOperation(existing, { op: 'updateHeroLayout', patch: { align: 'right' } })
    expect(hero(realigned).imageFit).toBe('contain')
    expect(hero(realigned).align).toBe('right')
  })
})

describe('light-cover render', () => {
  it('"cover" fills its half edge to edge with a cropped photo and no letterbox', () => {
    const html = heroHtml(render(withHero(dbajans(), { layout: 'light-cover' })))
    expect(html).toContain('object-cover')
    expect(html).not.toContain('object-contain')
    expect(html).toContain('data-hero-media')
    expect(html).not.toMatch(/background-color:\s*(#000|black|rgb\(0)/i)
  })

  it('an explicit "contain" keeps the fit but the letterbox is the themed hero ground, not black', () => {
    const html = heroHtml(render(withHero(dbajans(), { layout: 'light-cover', imageFit: 'contain' })))
    expect(html).toContain('object-contain')
    const media = html.slice(html.indexOf('data-hero-media') - 200, html.indexOf('data-hero-media'))
    expect(media).toContain('background-color:var(--site-card)')
  })

  it('mobile: the image is stacked on top at ~56vh, text below, nothing wider than the viewport', () => {
    const html = heroHtml(render(withHero(dbajans(), { layout: 'light-cover' })))
    expect(html).toContain('h-[56vh]')
    expect(html).toContain('md:h-auto')
    expect(html).not.toMatch(/\b(w|min-w)-\[\d+px\]/)
    // DOM order: media comes first on mobile for both alignments
    const mediaAt = html.indexOf('data-hero-media')
    expect(mediaAt).toBeGreaterThan(-1)
    expect(html.indexOf('<h1')).toBeGreaterThan(mediaAt)
  })

  it('alignment moves the image: left copy puts the image on the right, right copy on the left', () => {
    const left = heroHtml(render(withHero(dbajans(), { layout: 'light-cover', align: 'left' })))
    const right = heroHtml(render(withHero(dbajans(), { layout: 'light-cover', align: 'right' })))
    const mediaClass = (html: string) =>
      html.slice(html.lastIndexOf('class="', html.indexOf('data-hero-media')), html.indexOf('data-hero-media'))
    expect(mediaClass(left)).toContain('md:order-2')
    expect(mediaClass(right)).not.toContain('md:order-2')
  })
})

describe('header overlap', () => {
  it('an opening light-cover hero runs behind the header and the header backdrop firms up', () => {
    const html = render(withHero(dbajans(), { layout: 'light-cover' }))
    expect(heroHtml(html)).toContain(UNDER_HEADER)
    expect(heroHtml(html)).toContain('md:min-h-[calc(560px+var(--site-header-h,6rem))]')
    expect(headerHtml(html)).toContain(`${HEADER_BACKDROP.overHero}%`)
  })

  it('does nothing when the hero is not the first section, or for other styles', () => {
    const base = withHero(dbajans(), { layout: 'light-cover' })
    const hero = base.sections.findIndex((s) => s.type === 'hero')
    const about = base.sections.findIndex((s) => s.type === 'about')
    const swapped = structuredClone(base)
    ;[swapped.sections[hero], swapped.sections[about]] = [swapped.sections[about], swapped.sections[hero]]
    const swappedHtml = render(swapped)
    expect(swappedHtml).not.toContain(UNDER_HEADER)
    expect(headerHtml(swappedHtml)).toContain(`${HEADER_BACKDROP.standard}%`)

    for (const layout of ['split', 'full-bleed'] as const) {
      const html = render(withHero(dbajans(), { layout }))
      expect(html, layout).not.toContain(UNDER_HEADER)
      expect(headerHtml(html), layout).toContain(`${HEADER_BACKDROP.standard}%`)
    }
    expect(render(dbajans())).not.toContain(UNDER_HEADER)
  })

  it('isHeroUnderHeader: announcement above the header is skipped, one below it blocks the overlap', () => {
    const light = { type: 'hero', layout: 'light-cover' } as never
    const ann = { type: 'announcement' } as never
    const about = { type: 'about' } as never
    expect(isHeroUnderHeader([light, about])).toBe(true)
    expect(isHeroUnderHeader([ann, light, about])).toBe(true)
    expect(isHeroUnderHeader([ann, light], { announcementBelowHeader: true })).toBe(false)
    expect(isHeroUnderHeader([light], { detailPage: true })).toBe(false)
    expect(isHeroUnderHeader([about, light])).toBe(false)
    expect(isHeroUnderHeader([{ type: 'hero', layout: 'split' } as never])).toBe(false)
    expect(isHeroUnderHeader([{ type: 'hero' } as never])).toBe(false)
  })

  it('header text stays at >= 4.5:1 over the firmer backdrop even on a pure black or white photo (dark and light theme)', () => {
    const parse = (color: string): { rgb: number[]; alpha: number } => {
      const hex = /^#([0-9a-f]{6})$/i.exec(color)
      if (hex) return { rgb: [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)), alpha: 1 }
      const rgba = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/.exec(color)
      if (!rgba) throw new Error(`unsupported color: ${color}`)
      return { rgb: [+rgba[1], +rgba[2], +rgba[3]], alpha: rgba[4] === undefined ? 1 : +rgba[4] }
    }
    const lum = (rgb: number[]) => {
      const c = (v: number) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * c(rgb[0]) + 0.7152 * c(rgb[1]) + 0.0722 * c(rgb[2])
    }
    const contrast = (l1: number, l2: number) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
    const a = HEADER_BACKDROP.overHero / 100
    for (const mode of ['dark', 'light'] as const) {
      const site = withHero(dbajans(), { layout: 'light-cover' })
      site.theme = { ...site.theme, mode } as WebsiteSchema['theme']
      const theme = resolveTheme(site)
      const bg = parse(theme.background).rgb
      for (const pixel of [0, 255]) {
        const backdrop = bg.map((v) => v * a + pixel * (1 - a))
        for (const text of [theme.foreground, theme.mutedForeground]) {
          const t = parse(text)
          const ink = t.rgb.map((v, i) => v * t.alpha + backdrop[i] * (1 - t.alpha))
          const ratio = contrast(lum(ink), lum(backdrop))
          expect(ratio, `${mode} ${text} over ${pixel}`).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })
})

describe('other styles and demos', () => {
  it('split and full-bleed hero HTML does not depend on the light-cover work', () => {
    for (const layout of ['split', 'full-bleed'] as const) {
      const html = heroHtml(render(withHero(dbajans(), { layout })))
      expect(html, layout).not.toContain('data-hero-media')
      expect(html, layout).not.toContain('h-[56vh]')
    }
  })

  it('the kahve demo (light-cover) fills its half and sits under the header', () => {
    const kahve = demos.find((d) => d.slug === 'kahve')
    if (!kahve) throw new Error('no kahve demo')
    const html = render(buildDemoSite(kahve, 'tr'))
    expect(heroHtml(html)).toContain('object-cover')
    expect(heroHtml(html)).toContain('data-hero-media')
  })
})
