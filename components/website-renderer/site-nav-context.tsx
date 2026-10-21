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

/** A demo's own URLs; only demo pages provide them, customer sites never do. */
export type DemoRoutes = {
  home: string
  about: string
  aboutPageSlug: string | null
  /** The services list page slug and the demo's own list / per-service URLs. */
  services?: { listSlug: string; list: string; itemBase: string; query: string }
}

/**
 * Rewrites the few links of the long about page (home/about/section anchors)
 * and the services list/detail pages to the demo's own `/demo/<slug>` URLs so
 * the raw HTML never points at gloval.ai paths that do not exist for a demo.
 */
export function mapDemoHref(href: string, routes: DemoRoutes | null): string {
  if (!routes) return href
  if (href === '/') return routes.home
  if (href.startsWith('/#')) return `${routes.home}${href.slice(1)}`
  if (routes.aboutPageSlug && href === `/${routes.aboutPageSlug}`) return routes.about
  const services = routes.services
  if (services) {
    const path = href.split(/[?#]/)[0]
    if (path === `/${services.listSlug}`) return services.list
    const prefix = `/${services.listSlug}/`
    if (path.startsWith(prefix) && !path.slice(prefix.length).includes('/')) {
      return `${services.itemBase}/${path.slice(prefix.length)}${services.query}`
    }
  }
  return href
}

/** True for the demo's own services list / service URLs (already mapped). */
export function isDemoServiceHref(href: string, routes: DemoRoutes | null): boolean {
  const services = routes?.services
  if (!services) return false
  const path = href.split(/[?#]/)[0]
  return path === services.list.split('?')[0] || path.startsWith(`${services.itemBase}/`)
}

const DemoRoutesContext = createContext<DemoRoutes | null>(null)
const SiteNavContext = createContext<SiteNavHandler | null>(null)
const SitePreviewContext = createContext(false)
const EMPTY_SLUGS: readonly string[] = []
const PageSlugsContext = createContext<readonly string[]>(EMPTY_SLUGS)

export function SiteNavProvider({
  handler,
  preview = false,
  pageSlugs = EMPTY_SLUGS,
  demoRoutes = null,
  children,
}: {
  /** Demo pages only: the demo's own home/about URLs. */
  demoRoutes?: DemoRoutes | null
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
        <PageSlugsContext.Provider value={pageSlugs}>
          <DemoRoutesContext.Provider value={demoRoutes}>{children}</DemoRoutesContext.Provider>
        </PageSlugsContext.Provider>
      </SitePreviewContext.Provider>
    </SiteNavContext.Provider>
  )
}

/** Turns a stored relative internal target into an absolute path at render time. */
export function useHrefNormalizer(): (href: string) => string {
  const slugs = useContext(PageSlugsContext)
  return useCallback((href: string) => normalizeInternalHref(href, slugs), [slugs])
}

/** Maps a link to the demo's own URL on demo pages; the identity everywhere else. */
export function useDemoHref(): (href: string) => string {
  const routes = useContext(DemoRoutesContext)
  return useCallback((href: string) => mapDemoHref(href, routes), [routes])
}

/** True when the site renders inside the editor preview. */
export function useIsSitePreview(): boolean {
  return useContext(SitePreviewContext)
}

/** The active in-site navigation handler, or null when the site isn't wrapped. */
export function useSiteNav(): SiteNavHandler | null {
  return useContext(SiteNavContext)
}
