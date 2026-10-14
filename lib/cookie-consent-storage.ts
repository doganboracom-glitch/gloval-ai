export type CookieConsent = {
  necessary: true
  analytics: boolean
  marketing: boolean
}

export const CONSENT_COOKIE = 'gloval_cookie_consent'
export const CONSENT_VERSION = 1
export const CONSENT_OPEN_EVENT = 'gloval:open-cookie-preferences'
export const CONSENT_CHANGE_EVENT = 'gloval:cookie-consent-changed'

type StoredConsent = CookieConsent & { v: number }

/**
 * Reads the visitor's stored cookie choice. Pass the document of the page that
 * hosts the content: the editor preview renders inside a `src`-less iframe whose
 * own `document.cookie` is not the platform's.
 */
export function readConsent(doc: Document | undefined = typeof document === 'undefined' ? undefined : document): CookieConsent | null {
  if (!doc) return null
  try {
    const raw = doc.cookie
      .split('; ')
      .find((entry) => entry.startsWith(`${CONSENT_COOKIE}=`))
      ?.split('=')[1]
    if (!raw) return null
    const parsed = JSON.parse(decodeURIComponent(raw)) as StoredConsent
    if (parsed.v !== CONSENT_VERSION) return null
    return {
      necessary: true,
      analytics: Boolean(parsed.analytics),
      marketing: Boolean(parsed.marketing),
    }
  } catch {
    return null
  }
}

/** Third-party embeds (maps) count as marketing/third-party content. */
export function thirdPartyContentAllowed(doc?: Document): boolean {
  return readConsent(doc)?.marketing === true
}
