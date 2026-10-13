import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  DEMO_BANNER_HEIGHT_PX,
  demoHomeHref,
  demoStickyOffsetVars,
  navigationForDemoSubpage,
} from '@/lib/demo-chrome'
import { getDemo, buildDemoSite } from '@/lib/demos'
import { DemoChrome } from '@/components/demo-site/demo-chrome'

const render = (slug: string) =>
  renderToStaticMarkup(
    createElement(DemoChrome, { slug, lang: 'tr', children: createElement('p', null, 'SUBPAGE-CONTENT') }),
  )

describe('demo banner offset (single source)', () => {
  it('publishes the banner height as the header sticky offset, only while the banner shows', () => {
    expect(demoStickyOffsetVars(true)).toEqual({ '--site-sticky-offset': `${DEMO_BANNER_HEIGHT_PX}px` })
    expect(demoStickyOffsetVars(false)).toEqual({})
  })
})

describe('navigationForDemoSubpage', () => {
  it('re-points only in-page anchors at the demo home and keeps demo routes and the CTA', () => {
    const site = buildDemoSite(getDemo('eticaret')!, 'tr')
    const nav = navigationForDemoSubpage(site.navigation, 'eticaret', 'tr')
    expect(nav.links).toHaveLength(site.navigation.links.length)
    for (const [i, link] of nav.links.entries()) {
      const original = site.navigation.links[i]
      expect(link.label).toBe(original.label)
      if (original.href.startsWith('#')) expect(link.href).toBe(demoHomeHref('eticaret', 'tr'))
      else expect(link.href).toBe(original.href)
    }
    expect(nav.cta).toEqual(site.navigation.cta)
  })
})

describe('DemoChrome (sub-page shell)', () => {
  const html = render('eticaret')

  it('renders the real site header and footer instead of the old demo chrome', () => {
    expect(html).toContain('<header')
    expect(html).toContain('<footer')
    expect(html).toContain('data-website-root')
    expect(html).toContain('top-[var(--site-sticky-offset,0px)]')
    expect(html).not.toContain('top-[45px]')
    expect(html).toContain('SUBPAGE-CONTENT')
    expect(html).toContain(`href="${demoHomeHref('eticaret', 'tr')}"`)
  })

  it('sticks the header below the banner using one shared height', () => {
    expect(html).toContain('data-demo-banner')
    expect(html).toContain(`height:${DEMO_BANNER_HEIGHT_PX}px`)
    expect(html).toContain(`--site-sticky-offset:${DEMO_BANNER_HEIGHT_PX}px`)
  })

  it('keeps the fake demo account/cart wiring on demo routes for a commerce demo', () => {
    expect(html).toContain('/demo/eticaret/hesap')
  })

  it('does not add commerce controls to a non-commerce demo', () => {
    const plain = render('kahve')
    expect(plain).toContain('<header')
    expect(plain).toContain('data-demo-banner')
  })
})

describe('demo shell stays isolated from the real store', () => {
  const dir = path.join(process.cwd(), 'components/demo-site')
  const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f))

  it.each(files)('%s has no dependency on real store/order routes', (file) => {
    const src = readFileSync(path.join(dir, file), 'utf8')
    expect(src).not.toMatch(/\/api\/store|store-actions|lib\/orders|\/site\/\$\{|tenantUrl/)
  })
})
