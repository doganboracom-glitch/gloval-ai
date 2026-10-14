'use client'

import type { ReactNode } from 'react'
import type { WebsiteSchema, Section } from '@/lib/website-schema'
import { pageNavItems } from '@/lib/website-pages'
import { resolveTheme, themeToCssVars } from '@/components/website-renderer/theme'
import { WebsiteHeader } from '@/components/website-renderer/sections/website-header'
import { WebsiteFooter } from '@/components/website-renderer/sections/website-footer'
import { SiteFloatingActions } from '@/components/website-renderer/site-floating-actions'
import { CartProvider } from './cart-provider'
import { SiteCartIsland } from '@/components/website-renderer/site-cart-island'
import { getStoreShippingInfo } from '@/lib/store-shipping-settings'
import { resolveHeaderSocialLinks } from '@/lib/social-links'

export function StoreSiteShell({
  site,
  slug,
  shipping,
  children,
}: {
  site: WebsiteSchema
  slug: string
  shipping?: Parameters<typeof SiteCartIsland>[0]['shipping']
  children: React.ReactNode
}) {
  const pages = pageNavItems(site)
  const footer = site.sections.find((section): section is Extract<Section, { type: 'footer' }> => section.type === 'footer')

  return (
    <CartProvider slug={slug}>
      <div style={themeToCssVars(resolveTheme(site))} data-storefront-root>
        <WebsiteHeader navigation={site.navigation} pages={pages} storeSlug={slug} lang={site.meta.language} socialLinks={resolveHeaderSocialLinks(site)} />
        <main>{children}</main>
      {footer ? <WebsiteFooter data={footer} logoText={site.navigation.logoText} lang={site.meta.language} showBranding site={site} /> : null}
        <SiteFloatingActions site={site} />
        <SiteCartIsland slug={slug} lang={site.meta.language} shipping={shipping} />
      </div>
    </CartProvider>
  )
}
