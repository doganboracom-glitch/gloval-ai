import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { guardEdit } from '@/lib/edit-guard'
import { canAddEntry, canRemoveEntry, LIST_LIMITS, limitReason, listLimitFor } from '@/lib/list-limits'
import { applyOperation, collectionOf } from '@/lib/website-edit-operations'
import { fallbackWebsite, websiteSchema, type SectionType, type WebsiteSchema } from '@/lib/website-schema'

// Storefront products live in the database; the edit ops never touch them.
const TYPES = Object.keys(LIST_LIMITS).filter((k) => k !== 'heroSlides' && k !== 'products') as SectionType[]

function siteWithSection(type: SectionType): { site: WebsiteSchema; index: number } | null {
  const base = fallbackWebsite('kahve atölyesi', 'tr')
  const existing = base.sections.findIndex((s) => s.type === type)
  if (existing >= 0) return { site: base, index: existing }
  const added = applyOperation(base, { op: 'addSection', sectionType: type })
  const index = added.sections.findIndex((s) => s.type === type)
  return index >= 0 ? { site: added, index } : null
}

describe('list limits: one definition shared by schema, ops and editor', () => {
  it('the schema file reads the numbers from list-limits and re-declares none', () => {
    const src = readFileSync(join(process.cwd(), 'lib/website-schema.ts'), 'utf8')
    for (const key of Object.keys(LIST_LIMITS)) {
      expect(src).toContain(`LIST_LIMITS.${key}.min`)
      expect(src).toContain(`LIST_LIMITS.${key}.max`)
    }
  })

  it.each(TYPES)('%s: adding and removing never leaves the schema-valid range', (type) => {
    const start = siteWithSection(type)
    if (!start) return
    const limit = listLimitFor(type)!
    let { site } = start
    const { index } = start

    for (let i = 0; i < limit.max + 3; i++) {
      site = applyOperation(site, { op: 'addItem', index })
      const list = collectionOf(site.sections[index])
      if (!list) return
      expect(list.length).toBeLessThanOrEqual(limit.max)
    }
    expect(collectionOf(site.sections[index])!.length).toBe(limit.max)
    expect(websiteSchema.safeParse(site).success).toBe(true)

    for (let i = 0; i < limit.max + 3; i++) {
      site = applyOperation(site, { op: 'removeItem', index, itemIndex: 0 })
      expect(collectionOf(site.sections[index])!.length).toBeGreaterThanOrEqual(limit.min)
    }
    expect(collectionOf(site.sections[index])!.length).toBe(limit.min)
    expect(websiteSchema.safeParse(site).success).toBe(true)
  })

  it('helpers agree with the limits and explain a disabled button', () => {
    const { min, max } = LIST_LIMITS.services
    expect(canRemoveEntry('services', min)).toBe(false)
    expect(canRemoveEntry('services', min + 1)).toBe(true)
    expect(canAddEntry('services', max)).toBe(false)
    expect(canAddEntry('services', max - 1)).toBe(true)
    expect(limitReason('services', 'remove')).toContain(String(min))
    expect(limitReason('services', 'add')).toContain(String(max))
  })

  it('the edit guard rejects an edit that would break the schema and keeps valid ones', () => {
    const base = fallbackWebsite('kahve atölyesi', 'tr')
    expect(guardEdit(base, base).ok).toBe(true)

    const index = base.sections.findIndex((s) => 'items' in s && Array.isArray((s as { items?: unknown }).items))
    const broken = structuredClone(base) as WebsiteSchema
    ;(broken.sections[index] as unknown as { items: unknown[] }).items = []
    const verdict = guardEdit(base, broken)
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.message.length).toBeGreaterThan(0)
  })
})
