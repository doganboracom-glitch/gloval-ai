import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import { buildPreviewCatalog, StoreCatalogProvider } from '@/components/website-renderer/store-catalog-context'
import { buildDemoSite, demos } from '@/lib/demos'
import type { WebsiteSchema } from '@/lib/website-schema'

/**
 * Full-render fixtures guard the default hero and published link targets. Luna
 * receives a display-only catalog context so its product cards resolve to the
 * live store routes rather than the stale `/products/...` schema hrefs.
 */

const LIVE_SITES = ['dbajans', 'mimarlik-studyosu', 'luna-mucevher'] as const

function loadFixture(slug: string): WebsiteSchema {
  return JSON.parse(readFileSync(new URL(`./__fixtures__/published-${slug}.json`, import.meta.url), 'utf8'))
}

function fingerprint(html: string): string {
  return `${createHash('sha256').update(html).digest('hex')}  ${Buffer.byteLength(html)} bytes`
}

/** Hero layout fields are the only thing a demo is allowed to differ by. */
function withoutLayoutFields(site: WebsiteSchema): WebsiteSchema {
  const copy = structuredClone(site)
  // The demo example-logo strip is a later feature; the snapshots predate it.
  copy.sections = copy.sections.filter((s) => s.type !== 'references')
  copy.pages = (copy.pages ?? []).filter((p) => p.slug !== 'referanslar')
  copy.navigation.links = copy.navigation.links.filter((l) => !l.href.includes('referanslar'))
  // The demo-only "Slider Altı Kutu" strip is covered by hero-strip.test.tsx; the goldens predate it.
  copy.sections = copy.sections.filter((s) => s.type !== 'heroStrip')
  // The demo-only example "Kadromuz" block (dental, law and beauty demos) is covered by demo-team.test.tsx.
  if (copy.sections.some((s) => s.type === 'team' && s.members.some((m) => m.sample))) {
    copy.sections = copy.sections.filter((s) => s.type !== 'team')
    copy.pages = (copy.pages ?? []).filter((p) => p.slug !== 'kadromuz')
    copy.navigation.links = copy.navigation.links.filter((l) => !l.href.includes('kadromuz'))
  }
  for (const section of copy.sections) {
    if (section.type !== 'hero') continue
    const hero = section as Record<string, unknown>
    delete hero.layout
    delete hero.align
    delete hero.overlay
    delete hero.imageFit
  }
  return copy
}

describe('live sites preserve default hero styling while validating link targets', () => {
  for (const slug of LIVE_SITES) {
    it(`${slug}: every page`, async () => {
      const site = loadFixture(slug)
      const lines = ['home', ...site.pages.filter((p) => !p.isHome).map((p) => p.slug)].map((page) => {
        const renderer = <WebsiteRenderer site={site} pageRouting initialPage={page === 'home' ? null : page} />
        const html =
          slug === 'luna-mucevher'
            ? renderToStaticMarkup(
                <StoreCatalogProvider catalog={buildPreviewCatalog(site, slug)}>{renderer}</StoreCatalogProvider>,
              )
            : renderToStaticMarkup(renderer)

        if (slug === 'luna-mucevher' && page === 'home') {
          const firstProduct = site.sections.find((section) => section.type === 'products')
          expect(firstProduct?.type).toBe('products')
          expect(html).toContain('href="/site/luna-mucevher/store/14k-altin-tektas-yuzuk"')
          expect(html).not.toContain('href="/products/altin-tektaş-14k"')
        }

        return `${page}: ${fingerprint(html)}`
      })
      await expect(lines.join('\n') + '\n').toMatchFileSnapshot(`./__snapshots__/live-site-${slug}.txt`)
    })
  }
})

describe('showcase demos keep the exact same HTML apart from the hero layout fields', () => {
  for (const demo of demos) {
    it(`${demo.slug} (tr)`, async () => {
      const site = withoutLayoutFields(buildDemoSite(demo, 'tr'))
      const html = renderToStaticMarkup(<WebsiteRenderer site={site} />)
      await expect(fingerprint(html) + '\n').toMatchFileSnapshot(`./__snapshots__/demo-${demo.slug}-tr.txt`)
    })
  }
})
