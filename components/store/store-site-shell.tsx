'use client'

import type { WebsiteSchema, Section } from '@/lib/website-schema'
import { pageNavItems } from '@/lib/website-pages'
import { resolveTheme, themeToCssVars } from '@/components/website-renderer/theme'
import { WebsiteHeader } from '@/components/website-renderer/sections/website-header'
import { WebsiteFooter } from '@/components/website-renderer/sections/website-footer'
import { SiteFloatingActions } from '@/components/website-renderer/site-floating-actions'
import { CartProvider } from './cart-provider'
import { CatalogProvider } from './catalog-context'
import { SiteCartIsland } from '@/components/website-renderer/site-cart-island'
import { resolveHeaderSocialLinks } from '@/lib/social-links'
import { modeHasTransactions, type CommerceMode } from '@/lib/commerce-mode'

export function StoreSiteShell({
  site,
  slug,
  shipping,
  mode = 'ecommerce',
  whatsappNumber = null,
  origin = '',
  children,
}: {
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
  const pages = pageNavItems(site)
  const footer = site.sections.find((section): section is Extract<Section, { type: 'footer' }> => section.type === 'footer')
  const transactions = modeHasTransactions(mode)

  return (
    <CartProvider slug={slug}>
      <CatalogProvider value={{ mode, whatsappNumber, origin, slug }}>
        <div style={themeToCssVars(resolveTheme(site))} data-storefront-root data-commerce-mode={mode}>
          <WebsiteHeader
            navigation={site.navigation}
            pages={pages}
            storeSlug={slug}
            lang={site.meta.language}
            socialLinks={resolveHeaderSocialLinks(site)}
            commerce={transactions}
          />
          <main>{children}</main>
          {footer ? <WebsiteFooter data={footer} logoText={site.navigation.logoText} lang={site.meta.language} showBranding site={site} /> : null}
          <SiteFloatingActions site={site} />
          {transactions ? <SiteCartIsland slug={slug} lang={site.meta.language} shipping={shipping} /> : null}
        </div>
      </CatalogProvider>
    </CartProvider>
  )
}
