import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { Lang } from '@/lib/i18n'
import { pickLang } from '@/lib/i18n'
import { getDemo, buildDemoSite } from '@/lib/demos'
import { getCatalog } from '@/lib/demo-catalog'
import { resolveTheme, themeToCssVars } from '@/components/website-renderer/theme'
import { DemoFloatingActions } from '@/components/demo-site/demo-floating-actions'
import {
  DemoCartProvider,
  DemoCartIsland,
  DemoCartNavButton,
  DemoAccountNavButton,
} from '@/components/demo-site/demo-store'

/**
 * DemoChrome
 * ----------
 * Shared header/footer + gloval banner + floating contact for EVERY demo's real
 * sub-routes (catalog, service and contact pages). It resolves the SAME theme
 * the canonical `/demo/[slug]` page uses, so these bespoke pages are visually
 * identical to the generated site — same logo, palette, fonts and nav — while
 * adding real, navigable routes. Nav labels come from the demo's catalog so
 * each sector reads naturally ("Menü", "Projeler", "Paketler"...).
 *
 * Server component: all links are real routes or same-page anchors.
 */

function withLang(path: string, lang: Lang): string {
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}lang=${lang}`
}

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
  const theme = resolveTheme(site)
  const cssVars = themeToCssVars(theme)

  const commerce = catalog.commerce === true
  const logo = pickLang(catalog.brand, lang)
  const home = withLang(`/demo/${slug}`, lang)
  const checkoutHref = withLang(`/demo/${slug}/odeme`, lang)
  const backLabel = lang === 'tr' ? 'gloval.ai’a dön' : 'Back to gloval.ai'
  const demoBadge = lang === 'tr' ? 'Demo çalışma' : 'Demo project'
  const contactLabel = lang === 'tr' ? 'İletişim' : 'Contact'

  const navLinks = [
    { label: lang === 'tr' ? 'Ana Sayfa' : 'Home', href: home },
    { label: pickLang(catalog.productsLabel, lang), href: catalog.productsHref(lang) },
    { label: pickLang(catalog.servicesLabel, lang), href: withLang(`/demo/${slug}/hizmetler`, lang) },
    { label: contactLabel, href: withLang(`/demo/${slug}/iletisim`, lang) },
  ]

  const body = (
    <div style={cssVars} data-website-root className="min-h-svh">
      {/* Preserve the gloval.ai return banner across the whole demo. */}
      <div className="sticky top-0 z-50 flex items-center justify-between gap-4 border-b border-black/10 bg-black px-4 py-2.5 text-white">
        <Link
          href="/#showcase"
          className="inline-flex items-center gap-2 text-sm font-medium text-white/90 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
        <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
          {demoBadge} · {pickLang(demo.tag, lang)}
        </span>
      </div>

      {/* Site header — mirrors the canonical WebsiteHeader. */}
      <header
        className="sticky top-[45px] z-40 backdrop-blur"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--site-bg) 82%, transparent)',
          borderBottom: '1px solid var(--site-border)',
        }}
      >
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-4">
          <Link
            href={home}
            className="text-lg font-bold tracking-tight"
            style={{ fontFamily: 'var(--site-heading-font)', color: 'var(--site-fg)' }}
          >
            {logo}
          </Link>
          <nav className="flex flex-wrap items-center gap-4 sm:gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.href + link.label}
                href={link.href}
                className="text-sm font-medium transition-opacity hover:opacity-70"
                style={{ color: 'var(--site-muted-fg)' }}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            {commerce ? <DemoAccountNavButton slug={slug} lang={lang} /> : null}
            {commerce ? <DemoCartNavButton lang={lang} /> : null}
            <Link
              href={commerce ? catalog.productsHref(lang) : withLang(`/demo/${slug}/iletisim`, lang)}
              className="hidden items-center justify-center px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 sm:inline-flex"
              style={{
                borderRadius: 'var(--site-radius)',
                backgroundColor: 'var(--site-primary)',
                color: 'var(--site-primary-fg)',
                fontFamily: 'var(--site-body-font)',
              }}
            >
              {pickLang(catalog.primaryCtaLabel, lang)}
            </Link>
          </div>
        </div>
      </header>

      <main>{children}</main>

      {/* Footer — mirrors WebsiteFooter styling. */}
      <footer
        className="px-6 py-10"
        style={{ borderTop: '1px solid var(--site-border)', backgroundColor: 'var(--site-card)' }}
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-3 sm:flex-row">
          <span className="text-sm font-bold" style={{ color: 'var(--site-fg)', fontFamily: 'var(--site-heading-font)' }}>
            {logo}
          </span>
          <span className="text-xs" style={{ color: 'var(--site-muted-fg)' }}>
            © {new Date().getFullYear()} {logo} ·{' '}
            {lang === 'tr' ? 'gloval.ai ile oluşturuldu' : 'Built with gloval.ai'}
          </span>
        </div>
      </footer>

      <DemoFloatingActions contact={catalog.contact} businessName={logo} lang={lang} />

      {commerce ? <DemoCartIsland lang={lang} checkoutHref={checkoutHref} /> : null}
    </div>
  )

  if (!commerce) return body

  return <DemoCartProvider slug={slug}>{body}</DemoCartProvider>
}
