import type { Metadata } from 'next'
import { BlogListClient } from '@/components/content/blog-list-client'
import { getPosts, getUsedCategories } from '@/lib/content/blog'
import { buildPageMetadata, resolveSeoLang } from '@/lib/seo/page-seo'

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string | string[] }>
}): Promise<Metadata> {
  const { lang } = await searchParams
  return buildPageMetadata('blog', resolveSeoLang(lang))
}

export default async function BlogPage() {
  const posts = await getPosts()
  // Only categories that actually have posts, so no filter leads to a dead end.
  const categories = await getUsedCategories(posts)
  return <BlogListClient posts={posts} categories={categories} />
}
