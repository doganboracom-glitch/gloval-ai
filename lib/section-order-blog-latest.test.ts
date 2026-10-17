import { describe, expect, it } from 'vitest'
import type { WebsiteSchema } from '@/lib/website-schema'
import {
  defaultBlogLatestIndex,
  hasBlogLatestSection,
  withDefaultBlogLatest,
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

describe('withDefaultBlogLatest', () => {
  it('adds the section above the FAQ once', () => {
    const next = withDefaultBlogLatest(site(['hero', 'features', 'faq', 'contact', 'footer']))
    expect(types(next)).toEqual(['hero', 'features', 'blogLatest', 'faq', 'contact', 'footer'])
    expect(types(withDefaultBlogLatest(next))).toEqual(types(next))
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

  it('hides the section when the owner had switched the block off', () => {
    const next = withLegacyBlogLatest(site(['hero', 'footer'], { showLatest: false }))
    expect(next.sections.find((section) => section.type === 'blogLatest')).toMatchObject({ hidden: true })
  })
})
