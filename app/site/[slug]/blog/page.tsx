import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublishedSite } from '@/lib/projects'
import { getSiteSeoContext } from '@/lib/seo/site-seo'
import { getPublishedSiteCommerceMode, getCatalogContext } from '@/lib/commerce-mode-server'
import { blogHrefBase, getLiveBlogPosts } from '@/lib/blog-server'
import { blogListPath, paginatePosts } from '@/lib/blog'
import { StoreSiteShell } from '@/components/store/store-site-shell'
import { BlogIndexView, blogCopy } from '@/components/blog/blog-views'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string | string[] }>
}

function pageParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params
  const site = await getPublishedSite(slug)
  if (!site) notFound()
  const posts = await getLiveBlogPosts(slug)
  const pagination = paginatePosts(posts.length, pageParam((await searchParams).page))
  if (posts.length === 0 || !pagination) notFound()
  const { origin } = await getSiteSeoContext(slug)
  const lang = site.schema.meta.language
  const title = `${blogCopy(lang).blog} — ${site.name}`
  const canonical = `${origin}${blogListPath(pagination.page)}`
  return {
    title,
    alternates: { canonical, types: { 'application/rss+xml': `${origin}/blog/rss.xml` } },
    openGraph: { title, url: canonical, type: 'website' },
  }
}

export default async function BlogIndexPage({ params, searchParams }: Props) {
  const { slug } = await params
  const site = await getPublishedSite(slug)
  if (!site) notFound()
  const posts = await getLiveBlogPosts(slug)
  const pagination = paginatePosts(posts.length, pageParam((await searchParams).page))
  if (posts.length === 0 || !pagination) notFound()

  const [mode, hrefBase] = await Promise.all([getPublishedSiteCommerceMode(slug), blogHrefBase(slug)])
  const catalog = await getCatalogContext(slug, site.schema, mode)
  const lang = site.schema.meta.language

  return (
    <StoreSiteShell
      site={site.schema}
      slug={slug}
      mode={mode}
      whatsappNumber={catalog.whatsappNumber}
      origin={catalog.origin}
      blogHref={`${hrefBase}/blog`}
    >
      <BlogIndexView
        posts={posts.slice(pagination.start, pagination.end)}
        pagination={pagination}
        lang={lang}
        hrefBase={hrefBase}
        siteName={site.name}
      />
    </StoreSiteShell>
  )
}
