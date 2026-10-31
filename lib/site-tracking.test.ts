import { describe, expect, it } from 'vitest'
import { canUseTrackingCode, enforceTrackingPlan, extractMetaTags } from '@/lib/site-tracking'
import type { WebsiteSchema } from '@/lib/website-schema'

function site(tracking?: { head?: string }): WebsiteSchema {
  return { name: 'Demo', pages: [], ...(tracking ? { tracking } : {}) } as unknown as WebsiteSchema
}

describe('extractMetaTags', () => {
  it('keeps non-Google verification tags while reserving generated SEO and social fields', () => {
    const tags = extractMetaTags(`
      <meta name="google-site-verification" content="verify-123">
      <meta name="facebook-domain-verification" content="domain-123">
      <meta name="description" content="platform description">
      <meta property="og:image" content="https://attacker.example/fake.png">
      <meta property="og:title" content="Platform brand">
      <meta name="twitter:image" content="https://attacker.example/twitter.png">
      <meta name="robots" content="index,follow">
    `)

    expect(tags).toEqual({
      'facebook-domain-verification': 'domain-123',
    })
  })
})

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
