import { describe, expect, it } from 'vitest'
import type { WebsiteSchema } from '@/lib/website-schema'
import {
  defaultBlogLatestIndex,
  hasBlogLatestSection,
  setBlogLatestEnabled,
  withBlogOffByDefault,
  withLegacyBlogLatest,
} from '@/lib/section-order'

function site(types: string[], blogSettings?: WebsiteSchema['blogSettings']): WebsiteSchema {
  return {
    meta: { siteName: 'Klinik', language: 'tr' },
    sections: types.map((type) => ({ type })),
    ...(blogSettings ? { blogSettings } : {}),
  } as unknown as WebsiteSchema
}

const types = (s: WebsiteSchema) => s.sections.map((section) => section.type)

describe('defaultBlogLatestIndex', () => {
  it('goes above the FAQ, else contact, else cta, else footer, else the end', () => {
    expect(defaultBlogLatestIndex(site(['hero', 'faq', 'contact', 'footer']).sections)).toBe(1)
    expect(defaultBlogLatestIndex(site(['hero', 'contact', 'footer']).sections)).toBe(1)
    expect(defaultBlogLatestIndex(site(['hero', 'cta', 'footer']).sections)).toBe(1)
    expect(defaultBlogLatestIndex(site(['hero', 'footer']).sections)).toBe(1)
    expect(defaultBlogLatestIndex(site(['hero']).sections)).toBe(1)
  })
})

describe('withBlogOffByDefault', () => {
  it('generates a new site with the menu link and home section both off', () => {
    const next = withBlogOffByDefault(site(['hero', 'faq', 'footer']))
    expect(next.blogSettings).toEqual({ showInMenu: false, showLatest: false })
    expect(types(next)).toEqual(['hero', 'faq', 'footer'])
  })

  it('keeps settings the owner already chose', () => {
    const s = site(['hero', 'footer'], { showInMenu: true })
    expect(withBlogOffByDefault(s)).toBe(s)
  })
})

describe('setBlogLatestEnabled', () => {
  it('adds the section above the FAQ the first time it is switched on', () => {
    const next = setBlogLatestEnabled(site(['hero', 'features', 'faq', 'contact', 'footer']), true)
    expect(types(next)).toEqual(['hero', 'features', 'blogLatest', 'faq', 'contact', 'footer'])
    expect(types(setBlogLatestEnabled(next, true))).toEqual(types(next))
  })

  it('removes the section when switched off and restores it to the same spot', () => {
    const on = setBlogLatestEnabled(site(['hero', 'features', 'faq', 'footer']), true)
    const off = setBlogLatestEnabled(on, false)
    expect(types(off)).toEqual(['hero', 'features', 'faq', 'footer'])
    expect(off.blogSettings?.latestIndex).toBe(2)
    expect(types(setBlogLatestEnabled(off, true))).toEqual(types(on))
  })

  it('shows a hidden section when switched on', () => {
    const s = site(['hero', 'footer'])
    s.sections = [s.sections[0], { type: 'blogLatest', hidden: true }, s.sections[1]] as WebsiteSchema['sections']
    const next = setBlogLatestEnabled(s, true)
    expect(next.sections.find((section) => section.type === 'blogLatest')).not.toHaveProperty('hidden')
  })
})

describe('withLegacyBlogLatest', () => {
  it('keeps an existing section untouched', () => {
    const s = site(['hero', 'blogLatest', 'footer'])
    expect(withLegacyBlogLatest(s)).toBe(s)
    expect(hasBlogLatestSection(s)).toBe(true)
  })

  it('puts the section where the old fixed block was: above the footer by default', () => {
    expect(types(withLegacyBlogLatest(site(['hero', 'features', 'footer'])))).toEqual([
      'hero',
      'features',
      'blogLatest',
      'footer',
    ])
  })

  it('puts it right after the hero for the after-hero placement', () => {
    const next = withLegacyBlogLatest(site(['hero', 'features', 'footer'], { latestPlacement: 'after-hero' }))
    expect(types(next)).toEqual(['hero', 'blogLatest', 'features', 'footer'])
  })

  it('adds no section when the owner had switched the block off', () => {
    const next = withLegacyBlogLatest(site(['hero', 'footer'], { showLatest: false }))
    expect(types(next)).toEqual(['hero', 'footer'])
  })
})
