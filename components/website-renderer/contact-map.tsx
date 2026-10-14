'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MapPin, Navigation } from 'lucide-react'
import { buildDirectionsUrl, sanitizeMapSrc } from '@/lib/map-embed'
import { getAddressMapSrcAction } from '@/lib/map-embed-actions'
import { mapCopy } from '@/lib/map-embed-copy'
import { CONSENT_CHANGE_EVENT, thirdPartyContentAllowed } from '@/lib/cookie-consent-storage'
import { KEEP_INTERACTIVE_PROPS } from '@/lib/preview-interactive'

const SESSION_KEY = 'gloval_map_consent'

/**
 * Contact map shared by corporate sites, stores and demos.
 *
 * The map is third-party content, so nothing from Google is requested until the
 * visitor clicks "Show map" or has already allowed third-party/marketing content
 * in the cookie preferences. The pasted iframe is never rendered: we draw our
 * own with fixed attributes from a validated `src`.
 */
export function ContactMap({
  mapEmbed,
  address,
  lang,
}: {
  mapEmbed?: string
  address?: string
  lang: string
}) {
  const copy = mapCopy(lang)
  const rootRef = useRef<HTMLDivElement>(null)
  const explicitSrc = sanitizeMapSrc(mapEmbed)
  const cleanAddress = address?.trim() ?? ''

  const [consented, setConsented] = useState(false)
  const [src, setSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const hasMap = explicitSrc !== null || cleanAddress.length > 0

  const load = useCallback(async () => {
    if (explicitSrc) {
      setSrc(explicitSrc)
      return
    }
    setLoading(true)
    try {
      setSrc(await getAddressMapSrcAction(cleanAddress))
    } finally {
      setLoading(false)
    }
  }, [explicitSrc, cleanAddress])

  // A map is allowed without a click only when the visitor already agreed.
  useEffect(() => {
    if (!hasMap) return
    const doc = rootRef.current?.ownerDocument
    const check = () => {
      let remembered = false
      try {
        remembered = window.sessionStorage.getItem(SESSION_KEY) === '1'
      } catch {
        // Storage can be blocked; the click still works.
      }
      if (remembered || thirdPartyContentAllowed(doc)) setConsented(true)
    }
    check()
    window.addEventListener(CONSENT_CHANGE_EVENT, check)
    return () => window.removeEventListener(CONSENT_CHANGE_EVENT, check)
  }, [hasMap])

  useEffect(() => {
    if (consented && hasMap && !src) void load()
  }, [consented, hasMap, src, load])

  if (!hasMap) return null

  const directions = cleanAddress ? buildDirectionsUrl(cleanAddress) : null

  function accept() {
    try {
      window.sessionStorage.setItem(SESSION_KEY, '1')
    } catch {
      // Ignore: consent just won't carry to the next page.
    }
    setConsented(true)
  }

  return (
    <div ref={rootRef} className="mt-10" data-contact-map>
      <div
        className="overflow-hidden"
        style={{ borderRadius: 'var(--site-radius)', border: '1px solid var(--site-border)' }}
      >
        {src ? (
          <iframe
            src={src}
            title={copy.iframeTitle}
            className="block h-[300px] w-full sm:h-[360px]"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          />
        ) : (
          <div
            className="flex h-[300px] w-full flex-col items-center justify-center gap-3 px-6 text-center sm:h-[360px]"
            style={{ backgroundColor: 'var(--site-card)' }}
          >
            <span style={{ color: 'var(--site-primary)' }}>
              <MapPin className="h-8 w-8" aria-hidden />
            </span>
            <button
              type="button"
              onClick={accept}
              disabled={loading || consented}
              {...KEEP_INTERACTIVE_PROPS}
              className="inline-flex h-10 items-center justify-center px-5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-70"
              style={{
                backgroundColor: 'var(--site-primary)',
                color: 'var(--site-primary-fg)',
                borderRadius: 'var(--site-radius)',
              }}
            >
              {consented ? copy.loading : copy.show}
            </button>
            <p
              className="max-w-sm text-pretty text-xs leading-relaxed"
              style={{ color: 'var(--site-muted-fg)' }}
            >
              {copy.privacy}
            </p>
          </div>
        )}
      </div>

      {cleanAddress && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm">
          <span style={{ color: 'var(--site-fg)' }}>{cleanAddress}</span>
          {directions && (
            <a
              href={directions}
              target="_blank"
              rel="noopener noreferrer"
              {...KEEP_INTERACTIVE_PROPS}
              className="inline-flex items-center gap-1.5 font-semibold hover:underline"
              style={{ color: 'var(--site-primary)' }}
            >
              <Navigation className="h-4 w-4" aria-hidden />
              {copy.directions}
            </a>
          )}
        </div>
      )}
    </div>
  )
}
