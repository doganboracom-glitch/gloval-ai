import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BlogPostClient } from '@/components/content/blog-post-client'
import { getPost, getPosts, getRelatedPosts } from '@/lib/content/blog'

/**
 * Pre-renders every post at build time. The content service is currently
 * static, so this is exhaustive; if it moves to a CMS this stays correct but
 * would need a revalidate window alongside it.
 */
export function generateStaticParams() {
  return getPosts().map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) return { title: 'Blog | GLOVAL AI' }

  // Turkish is the primary content language, so TR copy drives the tags. Static
  // metadata cannot read the client-side language toggle, so it is not localized
  // per request.
  const title = post.seoTitle.tr
  const description = post.seoDescription.tr
  return {
    title,
    description,
    keywords: post.keywords.tr,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: 'article',
      title,
      description,
      url: `/blog/${post.slug}`,
      // Only advertise an OG image when the post actually has one; pointing at a
      // missing file would render a broken preview card on every share.
      ...(post.coverImage
        ? {
            images: [
              {
                url: post.coverImage,
                width: 1200,
                height: 630,
                alt: post.coverAlt?.tr ?? title,
              },
            ],
          }
        : {}),
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
    },
    twitter: {
      card: post.coverImage ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(post.coverImage ? { images: [post.coverImage] } : {}),
    },
  }
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) notFound()

  const related = getRelatedPosts(post.slug, 3)

  // BlogPosting structured data (Turkish-first, matching the crawlable
  // metadata). Built from the same post record the page renders, so the schema
  // can never disagree with the visible article.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.seoTitle.tr,
    description: post.seoDescription.tr,
    inLanguage: 'tr-TR',
    datePublished: post.publishedAt,
    dateModified: post.updatedAt ?? post.publishedAt,
    author: { '@type': 'Organization', name: post.author },
    publisher: {
      '@type': 'Organization',
      name: 'GLOVAL AI',
      logo: {
        '@type': 'ImageObject',
        url: 'https://gloval.ai/icon-512x512.png',
      },
    },
    mainEntityOfPage: `https://gloval.ai/blog/${post.slug}`,
    ...(post.coverImage
      ? {
          image: [
            post.coverImage.startsWith('http')
              ? post.coverImage
              : `https://gloval.ai${post.coverImage}`,
          ],
        }
      : {}),
  }

  return (
    <>
      <script
        type="application/ld+json"
        // Authored in-repo, not user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <BlogPostClient post={post} related={related} />
    </>
  )
}
