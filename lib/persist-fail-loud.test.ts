import { beforeEach, describe, expect, it, vi } from 'vitest'

const generateSiteImage = vi.fn()
const persist = vi.fn()
const consumeCredits = vi.fn()

const BASE64 = `data:image/png;base64,${'A'.repeat(4000)}`
const SHORT_URL = 'https://cdn.example/site-images/generated/abc.png'

vi.mock('@/lib/image-provider', () => ({
  generateSiteImage: (...args: unknown[]) => generateSiteImage(...args),
  imageGenerationAvailable: () => true,
}))
vi.mock('@/lib/image-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/image-storage')>()),
  persistImageDataUri: (...args: unknown[]) => persist(...args),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
  }),
}))
vi.mock('@/lib/ai-credits', () => ({
  AI_ACTION_COSTS: { heroImage: 1, sectionImage: 1 },
  getCreditBalance: async () => 10,
  consumeCredits: (...args: unknown[]) => consumeCredits(...args),
}))
vi.mock('@/lib/billing', () => ({ getPlanCodeForUser: async () => 'PRO' }))
vi.mock('@/lib/free-daily-limit', () => ({
  checkFreeDailyActionLimit: async () => ({ allowed: true }),
  freeDailyLimitResponseBody: () => ({}),
}))
vi.mock('@/lib/website-schema', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/website-schema')>()
  return {
    ...original,
    websiteSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
  }
})

import { POST as heroPost } from '@/app/api/hero-image/route'
import { POST as sectionPost } from '@/app/api/section-image/route'
import { attachHeroImage } from '@/lib/hero-image'
import { ImageStorageError, IMAGE_STORAGE_USER_MESSAGE } from '@/lib/image-storage'
import { applyItemImageRequest, attachSectionImages } from '@/lib/section-images'
import type { WebsiteSchema } from '@/lib/website-schema'

const failStorage = () => persist.mockRejectedValue(new ImageStorageError('upload error: offline'))

function makeSite() {
  return {
    meta: { name: 'Serene Flow Yoga', tagline: 'Calm', language: 'tr', audience: 'yoga' },
    navigation: { logoText: 'Serene Flow' },
    theme: { mode: 'light', palette: [] },
    sections: [
      {
        type: 'hero',
        variant: 'slider',
        image: { imagePrompt: 'hero', src: 'old-hero', aspectRatio: '16/9' },
        slides: [0, 1].map((i) => ({
          title: `Slide ${i + 1}`,
          image: { imagePrompt: `slide ${i}`, src: `old-slide-${i}`, aspectRatio: '16/9' },
        })),
      },
      {
        type: 'gallery',
        title: 'Galeri',
        items: [
          { title: 'Bir', imagePrompt: 'studio one', src: 'old-item-0' },
          { title: 'Iki', imagePrompt: 'studio two' },
        ],
      },
    ],
  }
}

const asSite = (site: ReturnType<typeof makeSite>) => site as unknown as WebsiteSchema
const post = (url: string, body: unknown) =>
  new Request(`http://test.local${url}`, { method: 'POST', body: JSON.stringify(body) })

beforeEach(() => {
  generateSiteImage.mockReset()
  persist.mockReset()
  consumeCredits.mockReset()
  generateSiteImage.mockResolvedValue({ src: BASE64, provider: 'gateway' })
  persist.mockResolvedValue(SHORT_URL)
  consumeCredits.mockResolvedValue({ ok: true, balance: 9 })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/hero-image (bulk)', () => {
  it('storage failure: 502, user message, no credit charged, schema untouched', async () => {
    failStorage()
    const site = makeSite()
    const res = await heroPost(post('/api/hero-image', { schema: site, prompt: 'yoga studio' }))
    const body = await res.json()

    expect(res.status).toBe(502)
    expect(body).toMatchObject({ error: 'image_storage_failed', message: IMAGE_STORAGE_USER_MESSAGE, charged: 0 })
    expect(consumeCredits).not.toHaveBeenCalled()
    expect(JSON.stringify(body)).not.toContain('base64')
  })

  it('success: charges once and writes only the short URL', async () => {
    const res = await heroPost(post('/api/hero-image', { schema: makeSite(), prompt: 'yoga studio' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(consumeCredits).toHaveBeenCalledTimes(1)
    const raw = JSON.stringify(body)
    expect(raw).toContain(SHORT_URL)
    expect(raw).not.toContain('base64')
  })
})

describe('POST /api/section-image', () => {
  it('single item, storage failure: 502, no charge, previous src kept', async () => {
    failStorage()
    const site = makeSite()
    const res = await sectionPost(
      post('/api/section-image', { schema: site, index: 1, itemIndex: 0, request: 'calm yoga room' }),
    )
    const body = await res.json()

    expect(res.status).toBe(502)
    expect(body).toMatchObject({ error: 'image_storage_failed', message: IMAGE_STORAGE_USER_MESSAGE, charged: 0 })
    expect(consumeCredits).not.toHaveBeenCalled()
    expect((site.sections[1] as { items: { src?: string }[] }).items[0].src).toBe('old-item-0')
  })

  it('batch, every storage attempt fails: 502 and no charge', async () => {
    failStorage()
    const res = await sectionPost(post('/api/section-image', { schema: makeSite() }))

    expect(res.status).toBe(502)
    expect((await res.json()).charged).toBe(0)
    expect(consumeCredits).not.toHaveBeenCalled()
  })

  it('single item, success: charged once with the short URL on the item', async () => {
    const res = await sectionPost(
      post('/api/section-image', { schema: makeSite(), index: 1, itemIndex: 0, request: 'calm yoga room' }),
    )
    const body = (await res.json()) as { website: { sections: { items?: { src?: string }[] }[] } }

    expect(res.status).toBe(200)
    expect(consumeCredits).toHaveBeenCalledTimes(1)
    expect(body.website.sections[1].items?.[0].src).toBe(SHORT_URL)
  })

  it('batch, success: charged per stored image', async () => {
    const res = await sectionPost(post('/api/section-image', { schema: makeSite() }))
    const body = (await res.json()) as { image: { status: string; generated: number } }

    expect(res.status).toBe(200)
    expect(body.image).toMatchObject({ status: 'generated', generated: 1 })
    expect(consumeCredits).toHaveBeenCalledTimes(1)
    expect(consumeCredits.mock.calls[0][1]).toBe(1)
  })
})

describe('library functions', () => {
  it('attachHeroImage never writes base64 and reports storageFailed', async () => {
    failStorage()
    const site = makeSite()
    ;(site.sections[0] as { image: { src?: string } }).image.src = undefined
    const result = await attachHeroImage(asSite(site), 'yoga studio')

    expect(result.generated).toBe(false)
    expect(result.storageFailed).toBeGreaterThan(0)
    expect(JSON.stringify(site)).not.toContain('base64')
  })

  it('attachSectionImages leaves the item without a src and reports storageFailed', async () => {
    failStorage()
    const site = makeSite()
    const result = await attachSectionImages(asSite(site))

    expect(result.generated).toBe(0)
    expect(result.storageFailed).toBe(1)
    expect((site.sections[1] as { items: { src?: string }[] }).items[1].src).toBeUndefined()
  })

  it('applyItemImageRequest rethrows ImageStorageError and restores the previous src', async () => {
    failStorage()
    const site = makeSite()

    await expect(applyItemImageRequest(asSite(site), 1, 0, 'calm room')).rejects.toBeInstanceOf(ImageStorageError)
    expect((site.sections[1] as { items: { src?: string }[] }).items[0].src).toBe('old-item-0')
  })
})
