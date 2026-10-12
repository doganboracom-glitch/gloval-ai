'use client'

import type { ReactNode } from 'react'
import type { WebsiteSchema, Section } from '@/lib/website-schema'
import { pageNavItems } from '@/lib/website-pages'
import { resolveTheme, themeToCssVars } from '@/components/website-renderer/theme'
import { WebsiteHeader } from '@/components/website-renderer/sections/website-header'
import { WebsiteFooter } from '@/components/website-renderer/sections/website-footer'
import { SiteFloatingActions } from '@/components/website-renderer/site-floating-actions'

export function StoreSiteShell({
  site,
  children,
}: {
  site: WebsiteSchema
  children: React.ReactNode
}) {
  const pages = pageNavItems(site)
  const footer = site.sections.find((section): section is Extract<Section, { type: 'footer' }> => section.type === 'footer')

  return (
    <div style={themeToCssVars(resolveTheme(site))} data-storefront-root>
      <WebsiteHeader navigation={site.navigation} pages={pages} />
      <main>{children}</main>
      {footer ? <WebsiteFooter data={footer} logoText={site.navigation.logoText} showBranding /> : null}
      <SiteFloatingActions site={site} />
    </div>
  )
}
