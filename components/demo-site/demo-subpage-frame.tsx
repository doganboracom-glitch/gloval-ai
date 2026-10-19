'use client'

import { useRef, type CSSProperties, type ReactNode } from 'react'
import type { WebsiteSchema } from '@/lib/website-schema'
import { WebsiteHeader } from '@/components/website-renderer/sections/website-header'
import { WebsiteFooter } from '@/components/website-renderer/sections/website-footer'
import { BackToTop } from '@/components/website-renderer/back-to-top'
import { navigationForDemoSubpage, demoHomeHref } from '@/lib/demo-chrome'
import { resolveHeaderSocialLinks } from '@/lib/social-links'
import { resolveMenuContact } from '@/lib/menu-contact'

/**
 * Client frame for a demo sub-page: the REAL `WebsiteHeader` + `WebsiteFooter`
 * (and BackToTop) driven by the same site schema the demo home renders, around
 * the sub-page's own content. No store/cart provider is mounted here — the demo
 * cart provider (localStorage) is supplied by `DemoChrome`.
 */
export function DemoSubpageFrame({
  site,
  slug,
  cssVars,
  headerActions,
  children,
}: {
  site: WebsiteSchema
  slug: string
  cssVars: CSSProperties
  headerActions?: ReactNode
  children: ReactNode
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const lang = site.meta.language
  const footer = site.sections.find((s) => s.type === 'footer')

  return (
    <div ref={rootRef} style={cssVars} data-website-root className="min-h-svh">
      <WebsiteHeader
        navigation={navigationForDemoSubpage(site.navigation, slug, lang)}
        homeHref={demoHomeHref(slug, lang)}
        lang={lang}
  actions={headerActions}
  socialLinks={resolveHeaderSocialLinks(site)}
  contact={resolveMenuContact(site)}
  />
      <main>{children}</main>
      {footer && footer.type === 'footer' ? (
        <WebsiteFooter data={footer} logoText={site.navigation.logoText} lang={lang} site={site} />
      ) : null}
      <BackToTop anchorRef={rootRef} lang={lang} />
    </div>
  )
}
