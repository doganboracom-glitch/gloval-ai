import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { demoStickyOffsetVars } from '@/lib/demo-chrome'
import { DemoBanner } from '@/components/demo-site/demo-banner'
import { DemoHeaderActions } from '@/components/demo-site/demo-header-actions'
import { getDemo, demoSlugs, buildDemoSite } from '@/lib/demos'
import { getCatalog } from '@/lib/demo-catalog'
import { resolveAboutDetail } from '@/lib/section-detail'
import { resolveServices } from '@/lib/service-pages'
import { resolveTestimonials } from '@/lib/testimonials'
import { resolveReferences } from '@/lib/references'
import { DemoSiteRenderer } from '@/components/demo-site/demo-site-renderer'
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
  initialPage = null,
  initialService = null,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ lang?: string; preview?: string }>
  /** Set by the /hakkimizda and /hizmetler routes so the demo opens on that page. */
  initialPage?: 'about' | 'services' | 'testimonials' | 'references' | null
  /** With `initialPage="services"`: the service whose own page opens. */
  initialService?: string | null
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
  const demoBadge = lang === 'tr' ? 'Demo çalışma · Örnek içerik' : 'Demo project · Example content'

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
  const langQuery = lang === 'en' ? '?lang=en' : ''
  const aboutPageSlug = resolveAboutDetail(site)?.pageSlug ?? null
  const resolvedServices = resolveServices(site)
  const servicesActive = !!resolvedServices?.pageActive
  if (initialPage === 'services') {
    if (!servicesActive) notFound()
    if (initialService && !resolvedServices?.items.some((s) => s.slug === initialService && s.pageEnabled)) notFound()
  }
  const servicesRoutes = servicesActive
    ? {
        listSlug: resolvedServices!.listSlug,
        list: `/demo/${slug}/hizmetler${langQuery}`,
        itemBase: `/demo/${slug}/hizmet`,
        query: langQuery,
      }
    : undefined
  const resolvedTestimonials = resolveTestimonials(site, { demo: true })
  const testimonialsRoutes = resolvedTestimonials.active
    ? { slug: resolvedTestimonials.slug, list: `/demo/${slug}/musteri-yorumlari${langQuery}` }
    : undefined
  if (initialPage === 'testimonials' && !testimonialsRoutes) notFound()
  const resolvedReferences = resolveReferences(site, { demo: true })
  const referencesRoutes = resolvedReferences.active
    ? { slug: resolvedReferences.slug, list: `/demo/${slug}/referanslar${langQuery}` }
    : undefined
  if (initialPage === 'references' && !referencesRoutes) notFound()
  const initialSlug =
    initialPage === 'about'
      ? aboutPageSlug
      : initialPage === 'services'
        ? (resolvedServices?.listSlug ?? null)
        : initialPage === 'testimonials'
          ? (testimonialsRoutes?.slug ?? null)
          : initialPage === 'references'
            ? (referencesRoutes?.slug ?? null)
            : null

  const content = (
    <div className="min-h-svh bg-white text-black" style={demoStickyOffsetVars(!isPreview)}>
      {/* Thin demo banner so visitors know this is a generated example. */}
      {!isPreview && <DemoBanner backLabel={backLabel} badge={`${demoBadge} · ${demo.tag[lang]}`} />}

      {/* The demo supplies its own phone/WhatsApp buttons below, from the
          authoritative demo catalog, so the renderer's built-in pair is
          suppressed here to avoid rendering them twice. */}
      <DemoSiteRenderer
        site={site}
        showContactActions={!catalog}
        demoRoutes={{
          home: `/demo/${slug}${langQuery}`,
          about: `/demo/${slug}/hakkimizda${langQuery}`,
          aboutPageSlug,
          services: servicesRoutes,
          testimonials: testimonialsRoutes,
          references: referencesRoutes,
        }}
        initialPage={initialSlug}
        initialService={initialPage === 'services' ? initialService : null}
        headerActions={commerce ? <DemoHeaderActions slug={slug} lang={lang} /> : undefined}
      />

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
