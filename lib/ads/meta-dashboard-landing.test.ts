import { describe, expect, it } from 'vitest'
import {
  buildDashboardViewUrl,
  isFacebookHashRemnant,
  resolveDashboardPlatform,
  resolveRequestedPlatformSlug,
} from '@/lib/ads/platforms'

const BOTH_OPEN = ['google_connect', 'meta_connect'] as const

function landingSlug(input: Parameters<typeof resolveRequestedPlatformSlug>[0]) {
  return resolveDashboardPlatform(resolveRequestedPlatformSlug(input), BOTH_OPEN).slug
}

describe('resolveRequestedPlatformSlug', () => {
  it('opens Meta when only meta_flow is present (the reported broken URL)', () => {
    expect(landingSlug({ platform: null, meta: null, metaFlow: '987e6543-e21b-42d3-a456-426614174000' })).toBe('meta')
  })

  it('opens Meta when only a meta= result code is present', () => {
    expect(landingSlug({ platform: null, meta: 'oauth_denied', metaFlow: null })).toBe('meta')
    expect(landingSlug({ meta: 'permission_missing' })).toBe('meta')
  })

  it('treats a blank platform like a missing one', () => {
    expect(landingSlug({ platform: '  ', meta: 'no_accounts' })).toBe('meta')
  })

  it('lets an explicit platform win over the Meta parameters', () => {
    expect(landingSlug({ platform: 'google', metaFlow: 'abc' })).toBe('google')
    expect(landingSlug({ platform: 'meta', meta: 'oauth_failed' })).toBe('meta')
  })

  it('keeps the Google default when there is no Meta parameter at all', () => {
    expect(resolveRequestedPlatformSlug({})).toBeNull()
    expect(landingSlug({ platform: null, meta: null, metaFlow: null })).toBe('google')
  })

  it('still falls back when the Meta gate is closed for the viewer', () => {
    const slug = resolveDashboardPlatform(resolveRequestedPlatformSlug({ metaFlow: 'abc' }), ['google_connect']).slug
    expect(slug).toBe('google')
  })
})

describe('Facebook #_=_ remnant', () => {
  it('recognises the remnant and nothing else', () => {
    expect(isFacebookHashRemnant('#_=_')).toBe(true)
    expect(isFacebookHashRemnant('_=_')).toBe(true)
    expect(isFacebookHashRemnant('#settings')).toBe(false)
    expect(isFacebookHashRemnant('')).toBe(false)
  })

  it('is replaced by platform and tab while keeping the OAuth parameters', () => {
    const url = buildDashboardViewUrl('?meta_flow=987e6543-e21b-42d3-a456-426614174000', 'meta', 'settings')
    expect(url).toBe('?meta_flow=987e6543-e21b-42d3-a456-426614174000&platform=meta#settings')
    expect(url).not.toContain('_=_')
  })
})
