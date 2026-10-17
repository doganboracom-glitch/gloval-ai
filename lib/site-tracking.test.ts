import { describe, expect, it } from 'vitest'
import { canUseTrackingCode, enforceTrackingPlan } from '@/lib/site-tracking'
import type { WebsiteSchema } from '@/lib/website-schema'

function site(tracking?: { head?: string }): WebsiteSchema {
  return { name: 'Demo', pages: [], ...(tracking ? { tracking } : {}) } as unknown as WebsiteSchema
}

describe('canUseTrackingCode', () => {
  it('is closed on FREE and open on every paid plan', () => {
    expect(canUseTrackingCode('free')).toBe(false)
    expect(canUseTrackingCode('starter')).toBe(true)
    expect(canUseTrackingCode('pro')).toBe(true)
    expect(canUseTrackingCode('ecommerce')).toBe(true)
  })
})

describe('enforceTrackingPlan', () => {
  const meta = '<meta name="google-site-verification" content="abc" />'

  it('lets paid plans change tracking freely', () => {
    const next = site({ head: meta })
    expect(enforceTrackingPlan(next, site(), 'starter')).toBe(next)
  })

  it('keeps the stored tracking on FREE, ignoring what was submitted', () => {
    const result = enforceTrackingPlan(site({ head: '<script>evil()</script>' }), site({ head: meta }), 'free')
    expect(result.tracking).toEqual({ head: meta })
  })

  it('drops submitted tracking on FREE when nothing was stored', () => {
    const result = enforceTrackingPlan(site({ head: meta }), site(), 'free')
    expect(result.tracking).toBeUndefined()
    expect('tracking' in result).toBe(false)
  })

  it('leaves a site without tracking untouched on FREE', () => {
    const next = site()
    expect(enforceTrackingPlan(next, null, 'free')).toBe(next)
  })
})
