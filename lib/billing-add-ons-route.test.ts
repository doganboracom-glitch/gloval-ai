import { describe, expect, it } from 'vitest'
import { buildLegacyAddOnsRedirect } from '@/lib/billing-add-ons-route'

describe('legacy add-on route redirect', () => {
  it('preserves purchase and deep-link query parameters on billing', () => {
    const redirect = buildLegacyAddOnsRedirect(
      {
        payment: 'return',
        addon: 'extra_mail_5_yearly',
        source: ['editor', 'publish'],
      },
      true,
    )

    const url = new URL(redirect, 'https://gloval.ai')
    expect(url.pathname).toBe('/billing')
    expect(url.hash).toBe('#ek-paketler')
    expect(url.searchParams.get('payment')).toBe('return')
    expect(url.searchParams.get('addon')).toBe('extra_mail_5_yearly')
    expect(url.searchParams.getAll('source')).toEqual(['editor', 'publish'])
  })

  it('keeps the complete billing URL in login next for unauthenticated visitors', () => {
    const redirect = buildLegacyAddOnsRedirect({ payment: 'return', addon: 'multilang' }, false)
    const url = new URL(redirect, 'https://gloval.ai')

    expect(url.pathname).toBe('/auth/login')
    expect(url.searchParams.get('next')).toBe('/billing?payment=return&addon=multilang#ek-paketler')
  })

  it('adds the billing anchor when there are no query parameters', () => {
    expect(buildLegacyAddOnsRedirect({}, true)).toBe('/billing#ek-paketler')
  })
})
