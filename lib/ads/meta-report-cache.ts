export const META_REPORT_CACHE_TTL_MS = 90_000
const MAX_ENTRIES = 200

type Entry<T> = { value: T; expiresAt: number }

/**
 * Short-lived per-instance cache with in-flight de-duplication, so a dashboard load (or several tabs) never
 * triggers the same Graph read twice within the TTL. Failures are never cached.
 */
export function createMetaReportCache<T>(options: { ttlMs?: number; now?: () => number } = {}) {
  const ttlMs = options.ttlMs ?? META_REPORT_CACHE_TTL_MS
  const now = options.now ?? Date.now
  const entries = new Map<string, Entry<T>>()
  const inflight = new Map<string, Promise<T>>()

  function prune() {
    const current = now()
    for (const [key, entry] of entries) if (entry.expiresAt <= current) entries.delete(key)
    while (entries.size > MAX_ENTRIES) {
      const oldest = entries.keys().next().value
      if (oldest === undefined) break
      entries.delete(oldest)
    }
  }

  return {
    async get(key: string, load: () => Promise<T>): Promise<{ value: T; cached: boolean }> {
      const hit = entries.get(key)
      if (hit && hit.expiresAt > now()) return { value: hit.value, cached: true }

      const pending = inflight.get(key)
      if (pending) return { value: await pending, cached: true }

      const promise = load()
      inflight.set(key, promise)
      try {
        const value = await promise
        entries.set(key, { value, expiresAt: now() + ttlMs })
        prune()
        return { value, cached: false }
      } finally {
        inflight.delete(key)
      }
    },
    invalidate(prefix: string) {
      for (const key of entries.keys()) if (key.startsWith(prefix)) entries.delete(key)
    },
    size: () => entries.size,
  }
}
