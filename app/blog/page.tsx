import type { Metadata } from 'next'
import { BlogListClient } from '@/components/content/blog-list-client'
import { buildPageMetadata, resolveSeoLang } from '@/lib/seo/page-seo'

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string | string[] }>
}): Promise<Metadata> {
  const { lang } = await searchParams
  return buildPageMetadata('blog', resolveSeoLang(lang))
}

export default function BlogPage() {
  return <BlogListClient />
}
