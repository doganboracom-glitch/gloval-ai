import type { Lang } from '@/lib/i18n'
import { pickLang } from '@/lib/i18n'
import { getDemo, buildDemoSite } from '@/lib/demos'
import { getCatalog } from '@/lib/demo-catalog'
import { demoStickyOffsetVars, withLang } from '@/lib/demo-chrome'
import { resolveTheme, themeToCssVars } from '@/components/website-renderer/theme'
import { DemoBanner } from '@/components/demo-site/demo-banner'
import { DemoSubpageFrame } from '@/components/demo-site/demo-subpage-frame'
import { DemoHeaderActions } from '@/components/demo-site/demo-header-actions'
import { DemoFloatingActions } from '@/components/demo-site/demo-floating-actions'
import { DemoCartProvider, DemoCartIsland } from '@/components/demo-site/demo-store'

/**
 * DemoChrome
 * ----------
 * Shell for EVERY demo sub-route (catalog, detail, services, contact, account,
 * checkout, emlak listings). It is built from the SAME `buildDemoSite` schema
 * and theme the demo home uses, and renders the REAL `WebsiteHeader` /
 * `WebsiteFooter` (via `DemoSubpageFrame`), so moving from the home page to a
 * sub-page does not change the chrome.
 *
 * Demo-only behaviour stays here: the "Demo çalışma" banner (the header sticks
 * below it through one shared offset, see `lib/demo-chrome.ts`), the demo
 * phone/WhatsApp buttons and — for commerce demos — the localStorage demo cart
 * and the demo account link. Nothing here touches the real store routes or DB.
 */
export function DemoChrome({
  slug,
  lang,
  children,
}: {
  slug: string
  lang: Lang
  children: React.ReactNode
}) {
  const demo = getDemo(slug)!
  const catalog = getCatalog(slug)!
  const site = buildDemoSite(demo, lang)
  const cssVars = themeToCssVars(resolveTheme(site))

  const commerce = catalog.commerce === true
  const logo = pickLang(catalog.brand, lang)
  const backLabel = lang === 'tr' ? 'gloval.ai’a dön' : 'Back to gloval.ai'
  const demoBadge = lang === 'tr' ? 'Demo çalışma' : 'Demo project'

  const body = (
    <div style={{ ...cssVars, ...demoStickyOffsetVars(true) }}>
      <DemoBanner backLabel={backLabel} badge={`${demoBadge} · ${pickLang(demo.tag, lang)}`} />

      <DemoSubpageFrame
        site={site}
        slug={slug}
        cssVars={cssVars}
        headerActions={commerce ? <DemoHeaderActions slug={slug} lang={lang} /> : undefined}
      >
        {children}
      </DemoSubpageFrame>

      <DemoFloatingActions contact={catalog.contact} businessName={logo} lang={lang} />

      {commerce ? <DemoCartIsland lang={lang} checkoutHref={withLang(`/demo/${slug}/odeme`, lang)} /> : null}
    </div>
  )

  if (!commerce) return body

  return <DemoCartProvider slug={slug}>{body}</DemoCartProvider>
}
