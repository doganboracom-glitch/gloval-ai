import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { Hero } from '@/components/hero'
import { Features } from '@/components/features'
import { HowItWorks } from '@/components/how-it-works'
import { Showcase } from '@/components/showcase'
import { Pricing } from '@/components/pricing'
import { BlogPreview } from '@/components/blog-preview-section'
import { Faq } from '@/components/faq'
import { FinalCta } from '@/components/final-cta'
import { SiteFooter } from '@/components/site-footer'
import { buildPageMetadata, resolveSeoLang } from '@/lib/seo/page-seo'
import { getRequestUser } from '@/lib/supabase/request-user'
import { COMPANY } from '@/lib/legal/company'
import { ORGANIZATION_DATA, serializeJsonLd } from '@/lib/legal/organization'

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string | string[] }>
}): Promise<Metadata> {
  const { lang } = await searchParams
  return buildPageMetadata('home', resolveSeoLang(lang))
}

// Site-wide structured data. Anchored on the homepage because it is the
// canonical root and the highest-authority page. Only claims that match the
// visible product: the brand/site identity and a freemium web-app with a real
// free tier. No fabricated ratings or reviews.
const siteUrl = COMPANY.siteUrl.replace(/\/+$/, '')
const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      ...ORGANIZATION_DATA,
      description:
        'Yapay zeka ile saniyeler içinde çalışan, gerçek web siteleri kuran platform.',
    },
    {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      url: COMPANY.siteUrl,
      name: COMPANY.brandName,
      inLanguage: ['tr-TR', 'en'],
      publisher: { '@id': ORGANIZATION_DATA['@id'] },
    },
    {
      '@type': 'SoftwareApplication',
      name: COMPANY.brandName,
      applicationCategory: 'WebApplication',
      operatingSystem: 'Web',
      url: COMPANY.siteUrl,
      description:
        'Yapay zeka ile kod yazmadan işletmeniz için web sitesi oluşturun, alan adı bağlayın ve yayınlayın.',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'TRY',
      },
      publisher: { '@id': 'https://gloval.ai/#organization' },
    },
  ],
}

export default async function Page() {
  const authState = await getRequestUser()
  const isAuthenticated = authState.kind === 'authenticated'

  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        // Authored in-repo, not user input.
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
      />
      <SiteHeader />
      <main>
        <Hero />
        <HowItWorks />
        <Showcase />
        <Features />
        <Pricing
          isAuthenticated={isAuthenticated}
          makerRequestsEnabled={process.env.MAKER_REQUESTS_ENABLED === '1'}
        />
        <BlogPreview />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  )
}
