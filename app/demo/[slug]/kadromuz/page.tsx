import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getDemo, demoSlugs, buildDemoSite } from '@/lib/demos'
import { resolveTeam } from '@/lib/team'
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
  const resolved = resolveTeam(buildDemoSite(demo, lang))
  if (!resolved.active) return { title: 'Demo bulunamadı' }
  return {
    title: `${resolved.title} | ${demo.brand[lang]}`,
    description:
      lang === 'en'
        ? `Fictional example team from the ${demo.brand.en} demo.`
        : `${demo.brand.tr} demosundaki kurgusal örnek kadro.`,
    robots: { index: false, follow: true },
  }
}

export default async function DemoTeamPage(props: Props) {
  const { slug } = await props.params
  const { lang: langParam } = await props.searchParams
  const demo = getDemo(slug)
  if (!demo) notFound()
  if (!resolveTeam(buildDemoSite(demo, langParam === 'en' ? 'en' : 'tr')).active) notFound()
  return <DemoPage {...props} initialPage="team" />
}
