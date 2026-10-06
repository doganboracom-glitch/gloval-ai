'use client'

import { ArrowLeft } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { PostCover } from '@/components/content/post-cover'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { BlogCard, formatPostDate } from '@/components/content/blog-card'
import { getCategory } from '@/lib/content/blog'
import { getLocalized, type BlogPost } from '@/lib/content/types'

export function BlogPostClient({
  post,
  related,
}: {
  post: BlogPost
  related: BlogPost[]
}) {
  const { t, lang } = useLanguage()
  const category = getCategory(post.category)

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
                  {getLocalized(category.label, lang)}
                </span>
              )}
              <time dateTime={post.publishedAt} className="text-muted-foreground">
                {formatPostDate(post.publishedAt, lang)}
              </time>
              <span className="text-muted-foreground">{post.author}</span>
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

          {/* Body blocks are rendered by type rather than as raw HTML, which
              keeps the article free of dangerouslySetInnerHTML. */}
          <div className="mt-12">
            {post.body.map((block, i) => {
              if (block.type === 'heading') {
                return (
                  <h2
                    key={i}
                    className="mt-10 text-balance font-display text-2xl font-semibold tracking-tight first:mt-0"
                  >
                    {getLocalized(block.text, lang)}
                  </h2>
                )
              }
              if (block.type === 'list') {
                return (
                  <ul key={i} className="mt-5 flex flex-col gap-2.5">
                    {getLocalized(block.items, lang).map((entry) => (
                      <li key={entry} className="flex gap-3 text-pretty leading-relaxed">
                        <span
                          aria-hidden="true"
                          className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                        />
                        <span className="text-muted-foreground">{entry}</span>
                      </li>
                    ))}
                  </ul>
                )
              }
              return (
                <p
                  key={i}
                  className="mt-5 text-pretty leading-relaxed text-muted-foreground"
                >
                  {getLocalized(block.text, lang)}
                </p>
              )
            })}
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
