'use client'

import Image from 'next/image'
import { useLanguage } from '@/components/language-provider'
import { getLocalized, type BlogPost } from '@/lib/content/types'

/**
 * Cover surface for a post.
 *
 * When `post.coverImage` is set it renders the real image. Otherwise it falls
 * back to a generated panel built from the site's existing grid + accent motif.
 * Posts currently ship without images, so the fallback is the normal path;
 * setting `coverImage` on a post switches it over with no other change.
 */
export function PostCover({
  post,
  priority = false,
  sizes,
  className = '',
}: {
  post: BlogPost
  priority?: boolean
  sizes?: string
  className?: string
}) {
  const { lang } = useLanguage()

  if (post.coverImage) {
    return (
      <Image
        src={post.coverImage}
        alt={post.coverAlt ? getLocalized(post.coverAlt, lang) : getLocalized(post.title, lang)}
        fill
        priority={priority}
        sizes={sizes}
        className={`object-cover ${className}`}
      />
    )
  }

  // Deterministic per-post variation so a grid of covers doesn't look like one
  // repeated tile. Derived from the slug (not random) so a given post always
  // renders the same cover across server and client — Math.random() here would
  // cause a hydration mismatch.
  const seed = [...post.slug].reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  const angle = 120 + (seed % 5) * 24
  const originX = 8 + (seed % 4) * 26

  return (
    // Decorative: the card and article already state the category and title as
    // real text, so this panel adds no information and is hidden from
    // assistive tech rather than repeating that copy.
    <div
      aria-hidden="true"
      className={`post-cover absolute inset-0 ${className}`}
      style={
        {
          '--cover-angle': `${angle}deg`,
          '--cover-origin-x': `${originX}%`,
        } as React.CSSProperties
      }
    >
      <div className="grid-bg absolute inset-0 opacity-50" />
    </div>
  )
}
