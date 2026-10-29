import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isWhoisLookupEnabled } from '@/lib/domains/feature-flags'
import { WhoisPageClient } from '@/components/whois/whois-page-client'
import { buildPageMetadata, resolveSeoLang } from '@/lib/seo/page-seo'
import { MAX_WHOIS_INPUT_LENGTH } from '@/lib/whois/constants'

type SearchParams = Promise<{ lang?: string | string[]; q?: string | string[] }>

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const { lang, q } = await searchParams
  const metadata = buildPageMetadata('whois', resolveSeoLang(lang))
  // Parametrised lookups are never indexed; the canonical stays the clean page.
  return first(q) ? { ...metadata, robots: { index: false, follow: true } } : metadata
}

export default async function WhoisPage({ searchParams }: { searchParams: SearchParams }) {
  if (!isWhoisLookupEnabled()) notFound()
  const { q } = await searchParams
  const initialQuery = (first(q) ?? '').slice(0, MAX_WHOIS_INPUT_LENGTH)
  return <WhoisPageClient initialQuery={initialQuery} />
}
