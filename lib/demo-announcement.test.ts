import { describe, expect, it } from 'vitest'
import { ANNOUNCEMENT_SAMPLE_HINT, stripAnnouncementHint } from '@/lib/announcement'
import { DEMO_ANNOUNCEMENT_POOLS, demoAnnouncementText } from '@/lib/demo-announcement'
import { buildDemoSite, demos } from '@/lib/demos'
import { approveSampleFindings, collectSampleFindings, stripSampleContent } from '@/lib/sample-content'
import { websiteSchema } from '@/lib/website-schema'

const FORBIDDEN = /%|₺|\bTL\b|indirim|kampanya|son \d|award|ödül|discount|sale|last \d/i

describe('demo announcement band', () => {
  it('has a pool of at least 5 sentences per language for every demo, without risky claims', () => {
    for (const demo of demos) {
      const pool = DEMO_ANNOUNCEMENT_POOLS[demo.slug]
      expect(pool, demo.slug).toBeDefined()
      for (const lang of ['tr', 'en'] as const) {
        expect(pool[lang].length).toBeGreaterThanOrEqual(5)
        for (const sentence of pool[lang]) expect(sentence).not.toMatch(FORBIDDEN)
      }
    }
  })

  it('is deterministic and includes exactly one band with the fixed hint', () => {
    for (const demo of demos) {
      for (const lang of ['tr', 'en'] as const) {
        const a = buildDemoSite(demo, lang)
        const b = buildDemoSite(demo, lang)
        const bands = a.sections.filter((s) => s.type === 'announcement')
        expect(bands).toHaveLength(1)
        const band = bands[0]
        if (band.type !== 'announcement') throw new Error('unreachable')
        expect(band.items[0].text).toBe(demoAnnouncementText(demo.slug, lang))
        expect(band.items[0].text.endsWith(ANNOUNCEMENT_SAMPLE_HINT[lang])).toBe(true)
        expect(band.items[0].text.length).toBeLessThanOrEqual(200)
        expect(JSON.stringify(a)).toBe(JSON.stringify(b))
        expect(websiteSchema.safeParse(a).success, `${demo.slug}/${lang}`).toBe(true)
      }
    }
  })

  it('sits above the header, except below the slider on slider demos', () => {
    for (const demo of demos) {
      const types = buildDemoSite(demo, 'tr')
        .sections.map((s) => s.type)
        .filter((t) => t !== 'heroStrip')
      const at = types.indexOf('announcement')
      if (types.includes('slider')) {
        expect(types.slice(0, at)).toEqual(['hero', 'slider'])
      } else {
        expect(at).toBe(0)
      }
    }
  })

  it('never reaches a published site: stripped when unapproved, hint removed when approved', () => {
    const site = buildDemoSite(demos[0], 'tr')
    expect(stripSampleContent(site).sections.some((s) => s.type === 'announcement')).toBe(false)

    const ids = new Set(
      collectSampleFindings(site)
        .filter((f) => f.sectionType === 'announcement')
        .flatMap((f) => f.items.map((i) => i.id)),
    )
    expect(ids.size).toBeGreaterThan(0)
    const approved = approveSampleFindings(site, ids)
    const band = approved.sections.find((s) => s.type === 'announcement')
    if (band?.type !== 'announcement') throw new Error('band missing')
    expect(band.items[0].text).not.toContain(ANNOUNCEMENT_SAMPLE_HINT.tr)
    expect(stripAnnouncementHint(`Merhaba. ${ANNOUNCEMENT_SAMPLE_HINT.tr}`)).toBe('Merhaba.')
  })
})
