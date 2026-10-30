import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nonCritical, withOneRetry } from '@/lib/dashboard-resilience'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('nonCritical', () => {
  it('returns the value when the read succeeds', async () => {
    await expect(nonCritical('x', async () => 7, 0)).resolves.toBe(7)
  })

  it('returns the fallback when the read rejects', async () => {
    await expect(
      nonCritical('x', async () => Promise.reject(new Error('boom')), 0),
    ).resolves.toBe(0)
  })

  it('returns the fallback when the read throws synchronously', async () => {
    await expect(
      nonCritical(
        'x',
        () => {
          throw new Error('missing env')
        },
        [] as string[],
      ),
    ).resolves.toEqual([])
  })
})

describe('withOneRetry', () => {
  it('does not retry when the first attempt succeeds', async () => {
    const read = vi.fn().mockResolvedValue('ok')
    await expect(withOneRetry('x', read, 0)).resolves.toBe('ok')
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('retries exactly once and returns the second result', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('blip')).mockResolvedValueOnce('ok')
    await expect(withOneRetry('x', read, 0)).resolves.toBe('ok')
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('rethrows the second failure without a third attempt', async () => {
    const read = vi.fn().mockRejectedValue(new Error('down'))
    await expect(withOneRetry('x', read, 0)).rejects.toThrow('down')
    expect(read).toHaveBeenCalledTimes(2)
  })
})
