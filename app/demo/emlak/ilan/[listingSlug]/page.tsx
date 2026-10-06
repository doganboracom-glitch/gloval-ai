import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  MapPin,
  BedDouble,
  Bath,
  Maximize2,
  Ruler,
  CalendarClock,
  Building2,
  Check,
} from 'lucide-react'
import { getEmlakListing, emlakListingSlugs } from '@/lib/demo-data'
import { DemoChrome } from '@/components/demo-site/demo-chrome'
import { EmlakGallery } from '@/components/demo-site/emlak-gallery'

export function generateStaticParams() {
  return emlakListingSlugs.map((listingSlug) => ({ listingSlug }))
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
  params: Promise<{ listingSlug: string }>
  searchParams: Promise<{ lang?: string }>
}): Promise<Metadata> {
  const { listingSlug } = await params
  const { lang: langParam } = await searchParams
  const lang = resolveLang(langParam)
  const listing = getEmlakListing(listingSlug)
  if (!listing) return { title: lang === 'tr' ? 'İlan bulunamadı' : 'Listing not found' }
  const brand = lang === 'tr' ? 'Emlak Vizyon' : 'Vista Realty'
  return {
    title: `${listing.title[lang]} | ${brand}`,
    description: `${brand} ${listing.title[lang]} ${lang === 'tr' ? 'ilanı' : 'listing'}. ${listing.description[lang]}`,
    robots: { index: false, follow: true },
  }
}

export default async function EmlakListingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ listingSlug: string }>
  searchParams: Promise<{ lang?: string }>
}) {
  const { listingSlug } = await params
  const { lang: langParam } = await searchParams
  const lang = resolveLang(langParam)
  const listing = getEmlakListing(listingSlug)
  if (!listing) notFound()

  const backToListings = lang === 'tr' ? 'İlanlara Dön' : 'Back to Listings'
  const backToHome = lang === 'tr' ? 'Ana Sayfaya Dön' : 'Back to Home'
  const specsLabel = lang === 'tr' ? 'İlan Bilgileri' : 'Property Details'
  const featuresLabel = lang === 'tr' ? 'Özellikler' : 'Features'
  const descLabel = lang === 'tr' ? 'Açıklama' : 'Description'
  const contactTitle = lang === 'tr' ? 'Bu ilan ilginizi mi çekti?' : 'Interested in this property?'
  const contactSub =
    lang === 'tr'
      ? 'Uzman danışmanlarımız size yardımcı olmaktan memnuniyet duyar.'
      : 'Our expert advisors would be glad to help you.'
  const bookLabel = lang === 'tr' ? 'Randevu Al' : 'Book a Viewing'
  const infoLabel = lang === 'tr' ? 'Bilgi Al' : 'Request Info'

  const specs = [
    { icon: BedDouble, label: lang === 'tr' ? 'Oda Sayısı' : 'Rooms', value: listing.rooms },
    { icon: Bath, label: lang === 'tr' ? 'Banyo' : 'Bathrooms', value: listing.bathrooms },
    { icon: Maximize2, label: lang === 'tr' ? 'Brüt m²' : 'Gross area', value: listing.grossArea },
    { icon: Ruler, label: lang === 'tr' ? 'Net m²' : 'Net area', value: listing.netArea },
    { icon: CalendarClock, label: lang === 'tr' ? 'Bina Yaşı' : 'Building age', value: listing.buildingAge[lang] },
    { icon: Building2, label: lang === 'tr' ? 'Kat' : 'Floor', value: listing.floor[lang] },
  ]

  return (
      <DemoChrome slug="emlak" lang={lang}>
      <article className="mx-auto w-full max-w-5xl px-6 py-10 sm:py-14">
        <Link
          href={`/demo/emlak/ilanlar?lang=${lang}`}
          className="inline-flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-70"
          style={{ color: 'var(--site-muted-fg)' }}
        >
          <ArrowLeft className="h-4 w-4" />
          {backToListings}
        </Link>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--site-muted-fg)' }}>
              <MapPin className="h-4 w-4" />
              {listing.location[lang]}
            </div>
            <h1
              className="mt-1 text-pretty text-3xl font-bold sm:text-4xl"
              style={{ fontFamily: 'var(--site-heading-font)', color: 'var(--site-fg)' }}
            >
              {listing.title[lang]}
            </h1>
          </div>
          <p className="text-2xl font-bold sm:text-3xl" style={{ color: 'var(--site-primary)' }}>
            {listing.price}
          </p>
        </div>

        <div className="mt-6">
          <EmlakGallery images={listing.gallery} alt={listing.title[lang]} />
        </div>

        {/* Specs */}
        <h2
          className="mt-12 text-xl font-bold"
          style={{ fontFamily: 'var(--site-heading-font)', color: 'var(--site-fg)' }}
        >
          {specsLabel}
        </h2>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {specs.map((spec) => (
            <div
              key={spec.label}
              className="flex items-center gap-3 p-4"
              style={{
                borderRadius: 'var(--site-radius)',
                border: '1px solid var(--site-border)',
                backgroundColor: 'var(--site-card)',
              }}
            >
              <spec.icon className="h-5 w-5 shrink-0" style={{ color: 'var(--site-primary)' }} />
              <div className="min-w-0">
                <dt className="text-xs" style={{ color: 'var(--site-muted-fg)' }}>
                  {spec.label}
                </dt>
                <dd className="truncate text-sm font-semibold" style={{ color: 'var(--site-fg)' }}>
                  {spec.value}
                </dd>
              </div>
            </div>
          ))}
        </dl>

        <div className="mt-12 grid gap-10 lg:grid-cols-[1.5fr_1fr]">
          {/* Description */}
          <div>
            <h2
              className="text-xl font-bold"
              style={{ fontFamily: 'var(--site-heading-font)', color: 'var(--site-fg)' }}
            >
              {descLabel}
            </h2>
            <p className="mt-3 text-pretty text-sm leading-relaxed sm:text-base" style={{ color: 'var(--site-muted-fg)' }}>
              {listing.description[lang]}
            </p>

            <h2
              className="mt-8 text-xl font-bold"
              style={{ fontFamily: 'var(--site-heading-font)', color: 'var(--site-fg)' }}
            >
              {featuresLabel}
            </h2>
            <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {listing.features.map((feature) => (
                <li key={feature[lang]} className="flex items-center gap-2 text-sm" style={{ color: 'var(--site-fg)' }}>
                  <Check className="h-4 w-4 shrink-0" style={{ color: 'var(--site-primary)' }} />
                  {feature[lang]}
                </li>
              ))}
            </ul>
          </div>

          {/* Contact / booking card */}
          <aside
            className="h-fit p-6 lg:sticky lg:top-32"
            style={{
              borderRadius: 'var(--site-radius)',
              border: '1px solid var(--site-border)',
              backgroundColor: 'var(--site-card)',
            }}
          >
            <h2
              className="text-lg font-bold"
              style={{ fontFamily: 'var(--site-heading-font)', color: 'var(--site-fg)' }}
            >
              {contactTitle}
            </h2>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--site-muted-fg)' }}>
              {contactSub}
            </p>
            <div className="mt-5 flex flex-col gap-3">
              <Link
                href={`/demo/emlak?lang=${lang}#contact`}
                className="inline-flex items-center justify-center px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
                style={{
                  borderRadius: 'var(--site-radius)',
                  backgroundColor: 'var(--site-primary)',
                  color: 'var(--site-primary-fg)',
                }}
              >
                {bookLabel}
              </Link>
              <Link
                href={`/demo/emlak?lang=${lang}#contact`}
                className="inline-flex items-center justify-center px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
                style={{
                  borderRadius: 'var(--site-radius)',
                  border: '1px solid var(--site-border)',
                  color: 'var(--site-fg)',
                }}
              >
                {infoLabel}
              </Link>
            </div>
          </aside>
        </div>

        <div className="mt-12 border-t pt-6" style={{ borderColor: 'var(--site-border)' }}>
          <Link
            href={`/demo/emlak?lang=${lang}`}
            className="inline-flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-70"
            style={{ color: 'var(--site-muted-fg)' }}
          >
            <ArrowLeft className="h-4 w-4" />
            {backToHome}
          </Link>
        </div>
      </article>
      </DemoChrome>
  )
}
