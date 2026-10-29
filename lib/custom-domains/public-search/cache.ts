/**
 * Small per-instance TTL cache with in-flight de-duplication, so a burst of
 * identical searches costs the registrar one call. Only successful loads are
 * stored; a rejected load is shared by the callers waiting on it and then
 * forgotten.
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>()
  private readonly inFlight = new Map<string, Promise<T>>()

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500,
    private readonly now: () => number = Date.now,
  ) {}

  async getOrLoad(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key)
    if (hit && hit.expiresAt > this.now()) return hit.value
    if (hit) this.entries.delete(key)

    const pending = this.inFlight.get(key)
    if (pending) return pending

    const promise = load()
      .then((value) => {
        this.store(key, value)
        return value
      })
      .finally(() => this.inFlight.delete(key))
    this.inFlight.set(key, promise)
    return promise
  }

  private store(key: string, value: T) {
    if (this.entries.size >= this.maxEntries) {
      const t = this.now()
      for (const [k, v] of this.entries) if (v.expiresAt <= t) this.entries.delete(k)
      if (this.entries.size >= this.maxEntries) {
        const oldest = this.entries.keys().next().value
        if (oldest !== undefined) this.entries.delete(oldest)
      }
    }
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs })
  }
}
