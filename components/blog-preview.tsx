'use client'

import { ArrowRight } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { BlogCard } from '@/components/content/blog-card'
import { getFeaturedPosts } from '@/lib/content/blog'

/**
 * Homepage blog summary: exactly three featured posts. Only card-level fields
 * are read here — full article bodies are never pulled into the homepage.
 */
export function BlogPreview() {
  const { t } = useLanguage()
  const posts = getFeaturedPosts(3)

  if (posts.length === 0) return null

  return (
    <section id="blog" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:py-28">
      {/* Heading left, action right on desktop; stacks on mobile. */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-balance font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {t.blog.homeTitle}
          </h2>
          <p className="mt-3 text-pretty text-muted-foreground">
            {t.blog.homeSubtitle}
          </p>
        </div>

        <a
          href="/blog"
          className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 self-start rounded-xl border border-border bg-card px-5 text-sm font-semibold transition-colors hover:border-primary/50 hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:self-auto"
        >
          {t.blog.viewAll}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <BlogCard key={post.slug} post={post} />
        ))}
      </div>
    </section>
  )
}
