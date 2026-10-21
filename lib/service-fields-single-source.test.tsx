import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fallbackWebsite, websiteSchema, type WebsiteSchema } from '@/lib/website-schema'
import { applyOperation } from '@/lib/website-edit-operations'
import { SERVICE_ITEM_LIMITS, SERVICE_LIST_LIMITS } from '@/lib/service-item-limits'
import { findPublicService, resolveServices, syncServicesPage } from '@/lib/service-pages'
import { stripSampleContent } from '@/lib/sample-content'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

type Services = Extract<WebsiteSchema['sections'][number], { type: 'services' }>

function siteWith(items: Services['items']): { site: WebsiteSchema; index: number } {
  const base = fallbackWebsite('kahve atölyesi', 'tr')
  const rest = base.sections.filter((s) => s.type !== 'services')
  const at = Math.max(0, rest.findIndex((s) => s.type === 'footer'))
  const section: Services = {
    type: 'services',
    title: 'Hizmetlerimiz',
    items,
    detail: { pageEnabled: true, linkEnabled: true },
  }
  const sections = [...rest.slice(0, at), section, ...rest.slice(at)]
  const site = { ...base, sections, pages: undefined } as unknown as WebsiteSchema
  return { site: syncServicesPage(site), index: at }
}

const ITEMS: Services['items'] = [
  { title: 'Kahve eğitimi', description: 'Demleme atölyesi.' },
  { title: 'Kurumsal ikram', description: 'Ofis kahve servisi.' },
]

const servicesOf = (site: WebsiteSchema, index: number) => site.sections[index] as Services

describe('service item fields: one definition of the limits', () => {
  it('no consumer re-declares the numbers; they all import service-item-limits', () => {
    const consumers = [
      'lib/website-schema.ts',
      'lib/service-pages.ts',
      'lib/website-edit-operations.ts',
      'lib/service-detail-background.ts',
      'components/editor/service-detail-fields.tsx',
    ]
    for (const file of consumers) {
      expect(read(file), file).toMatch(/service-item-limits/)
    }
    const ops = read('lib/website-edit-operations.ts')
    const serviceCases = ops.slice(ops.indexOf("case 'updateServicesDetail'"), ops.indexOf("case 'dismissHint'"))
    expect(serviceCases).not.toMatch(/slice\(0, \d+\)/)
  })

  it('schema, edit operations and the shared constants agree on the same numbers', () => {
    const { site, index } = siteWith(ITEMS)
    const long = (n: number) => 'a'.repeat(n + 50)
    const out = applyOperation(site, {
      op: 'updateServiceItem',
      index,
      item: 0,
      patch: {
        alt: long(SERVICE_ITEM_LIMITS.alt),
        seoTitle: long(SERVICE_ITEM_LIMITS.seoTitle),
        seoDescription: long(SERVICE_ITEM_LIMITS.seoDescription),
      },
    } as never)
    const item = servicesOf(out, index).items[0]
    expect(item.alt).toHaveLength(SERVICE_ITEM_LIMITS.alt)
    expect(item.seoTitle).toHaveLength(SERVICE_ITEM_LIMITS.seoTitle)
    expect(item.seoDescription).toHaveLength(SERVICE_ITEM_LIMITS.seoDescription)
    // What the operation lets through must also pass the schema.
    expect(websiteSchema.safeParse(out).success).toBe(true)

    const listed = applyOperation(site, {
      op: 'updateServicesDetail',
      index,
      patch: { heading: long(SERVICE_LIST_LIMITS.heading), ctaText: long(SERVICE_LIST_LIMITS.ctaText) },
    } as never)
    const detail = servicesOf(listed, index).detail!
    expect(detail.heading).toHaveLength(SERVICE_LIST_LIMITS.heading)
    expect(detail.ctaText).toHaveLength(SERVICE_LIST_LIMITS.ctaText)
    expect(websiteSchema.safeParse(listed).success).toBe(true)
  })

  it('the schema rejects what the shared limits forbid', () => {
    const { site, index } = siteWith(ITEMS)
    const bad = structuredClone(site)
    ;(bad.sections[index] as Services).items[0].seoTitle = 'x'.repeat(SERVICE_ITEM_LIMITS.seoTitle + 1)
    expect(websiteSchema.safeParse(bad).success).toBe(false)
  })
})

describe('editor panel compatibility with the new page structure', () => {
  it('undo/redo: operations are pure, so a snapshot restores the exact earlier site', () => {
    const { site, index } = siteWith(ITEMS)
    const before = structuredClone(site)
    const after = applyOperation(site, {
      op: 'updateServiceItem',
      index,
      item: 0,
      patch: { slug: 'yeni-adres', alt: 'Demleme', pageEnabled: false },
    } as never)
    expect(site).toEqual(before)
    expect(servicesOf(after, index).items[0].slug).toBe('yeni-adres')
    // undo = reuse the snapshot, redo = reuse the result; both stay valid and equal
    expect(servicesOf(site, index).items[0].slug).toBe('kahve-egitimi')
    expect(websiteSchema.safeParse(after).success).toBe(true)
    const redone = applyOperation(site, {
      op: 'updateServiceItem',
      index,
      item: 0,
      patch: { slug: 'yeni-adres', alt: 'Demleme', pageEnabled: false },
    } as never)
    expect(redone).toEqual(after)
  })

  it('the fields component edits through the parent onChange, so history and autosave still see every change', () => {
    const src = read('components/editor/service-detail-fields.tsx')
    expect(src).toMatch(/updateServiceItem/)
    expect(src).toMatch(/updateServicesDetail/)
    expect(src).not.toMatch(/useReducer|createStore|localStorage/)
  })

  it('credits: only a written result is charged, never the thin-facts or empty case', () => {
    const route = read('app/api/service-detail/route.ts')
    const noWrite = route.indexOf('!result.written')
    const charge = route.indexOf('consumeCredits(userId')
    expect(noWrite).toBeGreaterThan(-1)
    expect(charge).toBeGreaterThan(noWrite)
    expect(route).toMatch(/charged: 0/)
    expect(route).toMatch(/status: 402/)
    expect(route.indexOf('getCreditBalance')).toBeLessThan(noWrite)
  })

  it('approval gate: platform text stays hidden when published until the owner approves or edits it', () => {
    const { site, index } = siteWith([
      { ...ITEMS[0], detail: [{ heading: 'Eğitim', body: 'Platform yazdı.' }], sample: true },
      ITEMS[1],
    ])
    const list = resolveServices(site)!.listSlug
    expect(findPublicService(stripSampleContent(site), list, 'kahve-egitimi')).toBeNull()

    const approved = applyOperation(site, {
      op: 'updateServiceItem',
      index,
      item: 0,
      patch: { approve: true },
    } as never)
    expect(servicesOf(approved, index).items[0].sample).toBeUndefined()
    expect(findPublicService(stripSampleContent(approved), list, 'kahve-egitimi')).not.toBeNull()

    const edited = applyOperation(site, {
      op: 'updateServiceItem',
      index,
      item: 0,
      patch: { blocks: [{ heading: 'Yeni', body: 'Sahibi yazdı.' }] },
    } as never)
    expect(servicesOf(edited, index).items[0].sample).toBeUndefined()
  })
})
