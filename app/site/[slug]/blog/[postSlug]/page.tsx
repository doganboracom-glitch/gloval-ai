import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublishedSite } from '@/lib/projects'
import { getSiteSeoContext } from '@/lib/seo/site-seo'
import { buildTenantSocialMetadata } from '@/lib/seo/site-sharing'
import { getPublishedSiteCommerceMode, getCatalogContext } from '@/lib/commerce-mode-server'
import { blogHrefBase, getLiveBlogPost, getLiveBlogPosts } from '@/lib/blog-server'
import {
  adjacentPosts,
  blogJsonLdScript,
  blogPostPath,
  blogPostingJsonLd,
  breadcrumbJsonLd,
  isPostIndexable,
  postDescription,
  postTitle,
  relatedPosts,
} from '@/lib/blog'
import { StoreSiteShell } from '@/components/store/store-site-shell'
import { buildSiteBlogData } from '@/lib/blog-site'
import { BlogPostView, blogCopy } from '@/components/blog/blog-views'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string; postSlug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, postSlug } = await params
  const site = await getPublishedSite(slug)
  if (!site) notFound()
  const post = await getLiveBlogPost(slug, postSlug)
  if (!post) notFound()
  const seo = await getSiteSeoContext(slug)
  const canonical = `${seo.origin}${blogPostPath(post.slug)}`
  const title = postTitle(post)
  const description = postDescription(post)
  // First-setup posts stay out of search until personalized, but links on them are followed.
  return buildTenantSocialMetadata({
    site,
    slug,
    origin: seo.origin,
    lastModified: seo.lastModified,
    canonical,
    title,
    description,
    type: 'article',
    article: {
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      tags: post.keywords,
    },
    robots: isPostIndexable(post) ? { index: true, follow: true } : { index: false, follow: true },
  })
}

export default async function BlogPostPage({ params }: Props) {
  const { slug, postSlug } = await params
  const site = await getPublishedSite(slug)
  if (!site) notFound()
  const post = await getLiveBlogPost(slug, postSlug)
  if (!post) notFound()

  const [all, seo, mode, hrefBase] = await Promise.all([
    getLiveBlogPosts(slug),
    getSiteSeoContext(slug),
    getPublishedSiteCommerceMode(slug),
    blogHrefBase(slug),
  ])
  const catalog = await getCatalogContext(slug, site.schema, mode)
  const lang = site.schema.meta.language
  const url = `${seo.origin}${blogPostPath(post.slug)}`
  const { previous, next } = adjacentPosts(all, post.slug)
  const copy = blogCopy(lang)

  const jsonLd = [
    blogPostingJsonLd({ post, url, siteName: site.name, origin: seo.origin, lang }),
    breadcrumbJsonLd([
      { name: copy.home, url: `${seo.origin}/` },
      { name: copy.blog, url: `${seo.origin}/blog` },
      { name: post.title, url },
    ]),
  ]

  return (
    <StoreSiteShell
      site={site.schema}
      slug={slug}
      mode={mode}
      whatsappNumber={catalog.whatsappNumber}
      origin={catalog.origin}
      blog={buildSiteBlogData(hrefBase, all)}
    >
      <BlogPostView
        post={post}
        previous={previous}
        next={next}
        related={relatedPosts(all, post)}
        lang={lang}
        hrefBase={hrefBase}
      />
      {jsonLd.map((entry, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: blogJsonLdScript(entry) }} />
      ))}
    </StoreSiteShell>
  )
}
