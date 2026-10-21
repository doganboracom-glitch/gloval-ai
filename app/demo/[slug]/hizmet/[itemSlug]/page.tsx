import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getDemo, buildDemoSite } from '@/lib/demos'
import { findPublicService, resolveServices } from '@/lib/service-pages'
import DemoPage from '../../page'

type Props = {
  params: Promise<{ slug: string; itemSlug: string }>
  searchParams: Promise<{ lang?: string; preview?: string }>
}

function lookup(slug: string, itemSlug: string, langParam: string | undefined) {
  const demo = getDemo(slug)
  if (!demo) return null
  const language = langParam === 'en' ? ('en' as const) : ('tr' as const)
  const site = buildDemoSite(demo, language)
  const resolved = resolveServices(site)
  if (!resolved?.pageActive) return null
  const found = findPublicService(site, resolved.listSlug, itemSlug)
  if (!found) return null
  return { demo, lang: language, entry: found.entry }
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug, itemSlug } = await params
  const { lang } = await searchParams
  const found = lookup(slug, itemSlug, lang)
  if (!found) return { title: 'Demo bulunamadı' }
  return {
    title: `${found.entry.title} | ${found.demo.brand[found.lang]}`,
    description: found.entry.description,
    robots: { index: false, follow: true },
  }
}

export default async function DemoServicePage(props: Props) {
  const { slug, itemSlug } = await props.params
  const { lang } = await props.searchParams
  if (!lookup(slug, itemSlug, lang)) notFound()
  return <DemoPage params={props.params} searchParams={props.searchParams} initialPage="services" initialService={itemSlug} />
}
