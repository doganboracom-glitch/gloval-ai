import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { BlogPostClient } from '@/components/content/blog-post-client'
import { getPost, getPosts, getRedirectTarget, getRelatedPosts } from '@/lib/content/blog'
import { platformPostJsonLd, serializeJsonLd } from '@/lib/blog-jsonld'
import { OG_IMAGE_SIZE, ogImageUrlForPost } from '@/lib/seo/page-seo'

/** Posts are admin-managed: pages are regenerated at most every 5 minutes, and instantly when an admin saves. */
export const revalidate = 300

export async function generateStaticParams() {
  return (await getPosts()).map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = await getPost(slug)
  if (!post) return { title: 'Blog | GLOVAL AI', robots: { index: false, follow: false } }

  // Turkish is the primary content language, so TR copy drives the tags. Static
  // metadata cannot read the client-side language toggle, so it is not localized
  // per request.
  const title = post.seoTitle.tr
  const description = post.seoDescription.tr
  // A post's own cover wins; otherwise the generated 1200x630 share image
  // (title on the brand background) is used so every share has a real preview.
  const image = {
    url: post.coverImage ?? ogImageUrlForPost(post.slug),
    ...OG_IMAGE_SIZE,
    alt: post.coverAlt?.tr ?? title,
  }
  return {
    title,
    description,
    keywords: post.tags,
    alternates: { canonical: `/blog/${post.slug}` },
    ...(post.noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      type: 'article',
      siteName: 'GLOVAL AI',
      locale: 'tr_TR',
      title,
      description,
      url: `/blog/${post.slug}`,
      images: [image],
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [{ url: image.url, alt: image.alt }],
    },
  }
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = await getPost(slug)
  if (!post) {
    // A renamed post keeps answering on its old address with a permanent redirect.
    const target = await getRedirectTarget(slug)
    if (target) permanentRedirect(`/blog/${target}`)
    notFound()
  }

  const related = await getRelatedPosts(post, 3)

  // BlogPosting structured data (Turkish-first, matching the crawlable
  // metadata). Built from the same post record the page renders, so the schema
  // can never disagree with the visible article.
  const jsonLd = platformPostJsonLd(post)

  return (
    <>
      <script
        type="application/ld+json"
        // Admin-authored text: `<` is escaped so no value can close the script tag.
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <BlogPostClient post={post} related={related} />
    </>
  )
}
