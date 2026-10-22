import { afterEach, describe, expect, it, vi } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import * as path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import { buildDemoSite, demos } from '@/lib/demos'

afterEach(() => vi.unstubAllEnvs())

function renderAllDemos(): string[] {
  const out: string[] = []
  for (const demo of demos) {
    for (const lang of ['tr', 'en'] as const) {
      const q = lang === 'en' ? '?lang=en' : ''
      out.push(
        renderToStaticMarkup(
          <WebsiteRenderer
            site={buildDemoSite(demo, lang)}
            demoRoutes={{ home: `/demo/${demo.slug}${q}`, about: `/demo/${demo.slug}/hakkimizda${q}`, aboutPageSlug: null }}
          />,
        ),
      )
    }
  }
  return out
}

describe('CATALOG_FEATURE_UI does not change public HTML', () => {
  it('demo and store-style sites render byte-identical with the flag unset, false and true', () => {
    vi.stubEnv('CATALOG_FEATURE_UI', '')
    const unset = renderAllDemos()
    vi.stubEnv('CATALOG_FEATURE_UI', 'false')
    const off = renderAllDemos()
    vi.stubEnv('CATALOG_FEATURE_UI', 'true')
    const on = renderAllDemos()

    expect(unset).toHaveLength(demos.length * 2)
    expect(off).toEqual(unset)
    expect(on).toEqual(unset)
    expect(unset.every((html) => html.length > 0)).toBe(true)
  })

  it('no public renderer, route, sitemap or catalog loader references the flag', () => {
    const root = path.resolve(__dirname, '..')
    const dirs = [
      'app/site',
      'app/demo',
      'components/website-renderer',
      'components/store',
      'components/catalog',
      'components/site',
    ]
    const files = ['lib/catalog-public.ts', 'lib/catalog-public-server.ts', 'lib/commerce-mode.ts', 'lib/commerce-mode-server.ts', 'middleware.ts']

    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const full = path.join(dir, name)
        return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [full] : []
      })

    const sources = [...dirs.flatMap((d) => walk(path.join(root, d))), ...files.map((f) => path.join(root, f))]
    expect(sources.length).toBeGreaterThan(20)
    for (const file of sources) {
      const text = readFileSync(file, 'utf8')
      expect(text, file).not.toMatch(/CATALOG_FEATURE_UI|catalog-feature-flag/)
    }
  })
})
