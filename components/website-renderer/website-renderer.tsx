'use client'

import { useCallback, useMemo, useRef, useState, type MouseEvent } from 'react'
import { cn } from '@/lib/utils'
import { isStorefront, type WebsiteSchema } from '@/lib/website-schema'
import { logSchemaRepair, normalizeWebsiteSchema } from '@/lib/website-schema-compat'
import { NEW_TICKET_PATH } from '@/lib/support/prefill'
import { pageNavItems, sectionsForPage, homeSlug, pagePath, resolveHrefToPageSlug, hrefToTenantPath, canonicalSectionAnchor } from '@/lib/website-pages'
import { SiteNavProvider, type SiteNavHandler } from '@/components/website-renderer/site-nav-context'
import { SiteBlogProvider } from '@/components/website-renderer/site-blog-context'
import { WebsiteLatestPosts } from '@/components/website-renderer/sections/website-latest-posts'
import { isBlogRoutePath, shouldShowLatestPosts, type SiteBlogData } from '@/lib/blog-site'
import { hasBlogLatestSection } from '@/lib/section-order'
import {
  resolveTheme,
  themeToCssVars,
} from '@/components/website-renderer/theme'
import { SectionRenderer } from '@/components/website-renderer/section-renderer'
import type { ContactFormLive } from '@/components/website-renderer/sections/contact-form'
import type { PaymentBadgeSet } from '@/lib/payment-badges'
import { WebsiteHeader } from '@/components/website-renderer/sections/website-header'
import { BackToTop, scrollSiteToTop } from '@/components/website-renderer/back-to-top'
import { GlovalBadge } from '@/components/website-renderer/gloval-badge'
import { SiteFloatingActions } from '@/components/website-renderer/site-floating-actions'
import { CartProvider } from '@/components/store/cart-provider'
import type { StoreProduct } from '@/lib/store'
import {
  StoreCatalogProvider,
  buildPreviewCatalog,
  type StoreCatalog,
} from '@/components/website-renderer/store-catalog-context'
import { SiteCartIsland } from '@/components/website-renderer/site-cart-island'
import { isKeepInteractiveTarget } from '@/lib/preview-interactive'
import { sectionHasSample } from '@/lib/sample-content'
import { resolveHeaderSocialLinks } from '@/lib/social-links'

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
  previewProducts,
  previewCollections,
  preview = null,
  editSelection = null,
  paymentBadges = null,
  headerActions,
  contactForm = null,
  initialPage = null,
  pageRouting = false,
  blog = null,
}: {
  site: unknown
  /** Published site only: live blog posts that feed the menu/footer link and the latest-posts block. */
  blog?: SiteBlogData | null
  /** Published site only: the page slug this request is rendering (null = home). */
  initialPage?: string | null
  /**
   * Published site only: page links are real URLs (`/<slug>`), so switching
   * pages navigates for real instead of swapping sections in memory.
   */
  pageRouting?: boolean
  /** Published site only: slug + signed render token that make the contact form submit for real. */
  contactForm?: ContactFormLive | null
  /** Demo pages only: extra header controls (demo cart/account), rendered before the CTA. */
  headerActions?: React.ReactNode
  /**
   * Set only by the published store page, resolved server-side from the store's
   * real payment settings. Omitted (null) for corporate sites, the editor
   * preview and demos, so no payment strip is shown there.
   */
  paymentBadges?: PaymentBadgeSet | null
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
   * Editor preview only: the owner's active catalog products, shown by product
   * showcase sections. Display-only (no cart).
   */
  previewProducts?: StoreProduct[]
  /** Editor preview only: the owner's collections, so a collection-bound showcase resolves its products. */
  previewCollections?: Array<{ slug: string; name: string; product_ids: string[] }>
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
  const parsed = useMemo(() => {
    const result = normalizeWebsiteSchema(site)
    if (result.ok) {
      logSchemaRepair('render', result.steps)
      return { success: true as const, data: result.value }
    }
    return { success: false as const }
  }, [site])
  const [activeSlug, setActiveSlug] = useState<string | null>(initialPage)
  const rootRef = useRef<HTMLDivElement>(null)

  // Page switches always land at the top of the new page, exactly like a real
  // navigation would. On a published site each page has its own URL, so the
  // switch is a real navigation.
  const handleNavigate = useCallback(
    (slug: string) => {
      if (pageRouting && parsed.success) {
        window.location.assign(pagePath(parsed.data, slug))
        return
      }
      setActiveSlug(slug)
      scrollSiteToTop(rootRef.current)
    },
    [pageRouting, parsed],
  )

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
        if (pageRouting) {
          // Already on the page that owns the section: let the browser scroll to it.
          if (page.slug === (activeSlug ?? homeSlug(parsed.data))) return false
          window.location.assign(`${pagePath(parsed.data, page.slug)}#${id}`)
          return true
        }
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
      const tenantPath = hrefToTenantPath(href, preview.slug)
      if (isStorefront(parsed.data) || href.startsWith('/yasal/') || isBlogRoutePath(tenantPath)) {
        preview.onStoreRoute(tenantPath)
      }
      return true
    },
    [parsed, handleNavigate, preview, pageRouting, activeSlug],
  )

  // Display-only catalog for a storefront preview, so product cards link to the
  // real `/site/<slug>/store/<slug>` detail route (which `onStoreRoute` then
  // turns into the live tenant URL) instead of the model's invented href.
  const previewCatalog = useMemo(() => {
    if (!preview || !parsed.success || !isStorefront(parsed.data)) return null
    const catalog = buildPreviewCatalog(parsed.data, preview.slug ?? 'preview')
    // Real catalog (read-only, owner's active products) so the preview shows the
    // same product showcase the published site will.
    return {
      ...catalog,
      products: previewProducts ?? [],
      collections: previewCollections ?? [],
      isPreview: true,
    }
  }, [preview, parsed, previewProducts, previewCollections])

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

  // The latest-posts block lives on the home page only, either right after the
  // opening hero or just above the footer (the default).
  // A site that has a real `blogLatest` section (visible or hidden) places and
  // hides the block through that section; only older sites use this fixed block.
  const showLatest =
    !hasBlogLatestSection(data) &&
    active === homeSlug(data) &&
    blog &&
    shouldShowLatestPosts(blog, data.blogSettings)
  const footerIndex = sections.findIndex((section) => section.type === 'footer')
  const latestIndex = !showLatest
    ? -1
    : data.blogSettings?.latestPlacement === 'after-hero'
      ? sections[0]?.type === 'hero' || sections[0]?.type === 'slider'
        ? 1
        : 0
      : footerIndex >= 0
        ? footerIndex
        : sections.length
  const latestPosts =
    showLatest && blog ? <WebsiteLatestPosts key="latest-posts" blog={blog} lang={data.meta.language} /> : null

  const content = (
    <SiteNavProvider
      handler={navHandler}
      preview={Boolean(preview)}
      pageSlugs={pages.filter((p) => !p.isHome).map((p) => p.slug)}
    >
    <SiteBlogProvider blog={blog} settings={data.blogSettings}>
    <div ref={rootRef} style={themeToCssVars(theme)} data-website-root>
      <WebsiteHeader
        navigation={data.navigation}
        pages={pages}
        activeSlug={active}
        onNavigate={handleNavigate}
        cartSlug={store?.slug}
        lang={data.meta.language}
        actions={headerActions}
        socialLinks={resolveHeaderSocialLinks(data)}
      />
      {sections.flatMap((section, i) => {
        const item = (() => {
        const rendered = (
          <SectionRenderer
            key={`${active}-${section.type}-${i}`}
            section={section}
            meta={data.meta}
            site={data}
            showBranding={showBranding}
            paymentBadges={paymentBadges}
            contactForm={contactForm}
          />
        )
        // Editor/landing preview only (`preview` is null on published and demo
        // sites): flags sections still holding unapproved AI sample content.
        const sampleBadge =
          preview && sectionHasSample(section) ? (
            <span
              className="pointer-events-none absolute right-3 top-3 z-20 rounded-md bg-brand px-2 py-0.5 text-[11px] font-semibold text-brand-foreground shadow-sm"
              data-gv-sample-badge
            >
              {data.meta.language === 'en' ? 'Sample' : 'Örnek'}
            </span>
          ) : null
        if (!editSelection) {
          if (!sampleBadge) return rendered
          return (
            <div key={`sample-${active}-${section.type}-${i}`} className="relative">
              {rendered}
              {sampleBadge}
            </div>
          )
        }
        // Selecting a section for the editor must never also trigger the
        // section's own links/buttons (nav CTAs, "Add to cart", etc). The
        // capture-phase handler intercepts the click before it reaches any
        // descendant, so real interactive elements inside the section are
        // inert while the canvas is in selection mode.
        // Carousel controls (arrows/dots) are the exception: they opt out via
        // `data-gv-keep-interactive` so sliders stay operable in the editor.
        const handleSelect = (e: MouseEvent<HTMLDivElement>) => {
          if (isKeepInteractiveTarget(e.target)) return
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
            {sampleBadge}
          </div>
        )
        })()
        return i === latestIndex ? [latestPosts, item] : [item]
      })}
      {latestIndex === sections.length ? latestPosts : null}
      {showContactActions && <SiteFloatingActions site={data} planCode={planCode} />}
      <BackToTop anchorRef={rootRef} lang={data.meta.language} resetKey={active} />
      {showBranding && !hasFooter && (
        <GlovalBadge lang={data.meta.language} variant="floating" />
      )}
      {store && <SiteCartIsland slug={store.slug} lang={data.meta.language} shipping={store.shipping} />}
    </div>
    </SiteBlogProvider>
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
      <p className="text-sm font-medium text-foreground">Bu sayfa şu anda görüntülenemiyor.</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        Sitenizin kayıtlı yapısı okunamadı. Verileriniz silinmedi; sorunu düzeltmemiz için destek ekibine yazabilirsiniz.
      </p>
      <a href={NEW_TICKET_PATH} className="text-xs font-medium text-brand underline underline-offset-2">
        Destek talebi oluştur
      </a>
    </div>
  )
}
