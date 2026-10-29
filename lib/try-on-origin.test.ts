import { describe, expect, it, vi } from 'vitest'
import { isAllowedTryOnOrigin } from './try-on-origin'

const resolveCustomDomainSlug = vi.fn()
const deps = { resolveCustomDomainSlug }

function check(host: string, overrides: Partial<Parameters<typeof isAllowedTryOnOrigin>[0]> = {}) {
  return isAllowedTryOnOrigin(
    { origin: `https://${host}`, referer: null, host, mode: 'store', storeSlug: 'luna-mucevher', ...overrides },
    deps,
  )
}

describe('isAllowedTryOnOrigin', () => {
  it('allows the store on its own tenant subdomain', async () => {
    expect(await check('luna-mucevher.gloval.site')).toBe(true)
  })

  it('refuses another store slug on a tenant subdomain', async () => {
    expect(await check('baska.gloval.site')).toBe(false)
  })

  it('refuses demo mode on a tenant subdomain', async () => {
    expect(await check('luna-mucevher.gloval.site', { mode: 'demo' })).toBe(false)
  })

  it('allows platform hosts for store pages and demos', async () => {
    expect(await check('gloval.ai')).toBe(true)
    expect(await check('gloval.ai', { mode: 'demo', storeSlug: '' })).toBe(true)
  })

  it('refuses a cross-site Origin even when the Host looks right', async () => {
    expect(await check('luna-mucevher.gloval.site', { origin: 'https://evil.example' })).toBe(false)
  })

  it('falls back to Referer when Origin is absent', async () => {
    expect(
      await check('gloval.ai', { origin: null, referer: 'https://gloval.ai/site/luna-mucevher' }),
    ).toBe(true)
    expect(await check('gloval.ai', { origin: null, referer: 'https://evil.example/x' })).toBe(false)
  })

  it('refuses when neither Origin nor Referer is present, or when Origin is malformed', async () => {
    expect(await check('gloval.ai', { origin: null, referer: null })).toBe(false)
    expect(await check('gloval.ai', { origin: 'not a url' })).toBe(false)
  })

  it('allows a custom domain only when it is bound to that store', async () => {
    resolveCustomDomainSlug.mockResolvedValueOnce('luna-mucevher')
    expect(await check('www.luna.com.tr')).toBe(true)

    resolveCustomDomainSlug.mockResolvedValueOnce('baska-magaza')
    expect(await check('www.luna.com.tr')).toBe(false)

    resolveCustomDomainSlug.mockResolvedValueOnce(null)
    expect(await check('www.unbound.com')).toBe(false)
  })

  it('never serves demo mode on a custom domain', async () => {
    resolveCustomDomainSlug.mockClear()
    expect(await check('www.luna.com.tr', { mode: 'demo' })).toBe(false)
    expect(resolveCustomDomainSlug).not.toHaveBeenCalled()
  })
})
