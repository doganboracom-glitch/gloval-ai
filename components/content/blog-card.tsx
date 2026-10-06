'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { PostCover } from '@/components/content/post-cover'
import { getCategory } from '@/lib/content/blog'
import { getLocalized, type BlogPost } from '@/lib/content/types'
import type { Lang } from '@/lib/i18n'

/**
 * Formats an ISO date for display in the active locale. Blog content copy is
 * only fully translated for tr/en; every other supported locale falls back to
 * the `en-US` date format here (same fallback `getLocalized` applies to the
 * post text itself).
 */
export function formatPostDate(iso: string, lang: Lang): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(
    lang === 'tr' ? 'tr-TR' : 'en-US',
    { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' },
  )
}

/**
 * Shared post card for the homepage summary and the /blog grid.
 *
 * The whole card is one link so the entire surface is clickable; the "Read more"
 * affordance is decorative text rather than a nested anchor, which would be
 * invalid markup and a duplicate tab stop.
 */
export function BlogCard({
  post,
  /** Homepage cards sit above the fold on mobile, so allow eager loading. */
  priority = false,
}: {
  post: BlogPost
  priority?: boolean
}) {
  const { t, lang } = useLanguage()
  const category = getCategory(post.category)

  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* A real photo earns a full 16/9 slot. The generated fallback panel
          carries no information, so it stays a slim accent band instead of
          pushing the title and excerpt below the fold. */}
      <div
        className={`relative overflow-hidden bg-secondary/40 ${
          post.coverImage ? 'aspect-[16/9]' : 'h-20'
        }`}
      >
        <PostCover
          post={post}
          priority={priority}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="transition-transform duration-500 group-hover:scale-[1.03]"
        />
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {category && (
            <span className="rounded-full bg-primary/12 px-2.5 py-0.5 font-medium text-primary">
              {getLocalized(category.label, lang)}
            </span>
          )}
          <time dateTime={post.publishedAt} className="text-muted-foreground">
            {formatPostDate(post.publishedAt, lang)}
          </time>
        </div>

        <h3 className="mt-3 text-balance font-display text-lg font-semibold leading-snug">
          {getLocalized(post.title, lang)}
        </h3>
        <p className="mt-2 line-clamp-3 text-pretty text-sm leading-relaxed text-muted-foreground">
          {getLocalized(post.excerpt, lang)}
        </p>

        <span className="mt-4 inline-flex items-center gap-1.5 pt-1 text-sm font-semibold text-primary">
          {t.blog.readMore}
          <ArrowRight
            aria-hidden="true"
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
          />
        </span>
      </div>
    </Link>
  )
}
