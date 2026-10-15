import type { Metadata } from 'next'
import { FaqPageClient } from '@/components/content/faq-page-client'
import { getFaqItems } from '@/lib/content/faq'
import { buildPageMetadata, resolveSeoLang } from '@/lib/seo/page-seo'

/**
 * Metadata is emitted from this server component while the page body renders on
 * the client. It is Turkish unless the URL carries an explicit `?lang=en`.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string | string[] }>
}): Promise<Metadata> {
  const { lang } = await searchParams
  return buildPageMetadata('faq', resolveSeoLang(lang))
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
