import { LegalBlocks } from '@/components/legal/legal-blocks'
import { parseLegalMarkup } from '@/lib/legal-markup'
import {
  blogListPath,
  blogPostPath,
  postDescription,
  postTitle,
  sanitizeBlogBody,
  type BlogPagination,
  type BlogPost,
} from '@/lib/blog'

type Lang = 'tr' | 'en'

const COPY = {
  tr: { blog: 'Blog', readMore: 'Devamını oku', previous: 'Önceki yazı', next: 'Sonraki yazı', related: 'İlgili yazılar', home: 'Ana sayfa', older: 'Daha eski', newer: 'Daha yeni', page: 'Sayfa' },
  en: { blog: 'Blog', readMore: 'Read more', previous: 'Previous post', next: 'Next post', related: 'Related posts', home: 'Home', older: 'Older', newer: 'Newer', page: 'Page' },
} as const

export function blogCopy(lang: Lang) {
  return COPY[lang] ?? COPY.tr
}

export function formatBlogDate(iso: string | null, lang: Lang): string {
  if (!iso) return ''
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'tr-TR', { dateStyle: 'long', timeZone: 'Europe/Istanbul' }).format(at)
}

function PostCard({ post, lang, href }: { post: BlogPost; lang: Lang; href: string }) {
  const copy = blogCopy(lang)
  return (
    <article
      className="flex flex-col overflow-hidden border"
      style={{ borderColor: 'var(--site-border)', borderRadius: 'var(--site-radius)' }}
    >
      {post.coverUrl ? (
        <a href={href} tabIndex={-1} aria-hidden="true" className="block aspect-[16/9] overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element -- owner-supplied remote cover */}
          <img src={post.coverUrl} alt={post.coverAlt || post.title} loading="lazy" className="h-full w-full object-cover" />
        </a>
      ) : null}
      <div className="flex flex-1 flex-col gap-2 p-5">
        <time dateTime={post.publishedAt ?? undefined} className="text-xs" style={{ color: 'var(--site-muted-fg)' }}>
          {formatBlogDate(post.publishedAt, lang)}
        </time>
        <h2 className="text-balance text-lg font-semibold leading-snug" style={{ fontFamily: 'var(--site-heading-font)' }}>
          <a href={href} className="hover:underline">{post.title}</a>
        </h2>
        <p className="text-pretty text-sm leading-relaxed" style={{ color: 'var(--site-muted-fg)' }}>
          {post.excerpt?.trim() || postDescription(post)}
        </p>
        <a href={href} className="mt-auto pt-2 text-sm font-medium" style={{ color: 'var(--site-primary)' }}>
          {copy.readMore}
        </a>
      </div>
    </article>
  )
}

export function BlogIndexView({
  posts,
  pagination,
  lang,
  hrefBase,
  siteName,
}: {
  posts: BlogPost[]
  pagination: BlogPagination
  lang: Lang
  hrefBase: string
  siteName: string
}) {
  const copy = blogCopy(lang)
  const pageHref = (page: number) => `${hrefBase}${blogListPath(page)}`
  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-14" style={{ color: 'var(--site-fg)' }}>
      <header className="mb-10">
        <h1 className="text-balance text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--site-heading-font)' }}>
          {siteName} {copy.blog}
        </h1>
      </header>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} lang={lang} href={`${hrefBase}${blogPostPath(post.slug)}`} />
        ))}
      </div>
      {pagination.pageCount > 1 ? (
        <nav aria-label={copy.page} className="mt-10 flex items-center justify-between gap-4 text-sm">
          {pagination.page > 1 ? (
            <a rel="prev" href={pageHref(pagination.page - 1)} style={{ color: 'var(--site-primary)' }}>{copy.newer}</a>
          ) : <span />}
          <span style={{ color: 'var(--site-muted-fg)' }}>
            {pagination.page} / {pagination.pageCount}
          </span>
          {pagination.page < pagination.pageCount ? (
            <a rel="next" href={pageHref(pagination.page + 1)} style={{ color: 'var(--site-primary)' }}>{copy.older}</a>
          ) : <span />}
        </nav>
      ) : null}
    </section>
  )
}

export function BlogPostView({
  post,
  previous,
  next,
  related,
  lang,
  hrefBase,
}: {
  post: BlogPost
  previous: BlogPost | null
  next: BlogPost | null
  related: BlogPost[]
  lang: Lang
  hrefBase: string
}) {
  const copy = blogCopy(lang)
  const postHref = (p: BlogPost) => `${hrefBase}${blogPostPath(p.slug)}`
  return (
    <article className="mx-auto w-full max-w-3xl px-6 py-14" style={{ color: 'var(--site-fg)' }}>
      <nav aria-label="breadcrumb" className="mb-6 text-xs" style={{ color: 'var(--site-muted-fg)' }}>
        <a href={hrefBase || '/'} className="hover:underline">{copy.home}</a>
        <span aria-hidden="true"> / </span>
        <a href={`${hrefBase}/blog`} className="hover:underline">{copy.blog}</a>
      </nav>
      <h1 className="text-balance text-3xl font-bold tracking-tight" style={{ fontFamily: 'var(--site-heading-font)' }}>
        {postTitle({ title: post.title, seoTitle: null })}
      </h1>
      <time dateTime={post.publishedAt ?? undefined} className="mt-2 block text-xs" style={{ color: 'var(--site-muted-fg)' }}>
        {formatBlogDate(post.publishedAt, lang)}
      </time>
      {post.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- owner-supplied remote cover
        <img
          src={post.coverUrl}
          alt={post.coverAlt || post.title}
          className="mt-8 aspect-[16/9] w-full object-cover"
          style={{ borderRadius: 'var(--site-radius)' }}
        />
      ) : null}
      <div className="mt-8">
        <LegalBlocks blocks={parseLegalMarkup(sanitizeBlogBody(post.body))} />
      </div>

      {previous || next ? (
        <nav className="mt-12 grid gap-4 border-t pt-6 sm:grid-cols-2" style={{ borderColor: 'var(--site-border)' }}>
          {previous ? (
            <a rel="prev" href={postHref(previous)} className="text-sm">
              <span className="block text-xs" style={{ color: 'var(--site-muted-fg)' }}>{copy.previous}</span>
              <span className="font-medium" style={{ color: 'var(--site-primary)' }}>{previous.title}</span>
            </a>
          ) : <span />}
          {next ? (
            <a rel="next" href={postHref(next)} className="text-sm sm:text-right">
              <span className="block text-xs" style={{ color: 'var(--site-muted-fg)' }}>{copy.next}</span>
              <span className="font-medium" style={{ color: 'var(--site-primary)' }}>{next.title}</span>
            </a>
          ) : null}
        </nav>
      ) : null}

      {related.length > 0 ? (
        <aside className="mt-12">
          <h2 className="mb-4 text-lg font-semibold" style={{ fontFamily: 'var(--site-heading-font)' }}>{copy.related}</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((p) => (
              <PostCard key={p.id} post={p} lang={lang} href={postHref(p)} />
            ))}
          </div>
        </aside>
      ) : null}
    </article>
  )
}
