import { aiPosts } from './ai'
import { webDesignPosts } from './web-design'
import { seoPosts } from './seo'
import { marketingPosts } from './marketing'
import { ecommercePosts } from './ecommerce'
import { glovalPosts } from './gloval'
import { guidesPosts } from './guides'
import { extrasA } from './extras-a'
import { extrasB } from './extras-b'
import { extrasC } from './extras-c'
import type { OriginalPost } from './types'

export type { OriginalPost } from './types'

const extras: Record<string, string> = { ...extrasA, ...extrasB, ...extrasC }

/** Places the extra section right before the post's final heading (its closing checklist). */
function withExtra(post: OriginalPost): OriginalPost {
  const extra = extras[post.slug]
  if (!extra) return post
  const lastHeading = post.body.lastIndexOf('\n## ')
  const body =
    lastHeading === -1
      ? `${post.body}\n\n${extra}`
      : `${post.body.slice(0, lastHeading)}\n\n${extra}\n${post.body.slice(lastHeading)}`
  return { ...post, body }
}

export const originalPosts: OriginalPost[] = [
  ...aiPosts,
  ...webDesignPosts,
  ...seoPosts,
  ...marketingPosts,
  ...ecommercePosts,
  ...glovalPosts,
  ...guidesPosts,
].map(withExtra)
