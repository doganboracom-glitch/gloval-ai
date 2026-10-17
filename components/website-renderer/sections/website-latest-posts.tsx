import { blogCardHref, blogIndexHref, latestPostsHeading, type SiteBlogData } from '@/lib/blog-site'
import { blogCopy, formatBlogDate } from '@/components/blog/blog-views'

export function WebsiteLatestPosts({
  blog,
  lang = 'tr',
  title,
}: {
  blog: SiteBlogData
  lang?: 'tr' | 'en'
  title?: string
}) {
  const copy = blogCopy(lang)
  const heading = title?.trim() || latestPostsHeading()

  return (
    <section
      aria-labelledby="latest-posts-heading"
      data-latest-posts
      className="px-6 py-16"
      style={{ backgroundColor: 'var(--site-bg)', color: 'var(--site-fg)' }}
    >
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-8 flex items-end justify-between gap-4">
          <h2
            id="latest-posts-heading"
            className="text-balance text-2xl font-bold tracking-tight sm:text-3xl"
            style={{ fontFamily: 'var(--site-heading-font)' }}
          >
            {heading}
          </h2>
          <a
            href={blogIndexHref(blog)}
            className="shrink-0 text-sm font-medium hover:underline"
            style={{ color: 'var(--site-primary)' }}
          >
            {lang === 'en' ? 'View all' : 'Tümünü gör'}
          </a>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {blog.posts.map((post) => {
            const href = blogCardHref(blog, post)
            return (
              <article
                key={post.slug}
                className="flex flex-col overflow-hidden border"
                style={{
                  borderColor: 'var(--site-border)',
                  borderRadius: 'var(--site-radius)',
                  backgroundColor: 'var(--site-card)',
                }}
              >
                {post.coverUrl ? (
                  <a href={href} tabIndex={-1} aria-hidden="true" className="block aspect-[16/9] overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element -- owner-supplied remote cover */}
                    <img
                      src={post.coverUrl}
                      alt={post.coverAlt || post.title}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </a>
                ) : null}
                <div className="flex flex-1 flex-col gap-2 p-5">
                  <time
                    dateTime={post.publishedAt ?? undefined}
                    className="text-xs"
                    style={{ color: 'var(--site-muted-fg)' }}
                  >
                    {formatBlogDate(post.publishedAt, lang)}
                  </time>
                  <h3
                    className="text-balance text-lg font-semibold leading-snug"
                    style={{ fontFamily: 'var(--site-heading-font)' }}
                  >
                    <a href={href} className="hover:underline">
                      {post.title}
                    </a>
                  </h3>
                  {post.excerpt ? (
                    <p className="text-pretty text-sm leading-relaxed" style={{ color: 'var(--site-muted-fg)' }}>
                      {post.excerpt}
                    </p>
                  ) : null}
                  <a href={href} className="mt-auto pt-2 text-sm font-medium" style={{ color: 'var(--site-primary)' }}>
                    {copy.readMore}
                  </a>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
