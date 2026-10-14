'use client'

import { createContext, useContext, type ReactNode } from 'react'

/**
 * SiteNav context
 * ---------------
 * The generated site does its page switching IN-MEMORY (a single renderer with
 * an active-page state), but individual links, CTAs and product/category cards
 * still carry real `/route` hrefs. On the published site some of those routes
 * are real (product detail, cart), but in the EDITOR PREVIEW the site is
 * portalled into a `src`-less <iframe> with no Next.js router — so a real
 * navigation there dead-ends on a nonexistent URL and the iframe flashes a 404
 * and resets.
 *
 * This context lets the renderer install a single handler that link primitives
 * consult before allowing a browser navigation. The handler resolves internal
 * hrefs to in-memory page switches and, in preview, swallows anything that
 * isn't a real page so a click never blanks the iframe.
 *
 * Returns `true` when the click was fully handled (the primitive then calls
 * `preventDefault`); `false` lets the browser navigate normally (published
 * product-detail / cart routes).
 */
export type SiteNavHandler = (href: string) => boolean

const SiteNavContext = createContext<SiteNavHandler | null>(null)
const SitePreviewContext = createContext(false)

export function SiteNavProvider({
  handler,
  preview = false,
  children,
}: {
  handler: SiteNavHandler
  /** True only inside the editor/landing preview (never on published or demo pages). */
  preview?: boolean
  children: ReactNode
}) {
  return (
    <SiteNavContext.Provider value={handler}>
      <SitePreviewContext.Provider value={preview}>{children}</SitePreviewContext.Provider>
    </SiteNavContext.Provider>
  )
}

/** True when the site renders inside the editor preview. */
export function useIsSitePreview(): boolean {
  return useContext(SitePreviewContext)
}

/** The active in-site navigation handler, or null when the site isn't wrapped. */
export function useSiteNav(): SiteNavHandler | null {
  return useContext(SiteNavContext)
}
