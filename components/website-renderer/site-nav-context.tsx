'use client'

import { createContext, useCallback, useContext, type ReactNode } from 'react'
import { normalizeInternalHref } from '@/lib/internal-href'

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
const EMPTY_SLUGS: readonly string[] = []
const PageSlugsContext = createContext<readonly string[]>(EMPTY_SLUGS)

export function SiteNavProvider({
  handler,
  preview = false,
  pageSlugs = EMPTY_SLUGS,
  children,
}: {
  handler: SiteNavHandler
  /** True only inside the editor/landing preview (never on published or demo pages). */
  preview?: boolean
  /** The site's page slugs, so a hand-written relative link like `hakkimizda` can be made absolute. */
  pageSlugs?: readonly string[]
  children: ReactNode
}) {
  return (
    <SiteNavContext.Provider value={handler}>
      <SitePreviewContext.Provider value={preview}>
        <PageSlugsContext.Provider value={pageSlugs}>{children}</PageSlugsContext.Provider>
      </SitePreviewContext.Provider>
    </SiteNavContext.Provider>
  )
}

/** Turns a stored relative internal target into an absolute path at render time. */
export function useHrefNormalizer(): (href: string) => string {
  const slugs = useContext(PageSlugsContext)
  return useCallback((href: string) => normalizeInternalHref(href, slugs), [slugs])
}

/** True when the site renders inside the editor preview. */
export function useIsSitePreview(): boolean {
  return useContext(SitePreviewContext)
}

/** The active in-site navigation handler, or null when the site isn't wrapped. */
export function useSiteNav(): SiteNavHandler | null {
  return useContext(SiteNavContext)
}
