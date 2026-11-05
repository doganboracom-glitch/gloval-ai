import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { BlogPostClient } from '@/components/content/blog-post-client'
import { getPost, getPosts, getRedirectTarget, getRelatedPosts } from '@/lib/content/blog'
import { platformPostJsonLd, serializeJsonLd } from '@/lib/blog-jsonld'
import { OG_IMAGE_SIZE, ogImageUrlForPost } from '@/lib/seo/page-seo'

/** Posts are admin-managed: pages are regenerated at most every 5 minutes, and instantly when an admin saves. */
export const revalidate = 300

const IYZICO_COLLABORATION_SLUG = 'iyzico-gloval-ai-isbirligi-e-ticaret-websiteni-bugun-kur'
const IYZICO_LINKEDIN_IMAGE = {
  url: '/blog/isbirligi/iyzico-gloval-linkedin-1200x627.png',
  width: 1200,
  height: 627,
  alt: 'iyzico × GLOVAL AI iş birliği duyurusu: e-ticaret mağazanı kur, iyzico ile ödeme al; %2.29 oranı 7 gün vade dipnotuyla.',
}
const IYZICO_X_IMAGE = {
  url: '/blog/isbirligi/iyzico-gloval-x-1200x675.png',
  width: 1200,
  height: 675,
  alt: 'iyzico × GLOVAL AI iş birliği: e-ticaret web siteni bugün kur; 7 gün vadede %2.29 ödeme duyurusu.',
}

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
  // This announcement has dedicated crops for Open Graph (LinkedIn) and X;
  // other posts use their cover or a generated 1200x630 share image.
  const image = {
    url: post.coverImage ?? ogImageUrlForPost(post.slug),
    ...OG_IMAGE_SIZE,
    alt: post.coverAlt?.tr ?? title,
  }
  const openGraphImage = post.slug === IYZICO_COLLABORATION_SLUG ? IYZICO_LINKEDIN_IMAGE : image
  const twitterImage = post.slug === IYZICO_COLLABORATION_SLUG ? IYZICO_X_IMAGE : image
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
      images: [openGraphImage],
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [{ url: twitterImage.url, alt: twitterImage.alt }],
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
