import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { fallbackWebsite, type WebsiteSchema } from '@/lib/website-schema'
import {
  collectServiceRedirects,
  findPublicService,
  resolveServices,
  seedServicesDetail,
  serviceDetailHint,
  servicePath,
  syncServicesPage,
} from '@/lib/service-pages'
import { stripSampleContent } from '@/lib/sample-content'
import { pageLimitForPlan } from '@/lib/page-limits'
import { buildBreadcrumbTrailJsonLd, buildServiceJsonLd } from '@/lib/seo/breadcrumb-jsonld'
import {
  applyServiceText,
  fillServiceImages,
  itemsNeedingText,
  runServiceDetailBackground,
  serviceDetailDailyCapReached,
  type ServiceBackgroundDeps,
} from '@/lib/service-detail-background'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'

type Services = Extract<WebsiteSchema['sections'][number], { type: 'services' }>

function siteWith(items: Services['items'], detail?: Services['detail']): WebsiteSchema {
  const base = fallbackWebsite('kahve atölyesi', 'tr')
  const rest = base.sections.filter((s) => s.type !== 'services')
  const at = Math.max(0, rest.findIndex((s) => s.type === 'footer'))
  const section: Services = { type: 'services', title: 'Hizmetlerimiz', items, ...(detail ? { detail } : {}) }
  return { ...base, sections: [...rest.slice(0, at), section, ...rest.slice(at)], pages: undefined } as unknown as WebsiteSchema
}

const ITEMS: Services['items'] = [
  { title: 'Kahve eğitimi', description: 'Demleme atölyesi.' },
  { title: 'Kurumsal ikram', description: 'Ofis kahve servisi.' },
]
const ON = { pageEnabled: true, linkEnabled: true }

describe('page limit rule: the list is a normal page, service pages are content sub-pages', () => {
  it('list page counts toward the limit; item pages never add pages', () => {
    const synced = syncServicesPage(siteWith(ITEMS, ON), 5)
    expect(synced.pages?.filter((p) => p.detailOf === 'services')).toHaveLength(1)
    expect(synced.pages).toHaveLength(2) // home + list, regardless of item count
    const many = siteWith(Array.from({ length: 8 }, (_, i) => ({ title: `Hizmet ${i}`, description: 'x' })), ON)
    expect(syncServicesPage(many, 5).pages).toHaveLength(2)
  })

  it('a site already at its plan limit does not get a list page (cards stay, no 404 links)', () => {
    const site = siteWith(ITEMS, ON)
    const limit = pageLimitForPlan('free')
    const full = {
      ...site,
      pages: Array.from({ length: limit }, (_, i) => ({ slug: i === 0 ? 'home' : `s${i}`, title: `S${i}`, ...(i === 0 ? { isHome: true } : {}) })),
    } as WebsiteSchema
    const out = syncServicesPage(full, limit)
    expect(out.pages).toHaveLength(limit)
    expect(resolveServices(out)?.pageActive).toBe(false)
    expect(resolveServices(out)?.link).toBeNull()
  })
})

describe('legacy sites: pages exist only after the owner opts in', () => {
  it('no detail -> no resolved pages, no sync, no redirects, hint only when published', () => {
    const legacy = siteWith(ITEMS)
    expect(resolveServices(legacy)).toBeNull()
    expect(syncServicesPage(legacy)).toBe(legacy)
    expect(findPublicService(legacy, 'hizmetlerimiz', 'kahve-egitimi')).toBeNull()
    expect(collectServiceRedirects(legacy, legacy)).toEqual([])
    expect(serviceDetailHint(legacy, true)).toBe('published')
    expect(serviceDetailHint(legacy, false)).toBe('none')
    expect(serviceDetailHint({ ...legacy, dismissedHints: ['serviceDetail'] }, true)).toBe('none')
  })

  it('opting in creates the pages; seeding is for fresh sites only', () => {
    const optedIn = syncServicesPage(seedServicesDetail(siteWith(ITEMS)))
    expect(resolveServices(optedIn)?.pageActive).toBe(true)
    expect(serviceDetailHint(optedIn, true)).toBe('none')
  })
})

describe('approval gate: unapproved platform text never reaches the public site', () => {
  const written = siteWith(
    [
      { ...ITEMS[0], detail: [{ heading: 'Eğitim', body: 'Platform yazdı.' }], sample: true },
      { ...ITEMS[1], detail: [{ heading: 'İkram', body: 'Sahibi yazdı.' }] },
    ],
    ON,
  )
  const synced = syncServicesPage(written)
  const list = resolveServices(synced)!.listSlug

  it('open in the editor/demo, closed once published', () => {
    expect(findPublicService(synced, list, 'kahve-egitimi')?.entry.sample).toBe(true)
    const published = stripSampleContent(synced)
    expect(findPublicService(published, list, 'kahve-egitimi')).toBeNull()
    expect(findPublicService(published, list, 'kurumsal-ikram')).not.toBeNull()
    const html = renderToStaticMarkup(<WebsiteRenderer site={published} pageRouting initialPage={list} />)
    expect(html).not.toContain('Platform yazdı.')
    expect(html).not.toContain(`/${list}/kahve-egitimi`)
    expect(html).toContain(`/${list}/kurumsal-ikram`)
  })
})

describe('JSON-LD', () => {
  it('BreadcrumbList has Home > list > service with absolute URLs', () => {
    const json = JSON.parse(
      buildBreadcrumbTrailJsonLd({
        origin: 'https://x.gloval.site/',
        trail: [
          { name: 'X', path: '' },
          { name: 'Hizmetler', path: '/hizmetlerimiz' },
          { name: 'Kahve', path: servicePath('hizmetlerimiz', 'kahve') },
        ],
      }),
    )
    expect(json['@type']).toBe('BreadcrumbList')
    expect(json.itemListElement.map((e: { item: string }) => e.item)).toEqual([
      'https://x.gloval.site',
      'https://x.gloval.site/hizmetlerimiz',
      'https://x.gloval.site/hizmetlerimiz/kahve',
    ])
  })

  it('Service only carries real data: no price/offer/rating, none without a description', () => {
    const raw = buildServiceJsonLd({
      origin: 'https://x.gloval.site',
      url: 'https://x.gloval.site/hizmetlerimiz/kahve',
      name: 'Kahve eğitimi',
      description: 'Demleme atölyesi.',
      imageSrc: '/a.webp',
      providerName: 'X',
    })!
    const json = JSON.parse(raw)
    expect(json['@type']).toBe('Service')
    expect(Object.keys(json).sort()).toEqual(['@context', '@type', 'description', 'image', 'name', 'provider', 'url'])
    expect(json.image).toBe('https://x.gloval.site/a.webp')
    expect(raw).not.toMatch(/offers|price|aggregateRating|areaServed/)
    expect(
      buildServiceJsonLd({ origin: 'https://x', url: 'https://x/a', name: 'A', description: '  ', providerName: 'X' }),
    ).toBeNull()
  })

  it('escapes < so a service name cannot close the script tag', () => {
    const raw = buildServiceJsonLd({
      origin: 'https://x',
      url: 'https://x/a',
      name: '</script><b>',
      description: 'd',
      providerName: 'X',
    })!
    expect(raw).not.toContain('</script>')
  })
})

describe('background text step', () => {
  const base = siteWith(ITEMS, ON)
  const blocks = [{ heading: 'H', body: 'Gerçek açıklama.' }]

  it('only fills items without text, flags them as unapproved, never touches owner text', () => {
    const withOwner = siteWith([{ ...ITEMS[0], detail: [{ heading: 'Sahibi', body: 'Benim metnim.' }] }, ITEMS[1]], ON)
    expect(itemsNeedingText(withOwner)).toEqual([1])
    const written = new Map([
      [0, { title: ITEMS[0].title, blocks }],
      [1, { title: ITEMS[1].title, blocks }],
    ])
    const out = applyServiceText(withOwner, written)
    expect(out.applied).toBe(1)
    const items = (out.site.sections.find((s) => s.type === 'services') as Services).items
    expect(items[0].detail?.[0].body).toBe('Benim metnim.')
    expect(items[1].sample).toBe(true)
    expect(applyServiceText(out.site, written).applied).toBe(0)
  })

  it('skips an item the owner renamed while the model was writing', () => {
    const renamed = siteWith([{ ...ITEMS[0], title: 'Yeni ad' }, ITEMS[1]], ON)
    expect(applyServiceText(renamed, new Map([[0, { title: ITEMS[0].title, blocks }]])).applied).toBe(0)
  })

  it('fills pictures only from images the site already owns, once each', () => {
    expect(fillServiceImages(base).site).toBeDefined()
    const again = fillServiceImages(fillServiceImages(base).site)
    expect(again.filled).toBe(0)
  })

  function deps(overrides: Partial<ServiceBackgroundDeps> = {}) {
    let draft = { site: base, version: 'v1' }
    const calls = { write: 0, save: 0 }
    const d: ServiceBackgroundDeps = {
      load: async () => draft,
      save: async (site, version) => {
        calls.save += 1
        if (version !== draft.version) return false
        draft = { site, version: `v${calls.save + 1}` }
        return true
      },
      write: async () => {
        calls.write += 1
        return { written: true, blocks }
      },
      sitesLast24h: async () => 1,
      ...overrides,
    } as ServiceBackgroundDeps
    return { d, calls, get: () => draft }
  }

  it('is idempotent: a second run writes nothing', async () => {
    const { d, calls } = deps()
    const first = await runServiceDetailBackground(d)
    expect(first.status).toBe('done')
    const writesAfterFirst = calls.write
    const second = await runServiceDetailBackground(d)
    expect(second.status).toBe('skipped')
    expect(calls.write).toBe(writesAfterFirst)
  })

  it('daily cap stops model calls but never throws', async () => {
    expect(serviceDetailDailyCapReached(1)).toBe(false)
    const { d, calls } = deps({ sitesLast24h: async () => 999 })
    const result = await runServiceDetailBackground(d)
    expect(calls.write).toBe(0)
    expect(['skipped', 'done']).toContain(result.status)
  })

  it('a failing model or database is reported, not thrown', async () => {
    const { d } = deps({ write: async () => { throw new Error('boom') } })
    expect((await runServiceDetailBackground(d)).status).toBe('failed')
    const none = deps({ load: async () => null })
    expect(await runServiceDetailBackground(none.d)).toEqual({ status: 'failed', reason: 'load' })
  })
})
