import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import { ReferencesFields, REFERENCES_COPY } from '@/components/editor/references-fields'
import { buildDemoSite, demos } from '@/lib/demos'
import { demoReferenceItems } from '@/lib/demo-references'
import { LIST_LIMITS } from '@/lib/list-limits'
import {
  REFERENCES_PAGE_INITIAL,
  resolveReferences,
  stripAiReferences,
  syncReferencesPage,
  findReferencesPage,
  type ReferenceItem,
} from '@/lib/references'
import { fallbackWebsite } from '@/lib/website-schema'
import type { WebsiteSchema } from '@/lib/website-schema'

type RefSection = Extract<WebsiteSchema['sections'][number], { type: 'references' }>

const REAL_BRANDS = /google|trendyol|hepsiburada|starbucks|instagram|yandex|apple|amazon|nike|zara|migros|booking|microsoft|meta|netflix|adidas|samsung|turkcell|vodafone/i

const logoItems = (n: number): ReferenceItem[] =>
  Array.from({ length: n }, (_, i) => ({
    name: `Firma ${i + 1}`,
    logo: { src: 'data:image/png;base64,iVBORw0KGgo=' },
  })) as ReferenceItem[]

function siteWith(items: ReferenceItem[], patch: Partial<RefSection> = {}): WebsiteSchema {
  const base = fallbackWebsite('kurumsal firma', 'tr')
  base.sections = [
    ...base.sections.filter((s) => s.type !== 'references'),
    { type: 'references', title: 'Referanslar', items, pageEnabled: false, linkEnabled: true, ...patch } as RefSection,
  ]
  return base
}

const renderPage = (site: WebsiteSchema) =>
  renderToStaticMarkup(<WebsiteRenderer site={site} pageRouting initialPage="referanslar" />)

describe('(a) /referanslar shows the first 10 logos and folds the rest', () => {
  const site = syncReferencesPage(siteWith(logoItems(20), { pageEnabled: true }))
  const html = renderPage(site)
  const lis = [...html.matchAll(/<li[^>]*>/g)].map((m) => m[0]).filter((t) => t.includes('flex-col'))

  it('renders every item but hides those after REFERENCES_PAGE_INITIAL', () => {
    expect(REFERENCES_PAGE_INITIAL).toBe(10)
    expect(lis).toHaveLength(20)
    expect(lis.filter((t) => /\shidden(=|\s|>)/.test(t))).toHaveLength(10)
    expect(lis.slice(0, 10).some((t) => /\shidden(=|\s|>)/.test(t))).toBe(false)
  })

  it('has a collapsed "Devamını göster" button; none with 10 or fewer', () => {
    expect(html).toContain('data-references-more')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('Devamını göster (10)')
    const small = renderPage(syncReferencesPage(siteWith(logoItems(10), { pageEnabled: true })))
    expect(small).not.toContain('data-references-more')
  })
})

describe('(b) at most 20 logos with an N / 20 counter', () => {
  const render = (n: number) =>
    renderToStaticMarkup(
      <ReferencesFields
        site={siteWith(logoItems(n))}
        index={siteWith(logoItems(n)).sections.length - 1}
        section={siteWith(logoItems(n)).sections.at(-1) as RefSection}
        onDispatch={() => {}}
      />,
    )

  it('caps the list at 20', () => expect(LIST_LIMITS.references.max).toBe(20))

  it('shows the counter and keeps upload enabled below the cap', () => {
    const html = render(7)
    expect(html).toContain('7 / 20')
    expect(html).not.toContain('references-limit-note')
  })

  it('disables upload at 20 and says why', () => {
    const html = render(20)
    expect(html).toContain('20 / 20')
    expect(html).toContain('references-limit-note')
    expect(html).toContain(REFERENCES_COPY.tr.limitReached)
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[^<]*(<[^>]+>[^<]*)*Logo yükle/)
  })
})

describe('(c) editor guidance', () => {
  const section = siteWith(logoItems(0)).sections.at(-1) as RefSection
  const html = renderToStaticMarkup(
    <ReferencesFields site={siteWith([])} index={0} section={section} onDispatch={() => {}} />,
  )
  const unnamed = siteWith(logoItems(1).map((item) => ({ ...item, name: '' })))
  const withItem = renderToStaticMarkup(
    <ReferencesFields site={unnamed} index={0} section={unnamed.sections.at(-1) as RefSection} onDispatch={() => {}} />,
  )

  it('shows the brand-permission warning band', () => {
    expect(html).toContain('data-testid="references-warning"')
    expect(html).toContain('logosunu kullanma iznine sahip')
  })

  it('shows the upload hint', () => {
    expect(html).toContain('Önerilen: şeffaf arka planlı PNG veya WebP, yatay 600×300 px, en çok 2 MB')
  })

  it('uses a real placeholder attribute (clears on focus), never a prefilled value', () => {
    const input = /<input[^>]*placeholder="İsim \(isteğe bağlı\)"[^>]*>/.exec(withItem)?.[0] ?? ''
    expect(input).not.toBe('')
    expect(input).not.toMatch(/value="[^"]+"/)
  })
})

describe('(d) switches and the /referanslar page', () => {
  const html = renderToStaticMarkup(
    <ReferencesFields
      site={siteWith([])}
      index={0}
      section={siteWith([]).sections.at(-1) as RefSection}
      onDispatch={() => {}}
    />,
  )

  it('has both switches', () => {
    expect(html).toContain('Ana sayfada göster')
    expect(html).toContain('Referanslar sayfası oluştur')
  })

  it('creates the page only when the switch is on AND at least one logo exists', () => {
    expect(findReferencesPage(syncReferencesPage(siteWith(logoItems(2), { pageEnabled: false })))).toBeNull()
    expect(findReferencesPage(syncReferencesPage(siteWith([], { pageEnabled: true })))).toBeNull()
    const on = syncReferencesPage(siteWith(logoItems(2), { pageEnabled: true }))
    expect(findReferencesPage(on)).toMatchObject({ slug: 'referanslar', kind: 'detail', detailOf: 'references' })
    expect(resolveReferences(on).active).toBe(true)
  })

  it('drops the page again when the switch goes off or the last logo is removed', () => {
    const on = syncReferencesPage(siteWith(logoItems(2), { pageEnabled: true }))
    const off = syncReferencesPage({ ...on, sections: siteWith(logoItems(2), { pageEnabled: false }).sections })
    expect(findReferencesPage(off)).toBeNull()
    const emptied = syncReferencesPage({ ...on, sections: siteWith([], { pageEnabled: true }).sections })
    expect(findReferencesPage(emptied)).toBeNull()
  })

  it('is not active (so the route 404s) without the page, the switch or a logo', () => {
    expect(resolveReferences(siteWith(logoItems(2), { pageEnabled: true })).active).toBe(false)
    expect(resolveReferences(siteWith([], { pageEnabled: true })).active).toBe(false)
    expect(renderPage(siteWith(logoItems(2), { pageEnabled: false }))).not.toContain('references-detail')
  })
})

describe('(e) empty section is invisible and never auto-added', () => {
  it('renders nothing on the public site for an empty section', () => {
    const html = renderToStaticMarkup(<WebsiteRenderer site={siteWith([])} />)
    expect(html).not.toContain('id="references"')
  })

  it('renders the section once a logo exists', () => {
    const html = renderToStaticMarkup(<WebsiteRenderer site={siteWith(logoItems(3))} />)
    expect(html).toContain('id="references"')
  })

  it('is not part of a fresh site', () => {
    expect(fallbackWebsite('kurumsal firma', 'tr').sections.some((s) => s.type === 'references')).toBe(false)
  })

  it('AI output cannot add clients: its references section is emptied', () => {
    const fromAi = siteWith(logoItems(5))
    const stripped = stripAiReferences(fromAi, { sections: [] })
    const section = stripped.sections.find((s) => s.type === 'references') as RefSection | undefined
    expect(section?.items ?? []).toHaveLength(0)
  })
})

describe('(f) demo logos are fictional and labelled', () => {
  const built = demos.map((d) => ({ slug: d.slug, site: buildDemoSite(d, 'tr') }))

  it('uses invented names that do not resemble real brands, all flagged sample', () => {
    for (const { slug } of built) {
      const items = demoReferenceItems(slug)
      expect(items.length).toBeGreaterThan(REFERENCES_PAGE_INITIAL)
      for (const item of items) {
        expect(item.sample).toBe(true)
        expect(item.name).not.toMatch(REAL_BRANDS)
        expect(item.logo?.src ?? '').not.toMatch(REAL_BRANDS)
      }
    }
  })

  it('shows the "Örnek içerik" tag on the demo references page', () => {
    for (const { site } of built) {
      if (!findReferencesPage(site)) continue
      const html = renderToStaticMarkup(
        <WebsiteRenderer
          site={site}
          initialPage="referanslar"
          demoRoutes={{
            home: '/demo/x?lang=tr',
            about: '/demo/x/hakkimizda?lang=tr',
            aboutPageSlug: null,
            references: { slug: 'referanslar', list: '/demo/x/referanslar?lang=tr' },
          }}
        />,
      )
      expect(html).toContain('Örnek içerik')
    }
  })

  it('records which demos gained the strip, page and menu link', () => {
    const changed = built
      .filter(({ site }) => site.sections.some((s) => s.type === 'references'))
      .map(({ slug, site }) => ({
        slug,
        page: !!findReferencesPage(site),
        menu: site.navigation.links.some((l) => l.href.includes('referanslar')),
      }))
    const unchanged = built.map((b) => b.slug).filter((s) => !changed.some((c) => c.slug === s))
    console.log('[demo references] changed:', JSON.stringify(changed), 'unchanged:', unchanged)
    expect(changed.every((c) => c.page)).toBe(true)
    expect(changed.length + unchanged.length).toBe(demos.length)
  })
})
