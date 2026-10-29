import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  generateTryOnImage: vi.fn(),
  getTryOnConfigForStore: vi.fn(),
  getCreditBalance: vi.fn(),
  consumeCredits: vi.fn(),
  reserveAnonSubjects: vi.fn(),
  releaseAnonAiActions: vi.fn(),
  resolveActiveDomainForHost: vi.fn(),
  getPublishedSlugForProjectId: vi.fn(),
}))

vi.mock('@/lib/anon-ai-limit', () => ({
  hashedIp: () => 'hashed-ip',
  reserveAnonSubjects: mocks.reserveAnonSubjects,
  releaseAnonAiActions: mocks.releaseAnonAiActions,
}))
vi.mock('@/lib/custom-domains/service', () => ({
  resolveActiveDomainForHost: mocks.resolveActiveDomainForHost,
  getPublishedSlugForProjectId: mocks.getPublishedSlugForProjectId,
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

function request(body: Record<string, unknown>, host = 'gloval.ai', extra: Record<string, string> = {}) {
  // Each test gets its own IP so the in-memory rate limiter never interferes.
  return new Request(`https://${host}/api/try-on`, {
    method: 'POST',
    headers: {
      'x-forwarded-for': `10.0.0.${++ipCounter}`,
      host,
      origin: `https://${host}`,
      ...extra,
    },
    body: JSON.stringify(body),
  })
}

async function post(body: Record<string, unknown>, host?: string, extra?: Record<string, string>) {
  const { POST } = await import('./route')
  return POST(request(body, host, extra))
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
  mocks.reserveAnonSubjects.mockReset()
  mocks.releaseAnonAiActions.mockReset()
  mocks.resolveActiveDomainForHost.mockReset()
  mocks.getPublishedSlugForProjectId.mockReset()
  mocks.reserveAnonSubjects.mockResolvedValue({ allowed: true, subjects: ['tryon-ip:hashed-ip'] })
  mocks.releaseAnonAiActions.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/try-on origin and abuse guards', () => {
  const storeBody = { ...demoBody, mode: 'store', storeSlug: 'luna-mucevher' }

  it('serves the store from its own tenant host and charges the owner', async () => {
    mocks.getTryOnConfigForStore.mockResolvedValue({ projectId: 'p1', ownerId: 'owner-1' })
    mocks.getCreditBalance.mockResolvedValue(100)
    mocks.generateTryOnImage.mockResolvedValue({ dataUrl: 'data:image/png;base64,AAAA' })
    const res = await post(storeBody, 'luna-mucevher.gloval.site')

    expect(res.status).toBe(200)
    expect(mocks.consumeCredits).toHaveBeenCalledWith('owner-1', 5, 'tryOn')
  })

  it('rejects a tenant host that does not match the store slug', async () => {
    const res = await post(storeBody, 'baska-magaza.gloval.site')

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ ok: false, error: 'forbidden_origin' })
    expect(mocks.generateTryOnImage).not.toHaveBeenCalled()
  })

  it('rejects a cross-site Origin even when the Host is the store', async () => {
    const res = await post(storeBody, 'luna-mucevher.gloval.site', { origin: 'https://evil.example' })

    expect(res.status).toBe(403)
    expect(mocks.getTryOnConfigForStore).not.toHaveBeenCalled()
  })

  it('rejects requests with neither Origin nor Referer', async () => {
    const { POST } = await import('./route')
    const res = await POST(
      new Request('https://gloval.ai/api/try-on', {
        method: 'POST',
        headers: { host: 'gloval.ai', 'x-forwarded-for': '10.9.9.9' },
        body: JSON.stringify(demoBody),
      }),
    )

    expect(res.status).toBe(403)
  })

  it('accepts a bound custom domain only for its own published store', async () => {
    mocks.resolveActiveDomainForHost.mockResolvedValue({ websiteProjectId: 'p1' })
    mocks.getPublishedSlugForProjectId.mockResolvedValue('luna-mucevher')
    mocks.getTryOnConfigForStore.mockResolvedValue({ projectId: 'p1', ownerId: 'owner-1' })
    mocks.getCreditBalance.mockResolvedValue(100)
    mocks.generateTryOnImage.mockResolvedValue({ dataUrl: 'data:image/png;base64,AAAA' })

    expect((await post(storeBody, 'www.luna.com.tr')).status).toBe(200)
    expect((await post({ ...storeBody, storeSlug: 'baska-magaza' }, 'www.luna.com.tr')).status).toBe(403)
  })

  it('does not charge or generate for a store without try-on enabled', async () => {
    mocks.getTryOnConfigForStore.mockResolvedValue(null)
    const res = await post(storeBody, 'luna-mucevher.gloval.site')

    expect(res.status).toBe(404)
    expect(mocks.generateTryOnImage).not.toHaveBeenCalled()
    expect(mocks.consumeCredits).not.toHaveBeenCalled()
  })

  it('returns 429 JSON when the durable per-IP limit is reached', async () => {
    mocks.reserveAnonSubjects.mockResolvedValue({ allowed: false, limit: 12, resetAt: new Date().toISOString() })
    const res = await post(demoBody)

    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ ok: false, error: 'rate_limited' })
    expect(mocks.generateTryOnImage).not.toHaveBeenCalled()
  })

  it('meters a store on its own daily subject with the default cap of 100', async () => {
    mocks.getTryOnConfigForStore.mockResolvedValue({ projectId: 'p1', ownerId: 'owner-1' })
    mocks.getCreditBalance.mockResolvedValue(100)
    mocks.generateTryOnImage.mockResolvedValue({ dataUrl: 'data:image/png;base64,AAAA' })
    await post(storeBody, 'luna-mucevher.gloval.site')

    expect(mocks.reserveAnonSubjects).toHaveBeenCalledWith([
      { subject: 'tryon-ip:hashed-ip', limit: 12 },
      { subject: 'tryon-store:luna-mucevher', limit: 100 },
    ])
  })

  it('does not meter the shared store counter in demo mode', async () => {
    mocks.generateTryOnImage.mockResolvedValue({ dataUrl: 'data:image/png;base64,AAAA' })
    await post(demoBody)

    expect(mocks.reserveAnonSubjects).toHaveBeenCalledWith([{ subject: 'tryon-ip:hashed-ip', limit: 12 }])
  })

  it('returns store_daily_limit and keeps the owner credits when the store cap is reached', async () => {
    mocks.getTryOnConfigForStore.mockResolvedValue({ projectId: 'p1', ownerId: 'owner-1' })
    mocks.getCreditBalance.mockResolvedValue(100)
    mocks.reserveAnonSubjects.mockResolvedValue({
      allowed: false,
      limit: 100,
      resetAt: new Date().toISOString(),
      failedSubject: 'tryon-store:luna-mucevher',
    })
    const res = await post(storeBody, 'luna-mucevher.gloval.site')

    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ ok: false, error: 'store_daily_limit' })
    expect(mocks.generateTryOnImage).not.toHaveBeenCalled()
    expect(mocks.consumeCredits).not.toHaveBeenCalled()
  })

  it('keeps reporting rate_limited when the per-IP cap is what was hit in a store', async () => {
    mocks.getTryOnConfigForStore.mockResolvedValue({ projectId: 'p1', ownerId: 'owner-1' })
    mocks.getCreditBalance.mockResolvedValue(100)
    mocks.reserveAnonSubjects.mockResolvedValue({
      allowed: false,
      limit: 12,
      resetAt: new Date().toISOString(),
      failedSubject: 'tryon-ip:hashed-ip',
    })
    const res = await post(storeBody, 'luna-mucevher.gloval.site')

    expect(await res.json()).toEqual({ ok: false, error: 'rate_limited' })
  })

  it('honours the TRY_ON_STORE_DAILY_LIMIT override', async () => {
    vi.stubEnv('TRY_ON_STORE_DAILY_LIMIT', '7')
    mocks.getTryOnConfigForStore.mockResolvedValue({ projectId: 'p1', ownerId: 'owner-1' })
    mocks.getCreditBalance.mockResolvedValue(100)
    mocks.generateTryOnImage.mockResolvedValue({ dataUrl: 'data:image/png;base64,AAAA' })
    await post(storeBody, 'luna-mucevher.gloval.site')
    vi.unstubAllEnvs()

    expect(mocks.reserveAnonSubjects.mock.calls[0][0][1]).toEqual({ subject: 'tryon-store:luna-mucevher', limit: 7 })
  })

  it('releases the reserved slot when generation fails', async () => {
    mocks.generateTryOnImage.mockResolvedValue({ error: 'failed' })
    await post(demoBody)

    expect(mocks.releaseAnonAiActions).toHaveBeenCalledWith(['tryon-ip:hashed-ip'])
  })

  it('rejects an oversized photo before any metering', async () => {
    const huge = `data:image/jpeg;base64,${'A'.repeat(8_000_001)}`
    const res = await post({ ...demoBody, personPhoto: huge })

    expect(res.status).toBe(400)
    expect(mocks.reserveAnonSubjects).not.toHaveBeenCalled()
  })

  it('rejects a non-image data URL photo', async () => {
    const res = await post({ ...demoBody, personPhoto: 'data:text/html;base64,PGI+' })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ ok: false, error: 'invalid_photo' })
  })
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
