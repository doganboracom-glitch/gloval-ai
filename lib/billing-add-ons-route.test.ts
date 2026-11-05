import { describe, expect, it } from 'vitest'
import {
  ADD_ON_PAYMENT_RETURN_PARAM,
  ADD_ON_PAYMENT_RETURN_QUERY,
  buildLegacyAddOnsRedirect,
  isAddOnPaymentReturn,
} from '@/lib/billing-add-ons-route'

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
    expect(url.searchParams.get(ADD_ON_PAYMENT_RETURN_PARAM)).toBe('return')
    expect(url.searchParams.has('payment')).toBe(false)
    expect(url.searchParams.get('addon')).toBe('extra_mail_5_yearly')
    expect(url.searchParams.getAll('source')).toEqual(['editor', 'publish'])
  })

  it('keeps the complete billing URL in login next for unauthenticated visitors', () => {
    const redirect = buildLegacyAddOnsRedirect({ payment: 'return', addon: 'multilang' }, false)
    const url = new URL(redirect, 'https://gloval.ai')

    expect(url.pathname).toBe('/auth/login')
    expect(url.searchParams.get('next')).toBe('/billing?addon=multilang&addonPayment=return#ek-paketler')
  })

  it('does not treat a plan payment return as an add-on outcome', () => {
    const planReturnParams = { payment: 'success' }
    expect(isAddOnPaymentReturn(planReturnParams)).toBe(false)
  })

  it('uses a dedicated add-on signal that cannot trigger a plan payment notice', () => {
    const addonReturn = new URLSearchParams(ADD_ON_PAYMENT_RETURN_QUERY)
    expect(addonReturn.get(ADD_ON_PAYMENT_RETURN_PARAM)).toBe('return')
    expect(addonReturn.has('payment')).toBe(false)
    expect(isAddOnPaymentReturn({ addonPayment: addonReturn.get(ADD_ON_PAYMENT_RETURN_PARAM) ?? undefined })).toBe(true)
  })

  it('adds the billing anchor when there are no query parameters', () => {
    expect(buildLegacyAddOnsRedirect({}, true)).toBe('/billing#ek-paketler')
  })
})
