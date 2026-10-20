'use client'

import { ArrowLeft } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { PostCover } from '@/components/content/post-cover'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { BlogCard, formatPostDate } from '@/components/content/blog-card'
import { BlogMarkupView } from '@/components/content/blog-markup-view'
import { getLocalized, type BlogPost } from '@/lib/content/types'

export function BlogPostClient({
  post,
  related,
}: {
  post: BlogPost
  related: BlogPost[]
}) {
  const { t, lang } = useLanguage()
  const category = post.categoryLabel

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main>
        <article className="mx-auto max-w-3xl px-4 py-16 sm:py-20">
          <a
            href="/blog"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t.blog.backToBlog}
          </a>

          <header className="mt-8">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {category && (
                <span className="rounded-full bg-primary/12 px-2.5 py-0.5 font-medium text-primary">
                  {getLocalized(category, lang)}
                </span>
              )}
              <time dateTime={post.publishedAt} className="text-muted-foreground">
                {formatPostDate(post.publishedAt, lang)}
              </time>
              <span className="text-muted-foreground">{post.author}</span>
              <span className="text-muted-foreground">
                {post.readingTime} {lang === 'tr' ? 'dk okuma' : 'min read'}
              </span>
            </div>

            <h1 className="mt-4 text-balance font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              {getLocalized(post.title, lang)}
            </h1>
            <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
              {getLocalized(post.excerpt, lang)}
            </p>
          </header>

          {/* Only render a hero when there is a real image. An empty decorative
              panel here would just delay the article body for no benefit. */}
          {post.coverImage && (
            <div className="relative mt-10 aspect-[16/9] overflow-hidden rounded-2xl border border-border bg-secondary/40">
              <PostCover post={post} priority sizes="(max-width: 768px) 100vw, 768px" />
            </div>
          )}

          <div className="mt-12">
            <BlogMarkupView markup={getLocalized(post.markup, lang)} />
          </div>
        </article>

        {related.length > 0 && (
          <section className="border-t border-border">
            <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
              <h2 className="font-display text-2xl font-semibold tracking-tight">
                {t.blog.related}
              </h2>
              <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {related.map((item) => (
                  <BlogCard key={item.slug} post={item} />
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      <SiteFooter />
    </div>
  )
}
