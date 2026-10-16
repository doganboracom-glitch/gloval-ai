import { describe, expect, it } from 'vitest'
import { clinicFixture } from '../scripts/ai-edit-quality/fixtures'
import { isOverBroadEdit, MAX_SECTIONS_PER_FOCUSED_EDIT, summarizeSiteChanges } from './site-change-summary'
import type { WebsiteSchema } from './website-schema'

const clone = (site: WebsiteSchema): WebsiteSchema => structuredClone(site)

describe('summarizeSiteChanges', () => {
  it('reports nothing for identical sites', () => {
    const site = clinicFixture()
    expect(summarizeSiteChanges(site, clone(site), 'tr')).toEqual({ lines: [], sectionsTouched: 0 })
  })

  it('names the site rename and the palette change', () => {
    const before = clinicFixture()
    const after = clone(before)
    after.meta.name = 'Yeni Klinik'
    after.theme.palette = after.theme.palette.map((c, i) => (i === 0 ? { ...c, hex: '#123456' } : c))
    const { lines, sectionsTouched } = summarizeSiteChanges(before, after, 'en')
    expect(lines).toContain(`Site name: "${before.meta.name}" -> "Yeni Klinik"`)
    expect(lines).toContain('Color palette changed')
    expect(sectionsTouched).toBe(0)
  })

  it('reports a removed section and counts it as touched', () => {
    const before = clinicFixture()
    const after = clone(before)
    const removedType = after.sections[after.sections.length - 1].type
    after.sections = after.sections.slice(0, -1)
    const { lines, sectionsTouched } = summarizeSiteChanges(before, after, 'tr')
    expect(lines.some((l) => l.startsWith('Bölüm kaldırıldı'))).toBe(true)
    expect(sectionsTouched).toBe(1)
    expect(removedType).toBeTruthy()
  })

  it('treats hiding a section as hidden, not as a content change', () => {
    const before = clinicFixture()
    const after = clone(before)
    after.sections[1] = { ...after.sections[1], hidden: true }
    const { lines, sectionsTouched } = summarizeSiteChanges(before, after, 'tr')
    expect(lines.some((l) => l.startsWith('Gizlendi'))).toBe(true)
    expect(lines.some((l) => l.startsWith('İçeriği değişti'))).toBe(false)
    expect(sectionsTouched).toBe(0)
  })

  it('reports a pure reorder', () => {
    const before = clinicFixture()
    const after = clone(before)
    after.sections = [after.sections[1], after.sections[0], ...after.sections.slice(2)]
    const { lines } = summarizeSiteChanges(before, after, 'en')
    expect(lines).toContain('Section order changed')
  })
})

describe('isOverBroadEdit', () => {
  const touched = (n: number) => ({ lines: [], sectionsTouched: n })

  it('flags a focused instruction that rewrote many sections', () => {
    expect(isOverBroadEdit(touched(MAX_SECTIONS_PER_FOCUSED_EDIT + 1), 'Fiyatı 500 yap')).toBe(true)
  })

  it('allows the limit itself', () => {
    expect(isOverBroadEdit(touched(MAX_SECTIONS_PER_FOCUSED_EDIT), 'Fiyatı 500 yap')).toBe(false)
  })

  it('allows broad instructions to touch everything', () => {
    expect(isOverBroadEdit(touched(10), 'Tüm siteyi İngilizceye çevir')).toBe(false)
    expect(isOverBroadEdit(touched(10), 'Rewrite the whole site')).toBe(false)
  })
})
