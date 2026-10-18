import { afterEach, describe, expect, it } from 'vitest'
import { blogNow, clockOffsetMs, noteServerTime, resetBlogClock } from './blog-clock'
import { blogSettingsSchema } from './website-schema'

afterEach(() => resetBlogClock())

describe('blog clock (root cause of the false "Planlı" label)', () => {
  const published = '2026-10-18T10:27:01.611Z'

  it('a post stamped by the server is never "future" when the browser clock runs behind', () => {
    const browserBehind = Date.parse(published) - 90_000
    expect(Date.parse(published) > browserBehind).toBe(true)

    noteServerTime(published, browserBehind)
    expect(blogNow(browserBehind).getTime()).toBe(Date.parse(published))
    expect(Date.parse(published) > blogNow(browserBehind).getTime()).toBe(false)
  })

  it('falls back to the browser clock without a server time', () => {
    expect(clockOffsetMs(undefined, 1_000)).toBe(0)
    expect(clockOffsetMs('not-a-date', 1_000)).toBe(0)
    expect(blogNow(5_000).getTime()).toBe(5_000)
  })
})

describe('starter card dismissal is a persisted project setting', () => {
  it('round-trips through the project schema (database), not browser storage', () => {
    const parsed = blogSettingsSchema.parse({ starterCardDismissed: true })
    expect(parsed.starterCardDismissed).toBe(true)
    expect(JSON.parse(JSON.stringify(parsed)).starterCardDismissed).toBe(true)
  })
})
