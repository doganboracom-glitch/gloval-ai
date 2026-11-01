import { beforeEach, describe, expect, it, vi } from 'vitest'

const generateSiteImage = vi.fn()
// Thrown from the wrapper, not the spy: vitest's spy leaves its own copy of a
// rejected promise unhandled and fails the test even though the code recovers.
let providerThrows = false

vi.mock('@/lib/image-provider', () => ({
  generateSiteImage: async (...args: unknown[]) => {
    if (providerThrows) throw new Error('provider down')
    return generateSiteImage(...args)
  },
  imageGenerationAvailable: () => true,
}))
vi.mock('@/lib/image-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/image-storage')>()),
  persistImageDataUri: async (src: string) => src,
}))

import { applyHeroImageRequest, applySlideImageRequest, attachHeroImage } from '@/lib/hero-image'
import { applyItemImageRequest, attachSectionImages } from '@/lib/section-images'
import { RADIO_STATION_BRIEF } from '@/lib/__fixtures__/radio-station'
import type { WebsiteSchema } from '@/lib/website-schema'

function makeSite(): WebsiteSchema {
  return {
    meta: { name: 'Serene Flow Yoga', tagline: 'Calm', language: 'en', audience: 'yoga students' },
    navigation: { logoText: 'Serene Flow' },
    theme: { mode: 'light', palette: [] },
    sections: [
      {
        type: 'hero',
        variant: 'slider',
        image: { imagePrompt: 'hero', src: 'old-hero', aspectRatio: '16/9' },
        slides: [0, 1, 2, 3].map((i) => ({
          title: `Slide ${i + 1}`,
          image: { imagePrompt: `slide ${i}`, src: `old-slide-${i}`, aspectRatio: '16/9' },
        })),
      },
      {
        type: 'portfolio',
        items: [
          { title: 'Proje 1', src: 'old-p0' },
          { title: 'Proje 2', src: 'old-p1' },
        ],
      },
    ],
  } as unknown as WebsiteSchema
}

type Hero = { image: { src?: string }; slides: { image: { src?: string } }[] }
const heroOf = (site: WebsiteSchema) => site.sections[0] as unknown as Hero
const itemsOf = (site: WebsiteSchema) =>
  (site.sections[1] as unknown as { items: { src?: string; title?: string; imagePrompt?: string }[] }).items

beforeEach(() => {
  generateSiteImage.mockReset()
  providerThrows = false
})

describe('hero image request', () => {
  it('keeps the existing hero image when generation fails', async () => {
    generateSiteImage.mockResolvedValue(null)
    const site = makeSite()
    const out = await applyHeroImageRequest(site, 'yoga studio with mats')
    expect(out.status).toBe('failed')
    expect(heroOf(site).image.src).toBe('old-hero')
    expect(heroOf(site).slides[0].image.src).toBe('old-slide-0')
  })
})

describe('automatic hero image attachment', () => {
  it('does not regenerate existing hero or slide images', async () => {
    generateSiteImage.mockResolvedValue({ src: 'new-auto-image', provider: 'gateway' })
    const site = makeSite()
    const originalHero = heroOf(site).image.src
    const originalSlides = heroOf(site).slides.map((slide) => slide.image.src)

    const out = await attachHeroImage(site, 'yoga studio with mats')

    expect(out.generated).toBe(false)
    expect(generateSiteImage).not.toHaveBeenCalled()
    expect(heroOf(site).image.src).toBe(originalHero)
    expect(heroOf(site).slides.map((slide) => slide.image.src)).toEqual(originalSlides)
  })

  it('keeps the neutral abstract fallback when a low-confidence image request fails', async () => {
    generateSiteImage.mockResolvedValue(null)
    const site = makeSite()
    site.meta.name = 'Kivu'
    site.meta.tagline = 'Thoughtful everyday design'
    site.meta.audience = 'People who value quiet details'
    site.navigation.logoText = 'Kivu'
    heroOf(site).image.src = undefined
    for (const slide of heroOf(site).slides) slide.image.src = undefined

    const out = await attachHeroImage(site, 'Kivu brand website with a thoughtful editorial identity')

    expect(out.brief.confidence).toBe('low')
    expect(out.heroPrompt).toMatch(/abstract editorial composition/i)
    expect(out.heroPrompt).toMatch(/Do NOT depict:.*unrelated people/i)
    expect(out.generated).toBe(false)
    expect(generateSiteImage).not.toHaveBeenCalled()
    expect(heroOf(site).image.src).toBeUndefined()
    expect(heroOf(site).slides[0].image.src).toBeUndefined()
  })
})

describe('slide image request', () => {
  it('generates the 4th slide without touching the others', async () => {
    generateSiteImage.mockResolvedValue({ src: 'new-4', provider: 'gateway' })
    const site = makeSite()
    const out = await applySlideImageRequest(site, 3, 'pilates reformer class')
    expect(out.status).toBe('generated')
    const hero = heroOf(site)
    expect(hero.slides[3].image.src).toBe('new-4')
    expect(hero.slides[0].image.src).toBe('old-slide-0')
    expect(hero.image.src).toBe('old-hero')
  })

  it('keeps the old slide image when generation fails', async () => {
    generateSiteImage.mockResolvedValue(null)
    const site = makeSite()
    const out = await applySlideImageRequest(site, 3, 'pilates reformer class')
    expect(out.status).toBe('failed')
    expect(heroOf(site).slides[3].image.src).toBe('old-slide-3')
  })

  it('mirrors slide 1 into the hero image', async () => {
    generateSiteImage.mockResolvedValue({ src: 'new-1', provider: 'gateway' })
    const site = makeSite()
    await applySlideImageRequest(site, 0, 'sunrise yoga')
    expect(heroOf(site).slides[0].image.src).toBe('new-1')
    expect(heroOf(site).image.src).toBe('new-1')
  })
})

describe('attachSectionImages', () => {
  function siteWithOneMissing() {
    const site = makeSite()
    ;(site.sections[1] as unknown as { items: { title: string; src?: string }[] }).items[1].src =
      undefined
    return site
  }

  it('keeps existing images and leaves the missing one empty when generation fails', async () => {
    generateSiteImage.mockResolvedValue(null)
    const site = siteWithOneMissing()
    const out = await attachSectionImages(site)
    expect(generateSiteImage).toHaveBeenCalledTimes(1)
    expect(out.generated).toBe(0)
    expect(itemsOf(site)[0].src).toBe('old-p0')
    expect(itemsOf(site)[1].src).toBeUndefined()
  })

  it('keeps existing images when the provider throws', async () => {
    providerThrows = true
    const site = siteWithOneMissing()
    const out = await attachSectionImages(site)
    expect(out.generated).toBe(0)
    expect(itemsOf(site)[0].src).toBe('old-p0')
  })

  it('never regenerates items that already have an image', async () => {
    generateSiteImage.mockResolvedValue({ src: 'new', provider: 'gateway' })
    const site = makeSite()
    const out = await attachSectionImages(site)
    expect(out.requested).toBe(0)
    expect(generateSiteImage).not.toHaveBeenCalled()
    expect(itemsOf(site).map((i) => i.src)).toEqual(['old-p0', 'old-p1'])
  })

  it('includes the original brief in every pending image prompt without replacing item subjects', async () => {
    generateSiteImage.mockResolvedValue({ src: 'new-radio-image', provider: 'gateway' })
    const site = makeSite()
    site.meta.name = 'Istanbul FM'
    site.meta.tagline = 'Music and broadcasting'
    site.meta.audience = 'radio listeners'
    site.navigation.logoText = 'Istanbul FM'
    const [topTen, topTwenty] = itemsOf(site)
    topTen.title = 'Top 10 playlist cover'
    topTen.imagePrompt = 'blue neon waveform behind the Top 10 playlist artwork'
    topTen.src = undefined
    topTwenty.title = 'Top 20 playlist cover'
    topTwenty.imagePrompt = 'red neon waveform behind the Top 20 playlist artwork'
    topTwenty.src = undefined

    const out = await attachSectionImages(site, RADIO_STATION_BRIEF)

    expect(out.requested).toBe(2)
    expect(out.generated).toBe(2)
    const prompts = generateSiteImage.mock.calls.map(([request]) => (request as { prompt: string }).prompt)
    expect(prompts).toHaveLength(2)
    expect(prompts[0]).toContain(RADIO_STATION_BRIEF)
    expect(prompts[1]).toContain(RADIO_STATION_BRIEF)
    expect(prompts[0]).toContain('blue neon waveform')
    expect(prompts[1]).toContain('red neon waveform')
    expect(prompts[0]).toContain('radio station / broadcaster')
    expect(prompts[1]).toContain('radio station / broadcaster')
    expect(topTen.src).toBe('new-radio-image')
    expect(topTwenty.src).toBe('new-radio-image')
  })
})

describe('section item image request', () => {
  it('saves the generated portfolio image on the requested item only', async () => {
    generateSiteImage.mockResolvedValue({ src: 'new-p1', provider: 'gateway' })
    const site = makeSite()
    const out = await applyItemImageRequest(site, 1, 1, 'studio interior')
    expect(out.status).toBe('generated')
    expect(itemsOf(site)[1].src).toBe('new-p1')
    expect(itemsOf(site)[0].src).toBe('old-p0')
  })

  it('keeps the previous portfolio image when generation fails', async () => {
    generateSiteImage.mockResolvedValue(null)
    const site = makeSite()
    const out = await applyItemImageRequest(site, 1, 0, 'studio interior')
    expect(out.status).toBe('failed')
    expect(itemsOf(site)[0].src).toBe('old-p0')
  })
})
