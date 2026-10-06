import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getDemo, demoSlugs, buildDemoSite } from '@/lib/demos'
import { getCatalog } from '@/lib/demo-catalog'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import { DemoFloatingActions } from '@/components/demo-site/demo-floating-actions'
import { resolveTheme, themeToCssVars } from '@/components/website-renderer/theme'
import { DemoCartProvider, DemoCartIsland } from '@/components/demo-site/demo-store'

export function generateStaticParams() {
  return demoSlugs.map((slug) => ({ slug }))
}

// Demo content locale (tr/en only) is a separate, narrower concept from the
// platform UI locale (`Lang`/`SupportedLocale`, now 12 languages).
type DemoLang = 'tr' | 'en'

function resolveLang(value: string | string[] | undefined): DemoLang {
  return value === 'en' ? 'en' : 'tr'
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ lang?: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const { lang: langParam } = await searchParams
  const demo = getDemo(slug)
  if (!demo) return { title: 'Demo bulunamadı' }
  const lang = resolveLang(langParam)
  const site = buildDemoSite(demo, lang)
  const description = site.meta.description || site.meta.tagline
  return {
    title: `${demo.brand[lang]} — ${lang === 'tr' ? 'Demo çalışma' : 'Demo'} · gloval.ai`,
    description,
    robots: { index: false, follow: true },
  }
}

export default async function DemoPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ lang?: string; preview?: string }>
}) {
  const { slug } = await params
  const { lang: langParam, preview } = await searchParams
  const demo = getDemo(slug)
  if (!demo) notFound()

  const lang = resolveLang(langParam)
  const site = buildDemoSite(demo, lang)
  // Preview mode powers the Showcase thumbnails: it renders the exact same
  // canonical site, just without the demo chrome, so the card preview and the
  // full demo page are guaranteed to stay identical.
  const isPreview = preview === '1'

  const backLabel = lang === 'tr' ? 'gloval.ai’a dön' : 'Back to gloval.ai'
  const demoBadge = lang === 'tr' ? 'Demo çalışma' : 'Demo project'

  // The global floating phone/WhatsApp CTAs live here too (the landing page uses
  // WebsiteRenderer directly, not DemoChrome). Wrap them in the demo's theme
  // vars so the phone button picks up each demo's primary color. Hidden in the
  // Showcase preview thumbnails.
  const catalog = getCatalog(slug)
  const floatingVars = themeToCssVars(resolveTheme(site))
  // Commerce demos get a working cart on the homepage too (its product cards
  // add to cart). Preview thumbnails stay clean — no provider, no island.
  const commerce = catalog?.commerce === true && !isPreview
  const checkoutHref = `/demo/${slug}/odeme?lang=${lang}`

  const content = (
    <div className="min-h-svh bg-white text-black">
      {/* Thin demo banner so visitors know this is a generated example. */}
      {!isPreview && (
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
            {demoBadge} · {demo.tag[lang]}
          </span>
        </div>
      )}

      {/* The demo supplies its own phone/WhatsApp buttons below, from the
          authoritative demo catalog, so the renderer's built-in pair is
          suppressed here to avoid rendering them twice. */}
      <WebsiteRenderer site={site} showContactActions={!catalog} />

      {!isPreview && catalog && (
        <div style={floatingVars}>
          <DemoFloatingActions contact={catalog.contact} businessName={catalog.brand[lang]} lang={lang} />
        </div>
      )}

      {commerce && (
        <div style={floatingVars}>
          <DemoCartIsland lang={lang} checkoutHref={checkoutHref} />
        </div>
      )}
    </div>
  )

  if (!commerce) return content

  return <DemoCartProvider slug={slug}>{content}</DemoCartProvider>
}
