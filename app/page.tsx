import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { Hero } from '@/components/hero'
import { Features } from '@/components/features'
import { HowItWorks } from '@/components/how-it-works'
import { Showcase } from '@/components/showcase'
import { Pricing } from '@/components/pricing'
import { BlogPreview } from '@/components/blog-preview'
import { Faq } from '@/components/faq'
import { FinalCta } from '@/components/final-cta'
import { SiteFooter } from '@/components/site-footer'

// The homepage inherits title/description/OG from the root layout; it only needs
// its own canonical so `https://gloval.ai/` is the single indexable home URL.
export const metadata: Metadata = {
  alternates: { canonical: '/' },
}

// Site-wide structured data. Anchored on the homepage because it is the
// canonical root and the highest-authority page. Only claims that match the
// visible product: the brand/site identity and a freemium web-app with a real
// free tier. No fabricated ratings or reviews.
const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://gloval.ai/#organization',
      name: 'GLOVAL AI',
      url: 'https://gloval.ai',
      logo: 'https://gloval.ai/icon-512x512.png',
      description:
        'Yapay zeka ile saniyeler içinde çalışan, gerçek web siteleri kuran platform.',
    },
    {
      '@type': 'WebSite',
      '@id': 'https://gloval.ai/#website',
      url: 'https://gloval.ai',
      name: 'GLOVAL AI',
      inLanguage: ['tr-TR', 'en'],
      publisher: { '@id': 'https://gloval.ai/#organization' },
    },
    {
      '@type': 'SoftwareApplication',
      name: 'GLOVAL AI',
      applicationCategory: 'WebApplication',
      operatingSystem: 'Web',
      url: 'https://gloval.ai',
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

export default function Page() {
  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        // Authored in-repo, not user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <SiteHeader />
      <main>
        <Hero />
        <HowItWorks />
        <Showcase />
        <Features />
        <Pricing />
        <BlogPreview />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  )
}
