import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'
import { normalizeProductInput } from '@/lib/product-input'
import { processProductImage } from '@/lib/product-image-pipeline'
import { uploadProductImage, type UploadDeps } from '@/lib/product-image-service'
import {
  PRODUCT_IMAGE_ERROR_MESSAGES,
  PRODUCT_IMAGE_LIMITS,
  getProductGallery,
  normalizeProductImages,
  parseProductImagesInput,
  prepareProductImagesForSave,
} from '@/lib/product-images'

const BASE = 'https://cdn.example.test/storage/v1/object/public/site-images/'
const PROJECT_A = '11111111-1111-4111-8111-111111111111'
const PROJECT_B = '22222222-2222-4222-8222-222222222222'
const FILE_ID = '33333333-3333-4333-8333-333333333333'

const ownUrl = (projectId: string, fileId = FILE_ID) => `${BASE}products/${projectId}/${fileId}.webp`

async function realJpeg() {
  return sharp({ create: { width: 16, height: 16, channels: 3, background: '#cc3322' } })
    .jpeg()
    .toBuffer()
}

function makeDeps(overrides: Partial<UploadDeps> = {}) {
  const upload = vi.fn(async () => ({}))
  const deps: UploadDeps = {
    authorize: async () => ({ actorId: 'user-1' }),
    store: {
      storageBase: BASE,
      upload,
      remove: vi.fn(async () => ({})),
      publicUrl: (path) => `${BASE}${path}`,
    },
    newId: () => FILE_ID,
    ...overrides,
  }
  return { deps, upload }
}

describe('4 MB upload limit', () => {
  it('is 4 MB, below the ~4.5 MB serverless body cap', () => {
    expect(PRODUCT_IMAGE_LIMITS.maxBytes).toBe(4 * 1024 * 1024)
    expect(PRODUCT_IMAGE_ERROR_MESSAGES.too_large).toContain('4 MB')
  })

  it('rejects a file just over 4 MB with the Turkish size error', async () => {
    const oversized = Buffer.alloc(PRODUCT_IMAGE_LIMITS.maxBytes + 1, 0xff)
    expect(await processProductImage(oversized)).toEqual({ ok: false, error: 'too_large' })

    const { deps, upload } = makeDeps()
    const result = await uploadProductImage(deps, PROJECT_A, oversized)
    expect(result).toMatchObject({ ok: false, status: 413, error: 'too_large' })
    expect(upload).not.toHaveBeenCalled()
  })

  it('accepts a real JPEG and re-encodes it to webp inside the authorized project folder', async () => {
    const { deps, upload } = makeDeps()
    const result = await uploadProductImage(deps, PROJECT_A.toUpperCase(), await realJpeg())
    expect(result).toMatchObject({ ok: true, url: ownUrl(PROJECT_A) })
    expect(upload).toHaveBeenCalledWith(`products/${PROJECT_A}/${FILE_ID}.webp`, expect.any(Buffer), 'image/webp')
  })
})

describe('content sniffing', () => {
  it('rejects a file with an image extension whose bytes are not an image', async () => {
    const fake = Buffer.from('<html><script>alert(1)</script></html>')
    const { deps, upload } = makeDeps()
    const result = await uploadProductImage(deps, PROJECT_A, fake)
    expect(result).toMatchObject({ ok: false, status: 415, error: 'unsupported_type' })
    expect(upload).not.toHaveBeenCalled()
  })

  it('rejects a JPEG header followed by garbage as corrupt', async () => {
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('not really a jpeg')])
    const { deps, upload } = makeDeps()
    const result = await uploadProductImage(deps, PROJECT_A, broken)
    expect(result).toMatchObject({ ok: false, status: 415, error: 'corrupt' })
    expect(upload).not.toHaveBeenCalled()
  })
})

describe('authorization and quota', () => {
  it('returns 401 without a session, 403 for a project that is not theirs, and no internals', async () => {
    const unauthenticated = makeDeps({
      authorize: async () => {
        throw new Error('UNAUTHENTICATED')
      },
    })
    expect(await uploadProductImage(unauthenticated.deps, PROJECT_A, await realJpeg())).toEqual({
      ok: false,
      status: 401,
      error: 'unauthenticated',
    })

    const foreign = makeDeps({
      authorize: async () => {
        throw new Error('NOT_FOUND')
      },
    })
    expect(await uploadProductImage(foreign.deps, PROJECT_A, await realJpeg())).toEqual({
      ok: false,
      status: 403,
      error: 'forbidden',
    })
    expect(unauthenticated.upload).not.toHaveBeenCalled()
    expect(foreign.upload).not.toHaveBeenCalled()
  })

  it('turns an unexpected authorization failure into a generic 500 that leaks nothing', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { deps } = makeDeps({
      authorize: async () => {
        throw new Error('connect ECONNREFUSED db.internal:5432 password=hunter2')
      },
    })
    const result = await uploadProductImage(deps, PROJECT_A, await realJpeg())
    expect(result).toEqual({ ok: false, status: 500, error: 'server_error' })
    expect(JSON.stringify(result)).not.toContain('hunter2')
    spy.mockRestore()
  })

  it('does not consult the quota for callers who are not authorized', async () => {
    const rateLimit = vi.fn(() => ({ allowed: true, retryAfterMs: 0 }))
    const { deps } = makeDeps({
      rateLimit,
      authorize: async () => {
        throw new Error('NOT_FOUND')
      },
    })
    await uploadProductImage(deps, PROJECT_A, Buffer.from('x'))
    expect(rateLimit).not.toHaveBeenCalled()
  })
})

describe('gallery save rules (enforced on the server)', () => {
  const imageList = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      url: ownUrl(PROJECT_A, `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`),
      alt: '',
    }))

  it('accepts 8 images and rejects the 9th when a product is saved', () => {
    expect(() => normalizeProductInput({ name: 'Yüzük', priceCents: 1000, stock: 1, images: imageList(8) })).not.toThrow()
    expect(() => normalizeProductInput({ name: 'Yüzük', priceCents: 1000, stock: 1, images: imageList(9) })).toThrow(
      'INVALID_IMAGES',
    )
    expect(() => parseProductImagesInput(imageList(9))).toThrow('INVALID_IMAGES')
  })

  it('cannot attach another project\'s uploaded file or an arbitrary external URL', () => {
    const attach = (url: string) =>
      prepareProductImagesForSave({
        images: [{ url, alt: '' }],
        projectId: PROJECT_A,
        storageBase: BASE,
        existingUrls: [],
      })

    expect(() => attach(ownUrl(PROJECT_B))).toThrow('INVALID_IMAGE_URL')
    expect(() => attach('https://evil.example/cover.jpg')).toThrow('INVALID_IMAGE_URL')
    expect(attach(ownUrl(PROJECT_A)).images).toHaveLength(1)
  })

  it('does not let a foreign file ride along by being listed as an existing image of another product', () => {
    expect(() =>
      prepareProductImagesForSave({
        images: [{ url: ownUrl(PROJECT_B), alt: '' }],
        projectId: PROJECT_A,
        storageBase: BASE,
        existingUrls: [ownUrl(PROJECT_A)],
      }),
    ).toThrow('INVALID_IMAGE_URL')
  })
})

describe('legacy single-image products', () => {
  it('reads a plain URL string array as a gallery with empty alt text', () => {
    expect(normalizeProductImages(['https://old.example/a.jpg'])).toEqual([{ url: 'https://old.example/a.jpg', alt: '' }])
    expect(getProductGallery({ images: ['https://old.example/a.jpg'] })).toEqual([
      { url: 'https://old.example/a.jpg', alt: '' },
    ])
    expect(getProductGallery({ images: JSON.stringify(['https://old.example/a.jpg']) })).toHaveLength(1)
  })

  it('keeps the legacy cover on re-save and leaves its file alone (it is not ours to delete)', () => {
    const legacy = 'https://old.example/a.jpg'
    const result = prepareProductImagesForSave({
      images: [{ url: legacy, alt: 'Kapak' }, { url: ownUrl(PROJECT_A), alt: '' }],
      projectId: PROJECT_A,
      storageBase: BASE,
      existingUrls: [legacy],
    })
    expect(result.images.map((i) => i.url)).toEqual([legacy, ownUrl(PROJECT_A)])
    expect(result.removedPaths).toEqual([])
  })

  it('queues only this project\'s own removed files for cleanup', () => {
    const result = prepareProductImagesForSave({
      images: [],
      projectId: PROJECT_A,
      storageBase: BASE,
      existingUrls: [ownUrl(PROJECT_A), 'https://old.example/a.jpg', ownUrl(PROJECT_B)],
    })
    expect(result.removedPaths).toEqual([`products/${PROJECT_A}/${FILE_ID}.webp`])
  })
})
