import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getDemo, demoSlugs, buildDemoSite } from '@/lib/demos'
import { resolveServices } from '@/lib/service-pages'
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
  const resolved = resolveServices(buildDemoSite(demo, lang))
  if (!resolved?.pageActive) return { title: 'Demo bulunamadı' }
  return {
    title: `${resolved.listTitle} | ${demo.brand[lang]}`,
    description:
      lang === 'tr'
        ? `${demo.brand[lang]} tarafından sunulan hizmetler. Bu bir gloval.ai demo çalışmasıdır.`
        : `Services offered by ${demo.brand[lang]}. This is a gloval.ai demo project.`,
    robots: { index: false, follow: true },
  }
}

export default async function DemoServicesPage(props: Props) {
  const { slug } = await props.params
  const { lang } = await props.searchParams
  const demo = getDemo(slug)
  if (!demo) notFound()
  if (!resolveServices(buildDemoSite(demo, lang === 'en' ? 'en' : 'tr'))?.pageActive) notFound()
  return <DemoPage {...props} initialPage="services" />
}
