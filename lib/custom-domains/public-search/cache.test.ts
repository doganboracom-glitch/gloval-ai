import { describe, expect, it } from 'vitest'
import { TtlCache } from './cache'

describe('TtlCache', () => {
  it('serves hits within the ttl and reloads after it', async () => {
    let t = 0
    const cache = new TtlCache<number>(1000, 10, () => t)
    let calls = 0
    const load = async () => ++calls
    expect(await cache.getOrLoad('k', load)).toBe(1)
    t = 999
    expect(await cache.getOrLoad('k', load)).toBe(1)
    t = 1000
    expect(await cache.getOrLoad('k', load)).toBe(2)
  })

  it('de-duplicates concurrent loads', async () => {
    const cache = new TtlCache<number>(1000)
    let calls = 0
    const load = async () => {
      calls += 1
      await Promise.resolve()
      return 7
    }
    const values = await Promise.all([cache.getOrLoad('k', load), cache.getOrLoad('k', load)])
    expect(values).toEqual([7, 7])
    expect(calls).toBe(1)
  })

  it('does not store failures', async () => {
    const cache = new TtlCache<number>(1000)
    await expect(cache.getOrLoad('k', async () => Promise.reject(new Error('x')))).rejects.toThrow('x')
    expect(await cache.getOrLoad('k', async () => 5)).toBe(5)
  })

  it('stays within maxEntries', async () => {
    const cache = new TtlCache<number>(1000, 2)
    await cache.getOrLoad('a', async () => 1)
    await cache.getOrLoad('b', async () => 2)
    await cache.getOrLoad('c', async () => 3)
    let reloaded = 0
    await cache.getOrLoad('a', async () => ++reloaded)
    expect(reloaded).toBe(1)
  })
})
