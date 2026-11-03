import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { GuideArticlePage } from '@/components/content/guide-article-page'
import { getGuideBySlug, GUIDES } from '@/lib/content/guides'
import { buildGuideArticleMetadata } from '@/lib/seo/guide-seo'
import { resolveSeoLang } from '@/lib/seo/page-seo'

type GuideArticleRouteProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ lang?: string | string[] }>
}

export const dynamicParams = false

export function generateStaticParams() {
  return GUIDES.map(({ slug }) => ({ slug }))
}

export async function generateMetadata({
  params,
  searchParams,
}: GuideArticleRouteProps): Promise<Metadata> {
  const [{ slug }, { lang }] = await Promise.all([params, searchParams])
  const guide = getGuideBySlug(slug)
  if (!guide) notFound()

  return buildGuideArticleMetadata(guide, resolveSeoLang(lang))
}

export default async function GuideArticleRoute({
  params,
  searchParams,
}: GuideArticleRouteProps) {
  const [{ slug }, { lang }] = await Promise.all([params, searchParams])
  const guide = getGuideBySlug(slug)
  if (!guide) notFound()

  return <GuideArticlePage guide={guide} locale={resolveSeoLang(lang)} />
}
