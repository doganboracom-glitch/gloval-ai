import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { BLOG_ADMIN_LIMITS, checkBlogAdminLimit, type ReserveFn } from '@/lib/blog-admin-limit'

describe('checkBlogAdminLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => vi.useRealTimers())

  it('allows the request while every window has room', async () => {
    const reserve: ReserveFn = vi.fn(async () => ({ allowed: true }))
    await expect(checkBlogAdminLimit('u-1', 'ai', reserve)).resolves.toEqual({ allowed: true })
    expect(reserve).toHaveBeenCalledTimes(BLOG_ADMIN_LIMITS.ai.length)
    expect(reserve).toHaveBeenCalledWith('blogadm:ai:600:u-1', 5, 600)
    expect(reserve).toHaveBeenCalledWith('blogadm:ai:86400:u-1', 30, 86_400)
  })

  it('refuses over the limit and reports how long to wait', async () => {
    const reserve: ReserveFn = async () => ({ allowed: false, resetAt: '2026-01-01T00:00:42Z' })
    await expect(checkBlogAdminLimit('u-1', 'write', reserve)).resolves.toEqual({ allowed: false, retryAfterSeconds: 42 })
  })

  it('never reports a wait shorter than one second', async () => {
    const reserve: ReserveFn = async () => ({ allowed: false, resetAt: '2025-12-31T23:59:00Z' })
    const result = await checkBlogAdminLimit('u-1', 'upload', reserve)
    expect(result).toEqual({ allowed: false, retryAfterSeconds: 1 })
  })

  it('stops at the first exhausted window', async () => {
    const reserve = vi.fn<ReserveFn>(async () => ({ allowed: false, resetAt: '2026-01-01T00:05:00Z' }))
    await checkBlogAdminLimit('u-1', 'ai', reserve)
    expect(reserve).toHaveBeenCalledTimes(1)
  })

  it('fails closed when the counter cannot be reached', async () => {
    const reserve: ReserveFn = async () => null
    const result = await checkBlogAdminLimit('u-1', 'write', reserve)
    expect(result).toEqual({ allowed: false, retryAfterSeconds: BLOG_ADMIN_LIMITS.write[0].seconds })
  })

  it('scopes counters per user and per kind', async () => {
    const subjects: string[] = []
    const reserve: ReserveFn = async (subject) => (subjects.push(subject), { allowed: true })
    await checkBlogAdminLimit('a', 'write', reserve)
    await checkBlogAdminLimit('b', 'write', reserve)
    expect(new Set(subjects).size).toBe(2)
  })
})
