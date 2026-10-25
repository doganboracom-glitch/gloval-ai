import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  IMAGE_FAILED_CODE,
  IMAGE_FAILED_USER_MESSAGE,
  imageGenerationFailedResponse,
  outOfCreditsMessage,
  sanitizeFailureReason,
} from '@/lib/image-failure'
import { readImageStorageFailure } from '@/lib/image-storage-error'

afterEach(() => vi.restoreAllMocks())

describe('out-of-credits message', () => {
  it('names the remaining balance and the upgrade path', () => {
    expect(outOfCreditsMessage(3)).toBe('Yeterli AI krediniz yok. Kalan: 3. Paketinizi yükseltin.')
    expect(outOfCreditsMessage(0)).toContain('Kalan: 0')
  })

  it('omits the balance when it is unknown', () => {
    expect(outOfCreditsMessage(null)).toBe('Yeterli AI krediniz yok. Paketinizi yükseltin.')
  })
})

describe('generation-failed response', () => {
  it('is a 502 "no credit charged" response, distinct from the 402 credits one', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const res = imageGenerationFailedResponse('hero-image', new Error('provider timeout'))
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body).toEqual({ error: IMAGE_FAILED_CODE, message: IMAGE_FAILED_USER_MESSAGE, charged: false })
    expect(IMAGE_FAILED_USER_MESSAGE).toBe('Görsel şu an üretilemedi, kredi düşülmedi, tekrar deneyin.')
    expect(IMAGE_FAILED_USER_MESSAGE).not.toContain('Yeterli AI krediniz yok')
  })

  it('logs the real cause without personal data', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    imageGenerationFailedResponse(
      'section-image',
      new Error(
        'upstream 500 for ayse@example.com at https://api.provider.test/v1?key=abc user 3f2b8c1e-1111-4222-8333-444455556666',
      ),
    )
    const line = String(spy.mock.calls[0]?.[0])
    expect(line).toContain('route=section-image')
    expect(line).toContain('upstream 500')
    expect(line).not.toContain('ayse@example.com')
    expect(line).not.toContain('api.provider.test')
    expect(line).not.toContain('3f2b8c1e')
  })

  it('strips long opaque tokens and keeps the error class', () => {
    const reason = sanitizeFailureReason(
      Object.assign(new TypeError('bad token abcdefghijklmnopqrstuvwxyz0123456789ABCD'), {}),
    )
    expect(reason.startsWith('TypeError:')).toBe(true)
    expect(reason).not.toContain('abcdefghijklmnopqrstuvwxyz')
  })

  it('is recognised by the client reader, 402 is not', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const failed = imageGenerationFailedResponse('hero-image', new Error('x'))
    expect(await readImageStorageFailure(failed)).toBe(IMAGE_FAILED_USER_MESSAGE)

    const noCredits = Response.json({ error: 'Out of credits', balance: 2 }, { status: 402 })
    expect(await readImageStorageFailure(noCredits)).toBeNull()
  })
})
