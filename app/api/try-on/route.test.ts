import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  generateTryOnImage: vi.fn(),
  getTryOnConfigForStore: vi.fn(),
  getCreditBalance: vi.fn(),
  consumeCredits: vi.fn(),
}))

vi.mock('@/lib/image-provider', () => ({ generateTryOnImage: mocks.generateTryOnImage }))
vi.mock('@/lib/try-on-settings', () => ({ getTryOnConfigForStore: mocks.getTryOnConfigForStore }))
vi.mock('@/lib/ai-credits', () => ({
  AI_ACTION_COSTS: { tryOn: 5 },
  getCreditBalance: mocks.getCreditBalance,
  consumeCredits: mocks.consumeCredits,
}))

const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ'
let ipCounter = 0

function request(body: Record<string, unknown>) {
  // Each test gets its own IP so the in-memory rate limiter never interferes.
  return new Request('http://localhost/api/try-on', {
    method: 'POST',
    headers: { 'x-forwarded-for': `10.0.0.${++ipCounter}` },
    body: JSON.stringify(body),
  })
}

async function post(body: Record<string, unknown>) {
  const { POST } = await import('./route')
  return POST(request(body))
}

const demoBody = {
  mode: 'demo',
  demoSlug: 'eticaret',
  personPhoto: PHOTO,
  productImage: 'https://cdn.example.test/p.webp',
  productName: 'Yüzük',
}

beforeEach(() => {
  mocks.generateTryOnImage.mockReset()
  mocks.getTryOnConfigForStore.mockReset()
  mocks.getCreditBalance.mockReset()
  mocks.consumeCredits.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/try-on error paths always answer with JSON', () => {
  it('returns JSON failed (500) when image generation throws', async () => {
    mocks.generateTryOnImage.mockRejectedValue(new Error('gateway exploded'))
    const res = await post(demoBody)

    expect(res.status).toBe(500)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await res.json()).toEqual({ ok: false, error: 'failed' })
  })

  it('returns JSON failed (500) when the store lookup throws', async () => {
    mocks.getTryOnConfigForStore.mockRejectedValue(new Error('db down'))
    const res = await post({ ...demoBody, mode: 'store', storeSlug: 'luna-mucevher' })

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ ok: false, error: 'failed' })
    expect(mocks.generateTryOnImage).not.toHaveBeenCalled()
  })

  it('still returns the generated image when charging credits throws', async () => {
    mocks.getTryOnConfigForStore.mockResolvedValue({ ownerId: 'owner-1' })
    mocks.getCreditBalance.mockResolvedValue(100)
    mocks.generateTryOnImage.mockResolvedValue({ dataUrl: 'data:image/png;base64,AAAA' })
    mocks.consumeCredits.mockRejectedValue(new Error('rpc failed'))
    const res = await post({ ...demoBody, mode: 'store', storeSlug: 'luna-mucevher' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, dataUrl: 'data:image/png;base64,AAAA' })
  })

  it('returns JSON invalid_photo (400) for a non-data-URL photo', async () => {
    const res = await post({ ...demoBody, personPhoto: 'https://example.test/me.jpg' })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ ok: false, error: 'invalid_photo' })
  })

  it('passes provider errors through as JSON with the right status', async () => {
    mocks.generateTryOnImage.mockResolvedValue({ error: 'unavailable' })
    const res = await post(demoBody)

    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ ok: false, error: 'unavailable' })
  })
})
