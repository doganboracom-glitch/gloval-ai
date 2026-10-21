import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getDemo, demoSlugs, buildDemoSite } from '@/lib/demos'
import { detailDescription, resolveAboutDetail } from '@/lib/section-detail'
import DemoPage from '../page'

export function generateStaticParams() {
  return demoSlugs.map((slug) => ({ slug }))
}

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ lang?: string; preview?: string }>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params
  const { lang: langParam } = await searchParams
  const demo = getDemo(slug)
  if (!demo) return { title: 'Demo bulunamadı' }
  const lang = langParam === 'en' ? 'en' : 'tr'
  const resolved = resolveAboutDetail(buildDemoSite(demo, lang))
  if (!resolved) return { title: 'Demo bulunamadı' }
  return {
    title: `${resolved.pageTitle} | ${demo.brand[lang]}`,
    description: detailDescription(resolved),
    robots: { index: false, follow: true },
  }
}

export default async function DemoAboutPage(props: Props) {
  const { slug } = await props.params
  const { lang } = await props.searchParams
  const demo = getDemo(slug)
  if (!demo) notFound()
  if (!resolveAboutDetail(buildDemoSite(demo, lang === 'en' ? 'en' : 'tr'))?.pageActive) notFound()
  return <DemoPage {...props} initialPage="about" />
}
