import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const upload = vi.fn()
const createBucket = vi.fn()
const getPublicUrl = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: {
      createBucket: (...args: unknown[]) => createBucket(...args),
      from: () => ({
        upload: (...args: unknown[]) => upload(...args),
        getPublicUrl: (...args: unknown[]) => getPublicUrl(...args),
      }),
    },
  }),
}))

import {
  IMAGE_STORAGE_ERROR_CODE,
  IMAGE_STORAGE_USER_MESSAGE,
  ImageStorageError,
  imageStorageErrorResponse,
  persistImageDataUri,
} from '@/lib/image-storage'

const DATA_URI = `data:image/png;base64,${Buffer.from('fake-png-bytes').toString('base64')}`

beforeEach(() => {
  upload.mockReset()
  createBucket.mockReset()
  getPublicUrl.mockReset()
  createBucket.mockResolvedValue({ error: null })
  upload.mockResolvedValue({ error: null })
  getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn.example/site-images/generated/abc.png' } })
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('persistImageDataUri', () => {
  it('returns the short public URL on success (unchanged behaviour)', async () => {
    const url = await persistImageDataUri(DATA_URI)
    expect(url).toBe('https://cdn.example/site-images/generated/abc.png')
    expect(url.length).toBeLessThan(200)
    expect(url.startsWith('data:')).toBe(false)
  })

  it('passes non-data inputs through untouched without touching storage', async () => {
    expect(await persistImageDataUri('https://img.example/a.jpg')).toBe('https://img.example/a.jpg')
    expect(await persistImageDataUri('/images/a.jpg')).toBe('/images/a.jpg')
    expect(await persistImageDataUri('')).toBe('')
    expect(upload).not.toHaveBeenCalled()
  })

  it('throws ImageStorageError with a short Turkish message when the upload fails', async () => {
    upload.mockResolvedValue({ error: { message: 'bucket offline' } })

    const err = await persistImageDataUri(DATA_URI).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ImageStorageError)
    const typed = err as ImageStorageError
    expect(typed.code).toBe(IMAGE_STORAGE_ERROR_CODE)
    expect(typed.userMessage).toBe(IMAGE_STORAGE_USER_MESSAGE)
    expect(typed.userMessage.length).toBeLessThan(160)
    expect(typed.message).toContain('bucket offline')
    expect(console.error).toHaveBeenCalled()
  })

  it('throws when storage throws, is not configured, or returns no public URL', async () => {
    upload.mockRejectedValueOnce(new Error('network reset'))
    await expect(persistImageDataUri(DATA_URI)).rejects.toBeInstanceOf(ImageStorageError)

    getPublicUrl.mockReturnValueOnce({ data: { publicUrl: undefined } })
    await expect(persistImageDataUri(DATA_URI)).rejects.toBeInstanceOf(ImageStorageError)

    vi.stubEnv('SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    await expect(persistImageDataUri(DATA_URI)).rejects.toBeInstanceOf(ImageStorageError)
  })

  it('throws on a malformed data URI instead of returning it', async () => {
    await expect(persistImageDataUri('data:image/png,not-base64')).rejects.toBeInstanceOf(ImageStorageError)
  })

  it('never leaks the raw base64 into the error', async () => {
    upload.mockResolvedValue({ error: { message: 'boom' } })
    const err = (await persistImageDataUri(DATA_URI).catch((e: unknown) => e)) as ImageStorageError
    expect(err.message).not.toContain('base64')
    expect(err.userMessage).not.toContain('base64')
  })
})

describe('imageStorageErrorResponse', () => {
  it('is a 502 with the user message and charged: 0', async () => {
    const res = imageStorageErrorResponse()
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({
      error: IMAGE_STORAGE_ERROR_CODE,
      message: IMAGE_STORAGE_USER_MESSAGE,
      charged: 0,
    })
  })
})
