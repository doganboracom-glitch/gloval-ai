import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_IMAGE_FALLBACK_MODEL,
  DEFAULT_IMAGE_QUALITY_MODEL,
  IMAGE_FAILURE_REASONS,
  generateWithModelFallback,
  getImageFallbackModel,
  resolveImageModel,
} from './image-provider'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('image model strategy', () => {
  it('preserves IMAGE_MODEL as the explicit override and uses the quality default otherwise', () => {
    vi.stubEnv('IMAGE_MODEL', '')
    vi.stubEnv('IMAGE_MODEL_QUALITY', '')
    expect(resolveImageModel()).toBe(DEFAULT_IMAGE_QUALITY_MODEL)

    vi.stubEnv('IMAGE_MODEL_QUALITY', 'custom/quality')
    expect(resolveImageModel()).toBe('custom/quality')

    vi.stubEnv('IMAGE_MODEL', 'custom/override')
    expect(resolveImageModel()).toBe('custom/override')
  })

  it('keeps FLUX.2 Klein as the default fast fallback and allows an environment override', () => {
    vi.stubEnv('IMAGE_MODEL_FALLBACK', '')
    expect(getImageFallbackModel()).toBe(DEFAULT_IMAGE_FALLBACK_MODEL)
    vi.stubEnv('IMAGE_MODEL_FALLBACK', 'custom/fast')
    expect(getImageFallbackModel()).toBe('custom/fast')
  })

  it('switches to the fast model when the quality attempt times out and aborts it', async () => {
    let qualityAborted = false
    const generate = vi.fn(async (model: string, signal: AbortSignal) => {
      if (model === 'quality/model') {
        await new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => {
            qualityAborted = true
            resolve()
          }, { once: true })
        })
        return null
      }
      return { src: 'fast-image' }
    })

    const result = await generateWithModelFallback(generate, {
      primaryModel: 'quality/model',
      fallbackModel: 'fast/model',
      primaryTimeoutMs: 5,
      fallbackTimeoutMs: 100,
    })

    expect(result).toEqual({ result: { src: 'fast-image' }, model: 'fast/model', fallbackUsed: true })
    expect(qualityAborted).toBe(true)
    expect(generate.mock.calls.map(([model]) => model)).toEqual(['quality/model', 'fast/model'])
  })

  it('reports timeout when both quality and fallback attempts fail after a timeout', async () => {
    const result = await generateWithModelFallback(
      async (_model, signal) => new Promise<null>((resolve) => {
        signal.addEventListener('abort', () => resolve(null), { once: true })
      }),
      {
        primaryModel: 'quality/model',
        fallbackModel: 'fast/model',
        primaryTimeoutMs: 5,
        fallbackTimeoutMs: 5,
      },
    )

    expect(result).toEqual({
      result: null,
      reason: 'timeout',
      model: 'fast/model',
      fallbackUsed: true,
    })
  })

  it('keeps the public failure-reason vocabulary stable', () => {
    expect(IMAGE_FAILURE_REASONS).toEqual([
      'low_confidence_skipped',
      'timeout',
      'provider_error',
      'storage_failed',
      'text_guard_exhausted',
      'relevance_mismatch',
      'disabled',
    ])
  })
})
