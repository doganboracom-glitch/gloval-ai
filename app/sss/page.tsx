import type { Metadata } from 'next'
import { FaqPageClient } from '@/components/content/faq-page-client'
import { getFaqJsonLd, getFaqSupportHref } from '@/lib/content/faq'
import { getRequestUser } from '@/lib/supabase/request-user'
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

export default async function FaqPage() {
  const requestUser = await getRequestUser()
  const supportHref = getFaqSupportHref(requestUser.kind)
  const jsonLd = getFaqJsonLd()

  return (
    <>
      <script
        type="application/ld+json"
        // Content is authored in-repo, not user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <FaqPageClient supportHref={supportHref} />
    </>
  )
}
