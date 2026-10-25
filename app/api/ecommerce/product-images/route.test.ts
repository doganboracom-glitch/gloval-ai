import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PRODUCT_IMAGE_LIMITS, PRODUCT_IMAGE_UPLOAD_RATE } from '@/lib/product-images'

const requireOwned = vi.fn()
const upload = vi.fn(async () => ({}))

vi.mock('@/lib/api-auth', () => ({ rejectAnonymous: async () => null }))
vi.mock('@/lib/ecommerce-access', () => ({
  requireOwnedEcommerceProject: (...args: unknown[]) => requireOwned(...args),
}))
vi.mock('@/lib/product-image-store', () => ({
  createProductImageStore: () => ({
    storageBase: 'https://cdn.example.test/public/site-images/',
    upload,
    remove: vi.fn(async () => ({})),
    publicUrl: (path: string) => `https://cdn.example.test/public/site-images/${path}`,
  }),
}))

const PROJECT = '11111111-1111-4111-8111-111111111111'

function uploadRequest(file: Uint8Array, headers: Record<string, string> = {}) {
  const form = new FormData()
  form.set('projectId', PROJECT)
  form.set('file', new File([file as BlobPart], 'photo.jpg', { type: 'image/jpeg' }))
  return new Request('http://localhost/api/ecommerce/product-images', { method: 'POST', body: form, headers })
}

async function post(request: Request) {
  const { POST } = await import('./route')
  return POST(request)
}

let userCounter = 0
const nextUser = () => `user-${++userCounter}-${Math.random().toString(36).slice(2)}`

beforeEach(() => {
  upload.mockClear()
  requireOwned.mockReset()
  requireOwned.mockImplementation(async () => ({ actorId: 'default-user' }))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('POST /api/ecommerce/product-images', () => {
  it('stores a valid image and returns its URL', async () => {
    const actorId = nextUser()
    requireOwned.mockResolvedValue({ actorId })
    const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#336699' } }).jpeg().toBuffer()

    const res = await post(uploadRequest(jpeg))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.url).toContain(`products/${PROJECT}/`)
  })

  it('answers 401 without a session and exposes no internals', async () => {
    requireOwned.mockRejectedValue(new Error('UNAUTHENTICATED'))
    const res = await post(uploadRequest(Buffer.from('x')))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ ok: false, error: 'unauthenticated' })
    expect(upload).not.toHaveBeenCalled()
  })

  it('answers 403 when the project is not the caller\'s', async () => {
    requireOwned.mockRejectedValue(new Error('NOT_FOUND'))
    const res = await post(uploadRequest(Buffer.from('x')))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ ok: false, error: 'forbidden' })
    expect(upload).not.toHaveBeenCalled()
  })

  it('answers a generic 500 when access checking itself breaks', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    requireOwned.mockRejectedValue(new Error('relation "projects" does not exist'))
    const res = await post(uploadRequest(Buffer.from('x')))
    const text = await res.text()
    expect(res.status).toBe(500)
    expect(JSON.parse(text)).toEqual({ ok: false, error: 'server_error' })
    expect(text).not.toContain('relation')
    spy.mockRestore()
  })

  it('rejects an oversized body before reading it (413, Turkish-mapped error code)', async () => {
    const res = await post(
      uploadRequest(Buffer.from('x'), { 'content-length': String(PRODUCT_IMAGE_LIMITS.maxBytes + 512 * 1024) }),
    )
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ ok: false, error: 'too_large' })
    expect(requireOwned).not.toHaveBeenCalled()
  })

  it('rejects a file just over 4 MB with 413', async () => {
    requireOwned.mockResolvedValue({ actorId: nextUser() })
    const res = await post(uploadRequest(Buffer.alloc(PRODUCT_IMAGE_LIMITS.maxBytes + 1, 0xff)))
    expect(res.status).toBe(413)
    expect((await res.json()).error).toBe('too_large')
  })

  it('rejects a fake .jpg whose content is not an image with 415', async () => {
    requireOwned.mockResolvedValue({ actorId: nextUser() })
    const res = await post(uploadRequest(Buffer.from('MZ\x90\x00 this is an executable')))
    expect(res.status).toBe(415)
    expect((await res.json()).error).toBe('unsupported_type')
    expect(upload).not.toHaveBeenCalled()
  })

  it('limits each user to 40 uploads per 10 minutes, per user, and resets after the window', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-01-01T10:00:00Z'))
    const heavyUser = nextUser()
    const otherUser = nextUser()
    expect(PRODUCT_IMAGE_UPLOAD_RATE).toEqual({ limit: 40, windowMs: 10 * 60 * 1000 })

    requireOwned.mockResolvedValue({ actorId: heavyUser })
    for (let i = 0; i < PRODUCT_IMAGE_UPLOAD_RATE.limit; i++) {
      const res = await post(uploadRequest(Buffer.from('not an image')))
      expect(res.status).toBe(415)
    }

    const blocked = await post(uploadRequest(Buffer.from('not an image')))
    expect(blocked.status).toBe(429)
    expect(await blocked.json()).toEqual({ ok: false, error: 'rate_limited' })
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)

    requireOwned.mockResolvedValue({ actorId: otherUser })
    expect((await post(uploadRequest(Buffer.from('not an image')))).status).toBe(415)

    vi.setSystemTime(new Date('2026-01-01T10:10:01Z'))
    requireOwned.mockResolvedValue({ actorId: heavyUser })
    expect((await post(uploadRequest(Buffer.from('not an image')))).status).toBe(415)
  })
})
