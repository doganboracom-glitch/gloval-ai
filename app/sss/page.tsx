import type { Metadata } from 'next'
import { FaqPageClient } from '@/components/content/faq-page-client'
import { getFaqItems } from '@/lib/content/faq'

/**
 * Metadata is emitted from this server component while the page body renders on
 * the client, because the active language lives in client context. Turkish is
 * used for the crawlable metadata to match the site default (`<html lang="tr">`).
 */
export const metadata: Metadata = {
  title: 'Sık Sorulan Sorular | GLOVAL AI',
  description:
    'GLOVAL AI hakkında sık sorulan sorular: web sitesi oluşturma, alan adı bağlama, kurumsal e-posta, yayınlama ve planlar hakkında merak edilenler.',
  alternates: { canonical: '/sss' },
  openGraph: {
    type: 'website',
    url: '/sss',
    title: 'Sık Sorulan Sorular | GLOVAL AI',
    description:
      'GLOVAL AI hakkında merak ettiğiniz soruların cevaplarını keşfedin.',
  },
}

export default function FaqPage() {
  const items = getFaqItems()

  // FAQPage structured data: lets search engines surface these answers directly.
  // Built from the same source the UI renders, so the two cannot disagree.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question.tr,
      acceptedAnswer: { '@type': 'Answer', text: item.answer.tr },
    })),
  }

  return (
    <>
      <script
        type="application/ld+json"
        // Content is authored in-repo, not user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <FaqPageClient />
    </>
  )
}
