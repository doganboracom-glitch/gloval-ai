'use client'

import { useEffect, useState } from 'react'
import {
  ADDON_HIGHLIGHT_MS,
  ADDON_SECTION_OPEN_MS,
  addonCardId,
  readAddonParam,
} from '@/lib/billing-addon-focus'

/**
 * Handles `/billing?addon=<code>`: once the add-ons section has opened, scrolls
 * the matching card into view and returns its code for ~2s so the card can show
 * a ring. When no such card is rendered nothing happens, as before.
 */
export function useAddonDeepLink(): string | null {
  const [highlightedCode, setHighlightedCode] = useState<string | null>(null)

  useEffect(() => {
    const code = readAddonParam(window.location.search)
    if (!code) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let clearTimer: number | undefined

    const scrollTimer = window.setTimeout(
      () => {
        const card = document.getElementById(addonCardId(code))
        if (!card) return
        card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' })
        setHighlightedCode(code)
        clearTimer = window.setTimeout(() => setHighlightedCode(null), ADDON_HIGHLIGHT_MS)
      },
      reduceMotion ? 0 : ADDON_SECTION_OPEN_MS,
    )

    return () => {
      window.clearTimeout(scrollTimer)
      if (clearTimer !== undefined) window.clearTimeout(clearTimer)
    }
  }, [])

  return highlightedCode
}
