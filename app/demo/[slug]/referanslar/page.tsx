import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getDemo, demoSlugs, buildDemoSite } from '@/lib/demos'
import { resolveReferences } from '@/lib/references'
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
  const lang = langParam === 'en' ? 'en' : 'tr'
  const demo = getDemo(slug)
  if (!demo) return { title: 'Demo bulunamadı' }
  const resolved = resolveReferences(buildDemoSite(demo, lang), { demo: true })
  if (!resolved.active) return { title: 'Demo bulunamadı' }
  return {
    title: `${resolved.title} | ${demo.brand[lang]}`,
    description:
      lang === 'en'
        ? `Fictional example references from the ${demo.brand.en} demo.`
        : `${demo.brand.tr} demosundaki kurgusal örnek referanslar.`,
    robots: { index: false, follow: true },
  }
}

export default async function DemoReferencesPage(props: Props) {
  const { slug } = await props.params
  const { lang: langParam } = await props.searchParams
  const demo = getDemo(slug)
  if (!demo) notFound()
  if (!resolveReferences(buildDemoSite(demo, langParam === 'en' ? 'en' : 'tr'), { demo: true }).active) notFound()
  return <DemoPage {...props} initialPage="references" />
}
