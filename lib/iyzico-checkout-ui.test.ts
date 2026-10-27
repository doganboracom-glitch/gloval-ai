import { describe, expect, it, vi } from 'vitest'
import {
  buildIyzicoIframeSrc,
  isTrustedIyzicoCheckoutMessage,
  redirectIyzicoCheckoutToTopLevel,
  shouldUseTopLevelIyzicoCheckout,
} from './iyzico-checkout-ui'

const PAYMENT_URL = 'https://checkout.iyzico.com/?token=token-123'
const APP_ORIGIN = 'https://gloval.ai'
const iframeWindow = {} as MessageEventSource

function messageEvent(
  origin: string,
  source: MessageEventSource | null,
  data: unknown,
) {
  return { origin, source, data } as MessageEvent<unknown>
}

describe('iyzico checkout helpers', () => {
  it('appends iframe=true to a URL that already has query parameters', () => {
    expect(buildIyzicoIframeSrc(PAYMENT_URL)).toBe(`${PAYMENT_URL}&iframe=true`)
  })

  it('adds iframe=true before a URL fragment and does not duplicate it', () => {
    const url = 'https://checkout.iyzico.com/checkout#form'
    expect(buildIyzicoIframeSrc(url)).toBe('https://checkout.iyzico.com/checkout?iframe=true#form')
    expect(buildIyzicoIframeSrc(`${PAYMENT_URL}&iframe=true`)).toBe(`${PAYMENT_URL}&iframe=true`)
  })

  it('redirects narrow screens to the original payment URL in the same tab', () => {
    const navigate = vi.fn()
    expect(redirectIyzicoCheckoutToTopLevel(PAYMENT_URL, 'Mozilla/5.0', 639, navigate)).toBe(true)
    expect(navigate).toHaveBeenCalledWith(PAYMENT_URL)
    expect(shouldUseTopLevelIyzicoCheckout('Mozilla/5.0', 640)).toBe(false)
  })

  it.each([
    ['Instagram', 'Instagram 321.0'],
    ['Facebook in-app', 'FBAN/FBIOS; FBAV/433.0'],
    ['WhatsApp', 'WhatsApp/2.23.6.75'],
    ['Line', 'Line/13.21.0'],
    ['TikTok', 'TikTok 33.2.1'],
    ['Snapchat', 'Snapchat/12.2.0'],
  ])('uses top-level navigation in %s', (_label, userAgent) => {
    const navigate = vi.fn()
    expect(redirectIyzicoCheckoutToTopLevel(PAYMENT_URL, userAgent, 966, navigate)).toBe(true)
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith(PAYMENT_URL)
  })

  it('does not redirect supported desktop browsers', () => {
    const navigate = vi.fn()
    expect(redirectIyzicoCheckoutToTopLevel(PAYMENT_URL, 'Mozilla/5.0', 966, navigate)).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('accepts only same-origin messages from the active payment iframe', () => {
    const valid = messageEvent(APP_ORIGIN, iframeWindow, {
      source: 'gloval-payment',
      status: 'success',
    })
    expect(isTrustedIyzicoCheckoutMessage(valid, APP_ORIGIN, iframeWindow)).toBe(true)
  })

  it('rejects payment messages from another origin', () => {
    const event = messageEvent('https://attacker.example', iframeWindow, {
      source: 'gloval-payment',
      status: 'success',
    })
    expect(isTrustedIyzicoCheckoutMessage(event, APP_ORIGIN, iframeWindow)).toBe(false)
  })

  it('rejects same-origin messages from a different window', () => {
    const event = messageEvent(APP_ORIGIN, {} as MessageEventSource, {
      source: 'gloval-payment',
      status: 'success',
    })
    expect(isTrustedIyzicoCheckoutMessage(event, APP_ORIGIN, iframeWindow)).toBe(false)
  })

  it('rejects malformed or unrecognized payment messages', () => {
    expect(isTrustedIyzicoCheckoutMessage(messageEvent(APP_ORIGIN, iframeWindow, null), APP_ORIGIN, iframeWindow)).toBe(false)
    expect(
      isTrustedIyzicoCheckoutMessage(
        messageEvent(APP_ORIGIN, iframeWindow, { source: 'gloval-payment', status: 'pending' }),
        APP_ORIGIN,
        iframeWindow,
      ),
    ).toBe(false)
  })
})
