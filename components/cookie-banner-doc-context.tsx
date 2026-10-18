'use client'

import { createContext, useContext } from 'react'
import type { CookieBannerDoc } from '@/lib/cookie-policy-link'

/**
 * `undefined` = no site context (platform pages: the platform's own Cookie Policy).
 * `null` = a site where neither the Cookie nor the Privacy Policy is available.
 */
const CookieBannerDocContext = createContext<CookieBannerDoc | null | undefined>(undefined)

export function CookieBannerDocProvider({
  doc,
  children,
}: {
  doc: CookieBannerDoc | null
  children: React.ReactNode
}) {
  return <CookieBannerDocContext.Provider value={doc}>{children}</CookieBannerDocContext.Provider>
}

export function useCookieBannerDoc(): CookieBannerDoc | null | undefined {
  return useContext(CookieBannerDocContext)
}
