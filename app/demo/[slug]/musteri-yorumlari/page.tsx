import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getDemo, demoSlugs, buildDemoSite } from '@/lib/demos'
import { resolveTestimonials } from '@/lib/testimonials'
import DemoPage from '../page'

export function generateStaticParams() {
  return demoSlugs.map((slug) => ({ slug }))
}

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ lang?: string; preview?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const demo = getDemo(slug)
  if (!demo) return { title: 'Demo bulunamadı' }
  const resolved = resolveTestimonials(buildDemoSite(demo, 'tr'), { demo: true })
  if (!resolved.active) return { title: 'Demo bulunamadı' }
  return {
    title: `${resolved.title} | ${demo.brand.tr}`,
    description: `${demo.brand.tr} demosundaki kurgusal örnek müşteri yorumları.`,
    robots: { index: false, follow: true },
  }
}

export default async function DemoTestimonialsPage(props: Props) {
  const { slug } = await props.params
  const demo = getDemo(slug)
  if (!demo) notFound()
  if (!resolveTestimonials(buildDemoSite(demo, 'tr'), { demo: true }).active) notFound()
  return <DemoPage {...props} initialPage="testimonials" />
}
