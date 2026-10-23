import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import { buildDemoSite, demos } from '@/lib/demos'
import type { WebsiteSchema } from '@/lib/website-schema'

/**
 * Sites that are live (dbajans, mimarlik-studyosu, luna-mucevher) and every
 * showcase demo carry no hero layout fields, so the layout feature must leave
 * their public HTML byte-identical. The fixtures are the stored schemas of the
 * live sites; the snapshots were generated on `main` before the hero layout
 * work landed, so a failing line here means the default hero changed.
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

describe('live sites keep the exact same HTML (default hero style)', () => {
  for (const slug of LIVE_SITES) {
    it(`${slug}: every page`, async () => {
      const site = loadFixture(slug)
      const lines = ['home', ...site.pages.filter((p) => !p.isHome).map((p) => p.slug)].map((page) => {
        const html = renderToStaticMarkup(
          <WebsiteRenderer site={site} pageRouting initialPage={page === 'home' ? null : page} />,
        )
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
