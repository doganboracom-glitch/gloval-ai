// @vitest-environment node
import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  guardMetaPublishRoute: vi.fn(),
  getMetaPlan: vi.fn(),
  download: vi.fn(),
  upload: vi.fn(),
  ensureMetaCreativeBucket: vi.fn(),
  metaPlanView: vi.fn(),
  setMetaPlanImage: vi.fn(),
}))

vi.mock('@/lib/ads/meta-plan-route', () => ({
  guardMetaPublishRoute: mocks.guardMetaPublishRoute,
  isUuid: (value: unknown) => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value),
}))

vi.mock('@/lib/ads/meta-plans-store', () => ({
  META_CREATIVE_BUCKET: 'meta-ad-creatives',
  ensureMetaCreativeBucket: mocks.ensureMetaCreativeBucket,
  getMetaPlan: mocks.getMetaPlan,
  metaPlanView: mocks.metaPlanView,
  setMetaPlanImage: mocks.setMetaPlanImage,
}))

vi.mock('@/lib/ads/meta-route-utils', () => ({
  metaAdsJson: (body: unknown, status = 200) => Response.json(body, { status }),
  metaAdsErrorResponse: () => Response.json({ ok: false, error: 'image_invalid' }, { status: 422 }),
}))

import { GET, POST } from './route'

const userId = 'f1234567-1234-4234-8234-123456789abc'
const planId = '0b9c1a2e-1234-4234-8234-123456789abc'
const imageId = '9f23a5a1-1234-4e76-bac3-11a9e1234567'
const imagePath = `${userId}/${imageId}.png`

function makePng() {
  const bytes = new Uint8Array(25)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, 800)
  view.setUint32(20, 800)
  return bytes
}

const imageBytes = makePng()
const imageHash = createHash('sha256').update(imageBytes).digest('hex')
const admin = {
  storage: {
    from: vi.fn(() => ({ download: mocks.download, upload: mocks.upload })),
  },
}

function request() {
  return new Request(`https://gloval.test/api/ads/meta/plans/image?planId=${planId}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.guardMetaPublishRoute.mockResolvedValue({ ok: true, access: { userId }, admin })
  mocks.getMetaPlan.mockResolvedValue({
    content: { imagePath, imageFilename: 'saved-campaign.png' },
    image_sha256: imageHash,
  })
  mocks.download.mockResolvedValue({
    data: new Blob([imageBytes.buffer as ArrayBuffer]),
    error: null,
  })
})

describe('Meta plan image preview route', () => {
  it('serves only the authenticated plan image after checking its stored hash', async () => {
    const response = await GET(request())

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual(Array.from(imageBytes))
    expect(mocks.getMetaPlan).toHaveBeenCalledWith(admin, userId, planId)
    expect(mocks.download).toHaveBeenCalledWith(imagePath)
  })

  it('does not serve a creative whose bytes do not match the stored hash', async () => {
    mocks.getMetaPlan.mockResolvedValueOnce({
      content: { imagePath, imageFilename: 'saved-campaign.png' },
      image_sha256: '0'.repeat(64),
    })

    const response = await GET(request())

    expect(response.ok).toBe(false)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toMatchObject({ ok: false, error: 'image_invalid' })
  })

  it('does not read a path outside the signed-in user namespace', async () => {
    mocks.getMetaPlan.mockResolvedValueOnce({
      content: { imagePath: `another-user/${imageId}.png` },
      image_sha256: imageHash,
    })

    const response = await GET(request())

    expect(response.status).toBe(404)
    expect(mocks.download).not.toHaveBeenCalled()
  })

  it('stores the selected filename with the verified uploaded bytes', async () => {
    mocks.upload.mockResolvedValue({ error: null })
    mocks.ensureMetaCreativeBucket.mockResolvedValue(undefined)
    mocks.setMetaPlanImage.mockResolvedValue({ content: { imagePath, imageFilename: 'summer-ad.png' }, image_sha256: imageHash })
    mocks.metaPlanView.mockReturnValue({ id: planId, hasStoredImage: true })
    const form = new FormData()
    form.set('planId', planId)
    form.set('file', new File([imageBytes.buffer as ArrayBuffer], 'summer-ad.png', { type: 'image/png' }))

    const response = await POST(new Request(`https://gloval.test/api/ads/meta/plans/image`, { method: 'POST', body: form }))

    expect(response.status).toBe(200)
    expect(mocks.setMetaPlanImage).toHaveBeenCalledWith(
      admin,
      expect.any(Object),
      expect.any(String),
      imageHash,
      'summer-ad.png',
    )
  })
})
