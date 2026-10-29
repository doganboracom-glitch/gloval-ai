import type { Metadata } from 'next'
import { DomainSearchPageClient } from '@/components/domains/domain-search-page-client'
import { isPublicDomainSearchOpen } from '@/lib/custom-domains/public-search/defaults'
import { MAX_QUERY_LENGTH } from '@/lib/custom-domains/public-search/validate'
import { buildPageMetadata, resolveSeoLang } from '@/lib/seo/page-seo'
import { createClient } from '@/lib/supabase/server'

type SearchParams = Promise<{ lang?: string | string[]; q?: string | string[] }>

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const { lang, q } = await searchParams
  const metadata = buildPageMetadata('domainSearch', resolveSeoLang(lang))
  // Parametrised search URLs are never indexed; the canonical stays the clean page.
  return first(q) ? { ...metadata, robots: { index: false, follow: true } } : metadata
}

export default async function DomainSearchPage({ searchParams }: { searchParams: SearchParams }) {
  const { q } = await searchParams
  const initialQuery = (first(q) ?? '').slice(0, MAX_QUERY_LENGTH)

  let authenticated = false
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    authenticated = Boolean(data.user)
  } catch {
    authenticated = false
  }

  return (
    <DomainSearchPageClient
      open={isPublicDomainSearchOpen()}
      authenticated={authenticated}
      initialQuery={initialQuery}
    />
  )
}
