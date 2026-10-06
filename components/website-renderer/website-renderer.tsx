'use client'

import { useCallback, useMemo, useRef, useState, type MouseEvent } from 'react'
import { cn } from '@/lib/utils'
import { websiteSchema, isStorefront, type WebsiteSchema } from '@/lib/website-schema'
import { pageNavItems, sectionsForPage, homeSlug, resolveHrefToPageSlug, hrefToTenantPath, canonicalSectionAnchor } from '@/lib/website-pages'
import { SiteNavProvider, type SiteNavHandler } from '@/components/website-renderer/site-nav-context'
import {
  resolveTheme,
  themeToCssVars,
} from '@/components/website-renderer/theme'
import { SectionRenderer } from '@/components/website-renderer/section-renderer'
import { WebsiteHeader } from '@/components/website-renderer/sections/website-header'
import { BackToTop, scrollSiteToTop } from '@/components/website-renderer/back-to-top'
import { GlovalBadge } from '@/components/website-renderer/gloval-badge'
import { SiteFloatingActions } from '@/components/website-renderer/site-floating-actions'
import { CartProvider } from '@/components/store/cart-provider'
import {
  StoreCatalogProvider,
  buildPreviewCatalog,
  type StoreCatalog,
} from '@/components/website-renderer/store-catalog-context'
import { SiteCartIsland } from '@/components/website-renderer/site-cart-island'

/**
 * Preview navigation context, passed only by the editor/landing preview (whose
 * iframe has no router). It lets the renderer send store routes to the REAL
 * published storefront instead of dead-ending the iframe on a 404.
 */
export type PreviewNav = {
  /** Site slug, or null before the first publish. */
  slug: string | null
  /** True when the store is live at its tenant URL. */
  published: boolean
  /**
   * Invoked for a storefront's product/cart/checkout routes with a
   * tenant-relative path (e.g. `/store/altin-tektas`). The preview opens the
   * real store in a new tab when published, or warns the owner to publish.
   */
  onStoreRoute: (tenantPath: string) => void
}

/**
 * WebsiteRenderer
 * ---------------
 * Renders a complete website from a WebsiteSchema object:
 *
 * 1. Validates the schema (defensively) so malformed input shows a friendly
 *    message instead of crashing the page.
 * 2. Resolves the schema's theme into scoped `--site-*` CSS variables so the
 *    generated site is styled entirely from its OWN palette/fonts.
 * 3. Renders a sticky header with real multi-page navigation, then the visible
 *    sections for the active page (hidden sections are filtered out).
 * 4. Shows the "Gloval AI ile oluşturuldu." credit inside the footer's bottom
 *    bar, opposite the copyright line. If the active page has no visible footer
 *    the credit falls back to a pinned bottom-right chip, so hiding the footer
 *    can never remove it. It is on by default for every generated site;
 *    `showBranding={false}` is passed only when the site's owner holds the
 *    one-time "Copyright Kaldırma" entitlement for that specific project.
 * 5. Pins the phone + WhatsApp call buttons to the bottom-left on every page.
 *    Every site gets them; the owner can edit or remove them from the editor.
 */
/**
 * Section-selection state passed only by the editor canvas. Lets a click on
 * a rendered section open it in the editor panel instead of following its
 * real links/buttons.
 */
export type EditSelection = {
  /** Index (within the active page's visible sections) of the selected section, or null. */
  index: number | null
  onSelect: (index: number) => void
}

export function WebsiteRenderer({
  site,
  showBranding = true,
  showContactActions = true,
  planCode,
  store = null,
  preview = null,
  editSelection = null,
}: {
  site: unknown
  showBranding?: boolean
  /**
   * Set by the editor/landing preview, which renders inside a `src`-less iframe
   * with no Next.js router. When present, internal page links switch pages
   * in-memory, and a storefront's store routes (product/cart/checkout) open the
   * REAL published store in a new tab via `onStoreRoute` (or warn to publish).
   * Any other internal route is swallowed so the iframe never 404s. Omitted
   * (null) on the published/demo site, where all routes navigate for real.
   */
  preview?: PreviewNav | null
  /**
   * Real e-commerce catalog for a PUBLISHED storefront. When present the whole
   * site is wrapped in the store cart + catalog context so schema product cards
   * become clickable and purchasable, and a themed cart drawer is shown. Omit
   * it (default) for the editor preview and corporate sites — behavior is then
   * completely unchanged.
   */
  store?: StoreCatalog | null
  /**
   * Set to false when the surrounding page already renders its own phone /
   * WhatsApp buttons (the demo routes do, from their catalog), so they never
   * appear twice.
   */
  showContactActions?: boolean
  /**
   * Site OWNER's plan code. The floating phone/WhatsApp buttons are a paid
   * feature, so they are hidden on FREE. Omit (undefined) to skip plan gating
   * entirely — used by demo/catalog renders that own their own buttons.
   */
  planCode?: string | null
  /**
   * Set only by the editor canvas. When present, every rendered section is
   * wrapped in a click-capturing, selectable overlay instead of behaving as
   * a normal page — see `EditSelection` above. Omitted (null) everywhere
   * else (public/published/demo renders), so behavior there is unchanged.
   */
  editSelection?: EditSelection | null
}) {
  const parsed = useMemo(() => websiteSchema.safeParse(site), [site])
  const [activeSlug, setActiveSlug] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // Page switches always land at the top of the new page, exactly like a real
  // navigation would.
  const handleNavigate = useCallback((slug: string) => {
    setActiveSlug(slug)
    scrollSiteToTop(rootRef.current)
  }, [])

  // Intercepts internal `/route` clicks from links, CTAs and product/category
  // cards — but ONLY in the preview, whose iframe has no router so a real
  // navigation dead-ends on a 404 and resets. A link that maps to one of this
  // site's pages switches in-memory. On a storefront, a store route
  // (product/cart/checkout) is forwarded to `onStoreRoute`, which opens the
  // real published store in a new tab (or warns to publish). Anything else is
  // swallowed so the iframe never 404s. On the published/demo site `preview` is
  // null so we decline (return false) and every route navigates as before.
  // Reads `parsed` (not `data`) so this hook stays before the early return.
  const navHandler = useCallback<SiteNavHandler>(
    (href) => {
      if (href.startsWith('#')) {
        if (!parsed.success) return false
        const raw = href.slice(1)
        const id = canonicalSectionAnchor(raw) ?? raw
        const page = pageNavItems(parsed.data).find((p) =>
          sectionsForPage(parsed.data, p.slug).some((s) => s.type === id),
        )
        if (!page) return false
        handleNavigate(page.slug)
        // Wait for the new page's sections to mount before scrolling to the target.
        window.setTimeout(() => {
          rootRef.current?.ownerDocument
            .getElementById(id)
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 60)
        return true
      }
      if (!preview || !parsed.success) return false
      const pageSlug = resolveHrefToPageSlug(parsed.data, href)
      if (pageSlug) {
        handleNavigate(pageSlug)
        return true
      }
      if (isStorefront(parsed.data)) {
        preview.onStoreRoute(hrefToTenantPath(href, preview.slug))
      }
      return true
    },
    [parsed, handleNavigate, preview],
  )

  // Display-only catalog for a storefront preview, so product cards link to the
  // real `/site/<slug>/store/<slug>` detail route (which `onStoreRoute` then
  // turns into the live tenant URL) instead of the model's invented href.
  const previewCatalog = useMemo(
    () =>
      preview && parsed.success && isStorefront(parsed.data)
        ? buildPreviewCatalog(parsed.data, preview.slug ?? 'preview')
        : null,
    [preview, parsed],
  )

  if (!parsed.success) {
    return <RendererError />
  }

  const data: WebsiteSchema = parsed.data
  const theme = resolveTheme(data)
  const pages = pageNavItems(data)

  // Keep the active page valid even if pages change under an edit.
  const active = pages.find((p) => p.slug === activeSlug)?.slug ?? homeSlug(data)
  const sections = sectionsForPage(data, active)

  // The footer hosts the credit. Without a visible footer on this page it would
  // vanish, so fall back to the pinned chip instead.
  const hasFooter = sections.some((section) => section.type === 'footer')

  const content = (
    <SiteNavProvider handler={navHandler}>
    <div ref={rootRef} style={themeToCssVars(theme)} data-website-root>
      <WebsiteHeader
        navigation={data.navigation}
        pages={pages}
        activeSlug={active}
        onNavigate={handleNavigate}
      />
      {sections.map((section, i) => {
        const rendered = (
          <SectionRenderer
            key={`${active}-${section.type}-${i}`}
            section={section}
            meta={data.meta}
            showBranding={showBranding}
          />
        )
        if (!editSelection) return rendered
        // Selecting a section for the editor must never also trigger the
        // section's own links/buttons (nav CTAs, "Add to cart", etc). The
        // capture-phase handler intercepts the click before it reaches any
        // descendant, so real interactive elements inside the section are
        // inert while the canvas is in selection mode.
        const handleSelect = (e: MouseEvent<HTMLDivElement>) => {
          e.preventDefault()
          e.stopPropagation()
          editSelection.onSelect(i)
        }
        const isSelected = editSelection.index === i
        return (
          <div
            key={`select-${active}-${section.type}-${i}`}
            data-gv-section-index={i}
            onClickCapture={handleSelect}
            className={cn(
              'relative cursor-pointer transition-shadow',
              isSelected
                ? 'ring-2 ring-primary ring-inset'
                : 'hover:ring-1 hover:ring-primary/40 hover:ring-inset',
            )}
          >
            {rendered}
          </div>
        )
      })}
      {showContactActions && <SiteFloatingActions site={data} planCode={planCode} />}
      <BackToTop anchorRef={rootRef} lang={data.meta.language} resetKey={active} />
      {showBranding && !hasFooter && (
        <GlovalBadge lang={data.meta.language} variant="floating" />
      )}
      {store && <SiteCartIsland slug={store.slug} lang={data.meta.language} />}
    </div>
    </SiteNavProvider>
  )

  // A real published storefront: wrap the whole site in the shared cart (keyed
  // by the store slug, so the cart carries straight into the existing checkout)
  // and the catalog context that makes product cards resolve to live products.
  if (store) {
    return (
      <CartProvider slug={store.slug}>
        <StoreCatalogProvider catalog={store}>{content}</StoreCatalogProvider>
      </CartProvider>
    )
  }

  // Storefront preview: mount the display-only catalog (NO cart, so add-to-cart
  // stays disabled and no cart drawer appears) purely so product cards resolve
  // to their real detail routes for `onStoreRoute`.
  if (previewCatalog) {
    return <StoreCatalogProvider catalog={previewCatalog}>{content}</StoreCatalogProvider>
  }

  return content
}

function RendererError() {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-2 p-10 text-center">
      <p className="text-sm font-medium text-foreground">
        This website could not be rendered.
      </p>
      <p className="max-w-sm text-xs text-muted-foreground">
        The generated structure was invalid. Please try generating again.
      </p>
    </div>
  )
}
