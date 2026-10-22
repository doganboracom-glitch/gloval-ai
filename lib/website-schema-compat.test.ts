import { describe, expect, it } from 'vitest'
import { SITE_SECTION_HARD_CAP } from '@/lib/pricing-config'
import { setBlogLatestEnabled, withLegacyBlogLatest } from '@/lib/section-order'
import { fallbackWebsite, websiteSchema, type WebsiteSchema } from '@/lib/website-schema'
import { ensurePageIds, normalizeWebsiteSchema, parseWebsiteForSave } from '@/lib/website-schema-compat'

function siteAtCap(): WebsiteSchema {
  const base = fallbackWebsite('kahve dükkanı', 'tr')
  const filler = base.sections[0]
  const sections = [...base.sections]
  while (sections.length < SITE_SECTION_HARD_CAP) sections.push(filler)
  return { ...base, sections: sections.slice(0, SITE_SECTION_HARD_CAP) }
}

function overCap(): unknown {
  const site = siteAtCap()
  return { ...site, sections: [...site.sections, site.sections[0]] }
}

describe('normalizeWebsiteSchema', () => {
  it('returns a valid schema untouched', () => {
    const site = fallbackWebsite('kahve dükkanı', 'tr')
    const result = normalizeWebsiteSchema(site)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.repaired).toBe(false)
      expect(result.steps).toEqual([])
      expect(result.value).toEqual(ensurePageIds(site))
      expect(result.value.pages?.every((p) => p.id)).toBe(true)
    }
  })

  it('fills missing page ids once and keeps existing ones', () => {
    const site = fallbackWebsite('kahve dükkanı', 'tr')
    const once = ensurePageIds(site)
    expect(ensurePageIds(once)).toBe(once)
    const ids = once.pages?.map((p) => p.id) ?? []
    expect(new Set(ids).size).toBe(ids.length)
    const renamed = { ...once, pages: once.pages?.map((p) => ({ ...p, slug: `${p.slug}-x` })) }
    expect(ensurePageIds(renamed).pages?.map((p) => p.id)).toEqual(ids)
  })

  it('repairs a site with more sections than the cap and keeps it schema-valid', () => {
    const over = overCap()
    expect(websiteSchema.safeParse(over).success).toBe(false)
    const result = normalizeWebsiteSchema(over)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.repaired).toBe(true)
      expect(result.value.sections.length).toBeLessThanOrEqual(SITE_SECTION_HARD_CAP)
      expect(websiteSchema.safeParse(result.value).success).toBe(true)
    }
  })

  it('does not mutate its input', () => {
    const over = overCap()
    const before = JSON.stringify(over)
    normalizeWebsiteSchema(over)
    expect(JSON.stringify(over)).toBe(before)
  })

  it('reports an unreadable value as not ok, with issues', () => {
    const result = normalizeWebsiteSchema(null)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.length).toBeGreaterThan(0)
  })
})

describe('parseWebsiteForSave', () => {
  it('returns the repaired schema for a drifted row', () => {
    expect(websiteSchema.safeParse(parseWebsiteForSave(overCap())).success).toBe(true)
  })

  it('throws invalid_site_schema for an unrepairable value', () => {
    expect(() => parseWebsiteForSave('nope')).toThrow(/invalid_site_schema/)
  })
})

describe('blog section at the section cap', () => {
  it('does not add the blog section to a full site, so it stays valid', () => {
    const withBlog = setBlogLatestEnabled(siteAtCap(), true)
    expect(withBlog.sections.length).toBe(SITE_SECTION_HARD_CAP)
    expect(websiteSchema.safeParse(withBlog).success).toBe(true)
  })

  it('does not add the legacy blog section to a full site', () => {
    const result = withLegacyBlogLatest(siteAtCap())
    expect(result.sections.length).toBe(SITE_SECTION_HARD_CAP)
    expect(websiteSchema.safeParse(result).success).toBe(true)
  })

  it('still adds it when there is room', () => {
    const withBlog = setBlogLatestEnabled(fallbackWebsite('kahve dükkanı', 'tr'), true)
    expect(withBlog.sections.some((s) => s.type === 'blogLatest')).toBe(true)
  })
})
