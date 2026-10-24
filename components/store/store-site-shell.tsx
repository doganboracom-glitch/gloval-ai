'use client'

import type { WebsiteSchema, Section } from '@/lib/website-schema'
import { pageNavItems } from '@/lib/website-pages'
import { withLivePageLinks } from '@/lib/live-page-links'
import { resolveTheme, themeToCssVars } from '@/components/website-renderer/theme'
import { WebsiteHeader } from '@/components/website-renderer/sections/website-header'
import { WebsiteFooter } from '@/components/website-renderer/sections/website-footer'
import { SiteFloatingActions } from '@/components/website-renderer/site-floating-actions'
import { CartProvider } from './cart-provider'
import { CatalogProvider } from './catalog-context'
import { SiteCartIsland } from '@/components/website-renderer/site-cart-island'
import { resolveHeaderSocialLinks } from '@/lib/social-links'
import { resolveMenuContact } from '@/lib/menu-contact'
import { modeHasTransactions, type CommerceMode } from '@/lib/commerce-mode'
import { SiteBlogProvider } from '@/components/website-renderer/site-blog-context'
import type { SiteBlogData } from '@/lib/blog-site'

export function StoreSiteShell({
  site: publishedSite,
  slug,
  shipping,
  mode = 'ecommerce',
  whatsappNumber = null,
  origin = '',
  blog = null,
  children,
}: {
  /** Live blog data for the menu/footer link; null hides it (no public posts). */
  blog?: SiteBlogData | null
  site: WebsiteSchema
  slug: string
  shipping?: Parameters<typeof SiteCartIsland>[0]['shipping']
  /** Effective commerce mode; catalog hides cart, account and checkout surfaces. */
  mode?: CommerceMode
  /** Real WhatsApp digits for the catalog order button (never a placeholder). */
  whatsappNumber?: string | null
  /** Canonical site origin for shareable product links in the order message. */
  origin?: string
  children: React.ReactNode
}) {
  const site = withLivePageLinks(publishedSite)
  const pages = pageNavItems(site)
  const footer = site.sections.find((section): section is Extract<Section, { type: 'footer' }> => section.type === 'footer')
  const transactions = modeHasTransactions(mode)

  return (
    <CartProvider slug={slug}>
      <CatalogProvider value={{ mode, whatsappNumber, origin, slug }}>
       <SiteBlogProvider blog={blog} settings={site.blogSettings}>
        <div style={themeToCssVars(resolveTheme(site))} data-storefront-root data-commerce-mode={mode}>
          <WebsiteHeader
            navigation={site.navigation}
            pages={pages}
            storeSlug={slug}
            lang={site.meta.language}
            socialLinks={resolveHeaderSocialLinks(site)}
            contact={resolveMenuContact(site)}
            commerce={transactions}
          />
          <main>{children}</main>
          {footer ? <WebsiteFooter data={footer} logoText={site.navigation.logoText} lang={site.meta.language} showBranding site={site} /> : null}
          <SiteFloatingActions site={site} />
          {transactions ? <SiteCartIsland slug={slug} lang={site.meta.language} shipping={shipping} /> : null}
        </div>
       </SiteBlogProvider>
      </CatalogProvider>
    </CartProvider>
  )
}
