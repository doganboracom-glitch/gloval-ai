// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { CookieConsent } from '@/lib/cookie-consent-storage'
import { clearAttribution, readAttribution } from '@/lib/attribution'
import { useAttributionCapture } from './use-attribution-capture'

const accepted: CookieConsent = { necessary: true, analytics: true, marketing: false }
const denied: CookieConsent = { necessary: true, analytics: false, marketing: false }
const marketingOnly: CookieConsent = { necessary: true, analytics: false, marketing: true }

function setUrl(url: string) {
  window.history.replaceState({}, '', url)
}

afterEach(() => {
  cleanup()
  clearAttribution()
  setUrl('/')
})

describe('useAttributionCapture', () => {
  it('stores the first campaign touch and does not overwrite it on later routes', () => {
    setUrl('/paketler?utm_source=meta&utm_campaign=spring&gclid=private-click-value')
    const { rerender } = renderHook(({ consent }) => useAttributionCapture(consent, true), {
      initialProps: { consent: accepted },
    })

    expect(readAttribution()?.params).toMatchObject({
      utm_source: 'meta',
      utm_campaign: 'spring',
      gclid: true,
    })
    expect(document.cookie).not.toContain('private-click-value')

    act(() => {
      setUrl('/sektor?utm_source=google&utm_campaign=later&fbclid=another-private-click')
      rerender({ consent: accepted })
    })

    expect(readAttribution()?.params.utm_source).toBe('meta')
    expect(readAttribution()?.landing_path).toBe('/paketler')
    expect(document.cookie).not.toContain('another-private-click')
  })

  it('keeps a first direct visit when a later route has campaign parameters', () => {
    setUrl('/?')
    const { rerender } = renderHook(({ consent }) => useAttributionCapture(consent, true), {
      initialProps: { consent: accepted },
    })
    expect(readAttribution()?.params.utm_source).toBeUndefined()
    expect(readAttribution()?.landing_path).toBe('/')

    act(() => {
      setUrl('/paketler?utm_source=google&utm_campaign=later')
      rerender({ consent: accepted })
    })

    expect(readAttribution()?.params.utm_source).toBeUndefined()
    expect(readAttribution()?.landing_path).toBe('/')
  })

  it('stores nothing when analytics consent is declined, even if marketing is accepted', () => {
    setUrl('/paketler?utm_source=google&gclid=private-click-value')
    renderHook(({ consent }) => useAttributionCapture(consent, true), {
      initialProps: { consent: marketingOnly },
    })

    expect(readAttribution()).toBeNull()
    expect(document.cookie).not.toContain('gloval_attribution=')

    renderHook(({ consent }) => useAttributionCapture(consent, true), {
      initialProps: { consent: denied },
    })
    expect(readAttribution()).toBeNull()
  })
})
