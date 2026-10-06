import { beforeEach, describe, expect, it, vi } from 'vitest'

const generateSiteImage = vi.fn()
const consumeCredits = vi.fn()

vi.mock('@/lib/image-provider', () => ({
  generateSiteImage: (...args: unknown[]) => generateSiteImage(...args),
  imageGenerationAvailable: () => true,
}))
vi.mock('@/lib/image-storage', () => ({
  persistImageDataUri: async (src: string) => src,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
  }),
}))
vi.mock('@/lib/ai-credits', () => ({
  AI_ACTION_COSTS: { heroImage: 1 },
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

import { POST } from '@/app/api/hero-image/route'

type Hero = { image: { src?: string }; slides: { image: { src?: string } }[] }

function makeSite() {
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
    ],
  }
}

async function regenerate(site: ReturnType<typeof makeSite>) {
  const res = await POST(
    new Request('http://test.local/api/hero-image', {
      method: 'POST',
      body: JSON.stringify({ schema: site, prompt: 'yoga studio' }),
    }),
  )
  const body = (await res.json()) as { website: { sections: unknown[] }; image: { status: string } }
  return { res, body, hero: body.website.sections[0] as Hero }
}

beforeEach(() => {
  generateSiteImage.mockReset()
  consumeCredits.mockReset()
  consumeCredits.mockResolvedValue({ ok: true, balance: 9 })
})

describe('bulk hero regeneration', () => {
  it('keeps every failed image on its old src when only one image succeeds', async () => {
    generateSiteImage.mockResolvedValueOnce({ src: 'new-first', provider: 'gateway' })
    generateSiteImage.mockResolvedValue(null)

    const { body, hero } = await regenerate(makeSite())

    expect(generateSiteImage).toHaveBeenCalledTimes(3)
    expect(body.image.status).toBe('completed')
    expect(hero.slides[0].image.src).toBe('new-first')
    expect(hero.image.src).toBe('old-hero')
    expect(hero.slides[1].image.src).toBe('old-slide-1')
    expect(hero.slides[2].image.src).toBe('old-slide-2')
    expect(hero.slides[3].image.src).toBe('old-slide-3')
    expect(consumeCredits).toHaveBeenCalledTimes(1)
  })

  it('keeps all old srcs and charges nothing when every image fails', async () => {
    generateSiteImage.mockResolvedValue(null)

    const { body, hero } = await regenerate(makeSite())

    expect(body.image.status).toBe('failed')
    expect(hero.image.src).toBe('old-hero')
    expect(hero.slides.map((s) => s.image.src)).toEqual([
      'old-slide-0',
      'old-slide-1',
      'old-slide-2',
      'old-slide-3',
    ])
    expect(consumeCredits).not.toHaveBeenCalled()
  })
})
