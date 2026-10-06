'use client'

import { useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { BlogCard } from '@/components/content/blog-card'
import { getPosts, getUsedCategories } from '@/lib/content/blog'
import { getLocalized, type BlogCategoryId } from '@/lib/content/types'

export function BlogListClient() {
  const { t, lang } = useLanguage()
  const [active, setActive] = useState<BlogCategoryId | 'all'>('all')

  const allPosts = getPosts()
  // Only categories that actually have posts, so no filter leads to a dead end.
  const categories = getUsedCategories()

  const posts = useMemo(
    () => (active === 'all' ? allPosts : allPosts.filter((p) => p.category === active)),
    [allPosts, active],
  )

  const filters: { id: BlogCategoryId | 'all'; label: string }[] = [
    { id: 'all', label: t.blog.allCategories },
    ...categories.map((c) => ({ id: c.id, label: getLocalized(c.label, lang) })),
  ]

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <a
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t.nav.backHome}
        </a>

        <header className="mt-8 max-w-2xl">
          <h1 className="text-balance font-display text-4xl font-bold tracking-tight sm:text-5xl">
            {t.blog.pageTitle}
          </h1>
          <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
            {t.blog.pageSubtitle}
          </p>
        </header>

        {/* Radio-group semantics: this is a single-select filter, so screen
            readers should announce it as one control with a pressed option. */}
        <div
          role="radiogroup"
          aria-label={t.blog.allCategories}
          className="mt-10 flex flex-wrap gap-2"
        >
          {filters.map((f) => {
            const isActive = active === f.id
            return (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => setActive(f.id)}
                className={`inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isActive
                    ? 'border-primary/50 bg-primary/15 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                }`}
              >
                {f.label}
              </button>
            )
          })}
        </div>

        {posts.length > 0 ? (
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post, i) => (
              <BlogCard key={post.slug} post={post} priority={i < 3} />
            ))}
          </div>
        ) : (
          <div className="mt-10 rounded-2xl border border-border bg-card px-6 py-16 text-center">
            <p className="text-sm text-muted-foreground">{t.blog.empty}</p>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  )
}
