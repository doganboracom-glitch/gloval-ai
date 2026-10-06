import type { Metadata } from 'next'
import Link from 'next/link'
import { MapPin, BedDouble, Bath, Maximize2, ArrowRight } from 'lucide-react'
import { emlakListings } from '@/lib/demo-data'
import { DemoChrome } from '@/components/demo-site/demo-chrome'

// Demo content locale (tr/en only) is a separate, narrower concept from the
// platform UI locale (`Lang`/`SupportedLocale`, now 12 languages).
type DemoLang = 'tr' | 'en'

function resolveLang(value: string | string[] | undefined): DemoLang {
  return value === 'en' ? 'en' : 'tr'
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>
}): Promise<Metadata> {
  const { lang: langParam } = await searchParams
  const lang = resolveLang(langParam)
  return {
    title: lang === 'tr' ? 'İlanlar | Emlak Vizyon' : 'Listings | Vista Realty',
    description:
      lang === 'tr'
        ? 'Emlak Vizyon güncel satılık konut ve yatırım ilanları. Villa, rezidans, daire ve müstakil ev seçeneklerini inceleyin.'
        : 'Current Vista Realty listings for sale. Explore villas, residences, apartments and detached houses.',
    robots: { index: false, follow: true },
  }
}

export default async function EmlakListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>
}) {
  const { lang: langParam } = await searchParams
  const lang = resolveLang(langParam)

  const heading = lang === 'tr' ? 'Güncel İlanlar' : 'Current Listings'
  const sub =
    lang === 'tr'
      ? 'Sizin için özenle seçilmiş satılık konut ve yatırım fırsatları.'
      : 'A hand-picked selection of homes and investment opportunities for sale.'
  const detailsLabel = lang === 'tr' ? 'Detayları Gör' : 'View Details'

  return (
    <DemoChrome slug="emlak" lang={lang}>
      <section className="mx-auto w-full max-w-5xl px-6 py-14 sm:py-20">
        <div className="max-w-2xl">
          <h1
            className="text-pretty text-3xl font-bold sm:text-4xl"
            style={{ fontFamily: 'var(--site-heading-font)', color: 'var(--site-fg)' }}
          >
            {heading}
          </h1>
          <p className="mt-3 text-pretty text-sm leading-relaxed sm:text-base" style={{ color: 'var(--site-muted-fg)' }}>
            {sub}
          </p>
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {emlakListings.map((listing) => (
            <Link
              key={listing.slug}
              href={`/demo/emlak/ilan/${listing.slug}?lang=${lang}`}
              className="group flex flex-col overflow-hidden transition-transform hover:-translate-y-1"
              style={{
                borderRadius: 'var(--site-radius)',
                border: '1px solid var(--site-border)',
                backgroundColor: 'var(--site-card)',
              }}
            >
              <div className="relative aspect-[4/3] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={listing.image || '/placeholder.svg'}
                  alt={listing.title[lang]}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                  decoding="async"
                />
                <span
                  className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold"
                  style={{ backgroundColor: 'var(--site-primary)', color: 'var(--site-primary-fg)' }}
                >
                  {listing.status[lang]}
                </span>
              </div>

              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--site-muted-fg)' }}>
                  <MapPin className="h-3.5 w-3.5" />
                  {listing.location[lang]}
                </div>
                <h2
                  className="mt-2 text-pretty text-lg font-bold"
                  style={{ fontFamily: 'var(--site-heading-font)', color: 'var(--site-fg)' }}
                >
                  {listing.title[lang]}
                </h2>
                <p className="mt-1 text-xl font-bold" style={{ color: 'var(--site-primary)' }}>
                  {listing.price}
                </p>

                <div
                  className="mt-4 flex items-center gap-4 border-t pt-4 text-xs"
                  style={{ borderColor: 'var(--site-border)', color: 'var(--site-muted-fg)' }}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <BedDouble className="h-4 w-4" /> {listing.rooms}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Bath className="h-4 w-4" /> {listing.bathrooms}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Maximize2 className="h-4 w-4" /> {listing.grossArea}
                  </span>
                </div>

                <span
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold"
                  style={{ color: 'var(--site-primary)' }}
                >
                  {detailsLabel}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </DemoChrome>
  )
}
