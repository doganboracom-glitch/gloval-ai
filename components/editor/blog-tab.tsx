'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { Loader2, Plus, Sparkles } from 'lucide-react'
import { deleteBlogPostAction, listBlogPostsAction } from '@/lib/blog-actions'
import type { BlogPost } from '@/lib/blog'
import type { EditOperation } from '@/lib/website-edit-operations'
import type { BlogProfile } from '@/lib/website-schema'
import { BlogPostForm } from '@/components/editor/blog-post-form'
import { BlogAiPanel } from '@/components/editor/blog-ai-panel'

type Lang = 'tr' | 'en'
type View = { kind: 'list' } | { kind: 'ai' } | { kind: 'edit'; post: BlogPost | null }

const T = {
  tr: {
    title: 'Blog yazıları',
    intro: 'Yazılar sitenizin /blog sayfasında yayınlanır ve site haritasına eklenir.',
    newPost: 'Yeni yazı',
    ai: 'AI ile yaz',
    empty: 'Henüz yazınız yok. İlk yazınızı kendiniz yazabilir veya yapay zekaya hazırlatabilirsiniz.',
    draft: 'Taslak',
    live: 'Yayında',
    scheduled: 'Zamanlandı',
    sample: 'Örnek',
    aiTag: 'AI taslağı',
    loadFailed: 'Yazılar yüklenemedi.',
    retry: 'Tekrar dene',
    confirmDelete: 'Bu yazı kalıcı olarak silinsin mi?',
    deleteFailed: 'Yazı silinemedi.',
    noSlug: 'Site yayınlandığında yazılar herkese açık olur.',
    google: 'Google, IndexNow desteklemez. Yeni yazıların Google\u2019da daha hızlı görünmesi için sitemap adresinizi (/sitemap.xml) Google Search Console\u2019a gönderin.',
  },
  en: {
    title: 'Blog posts',
    intro: 'Posts are published at your site\u2019s /blog page and added to the sitemap.',
    newPost: 'New post',
    ai: 'Write with AI',
    empty: 'No posts yet. Write your first one yourself or let AI draft it.',
    draft: 'Draft',
    live: 'Live',
    scheduled: 'Scheduled',
    sample: 'Sample',
    aiTag: 'AI draft',
    loadFailed: 'Could not load posts.',
    retry: 'Try again',
    confirmDelete: 'Delete this post permanently?',
    deleteFailed: 'Could not delete the post.',
    noSlug: 'Posts become public once the site is published.',
    google: 'Google does not support IndexNow. To get new posts into Google faster, submit your sitemap (/sitemap.xml) in Google Search Console.',
  },
} as const

function statusOf(post: BlogPost): 'draft' | 'live' | 'scheduled' {
  if (post.status !== 'published') return 'draft'
  return post.publishedAt && Date.parse(post.publishedAt) > Date.now() ? 'scheduled' : 'live'
}

export function BlogTab({
  projectId,
  lang,
  topics,
  profile,
  onDispatch,
  published,
}: {
  projectId: string
  lang: Lang
  topics: string[]
  profile: BlogProfile | undefined
  onDispatch: (op: EditOperation) => void
  published: boolean
}) {
  const t = T[lang]
  const [view, setView] = useState<View>({ kind: 'list' })
  const [error, setError] = useState<string | null>(null)

  const { data, error: loadError, isLoading, mutate } = useSWR(
    ['blog-posts', projectId],
    async () => {
      const result = await listBlogPostsAction(projectId)
      if (!result.ok) throw new Error(result.reason)
      return result.posts
    },
    { revalidateOnFocus: false },
  )
  const posts = data ?? []

  useEffect(() => {
    if (view.kind === 'list') window.scrollTo?.({ top: 0 })
  }, [view.kind])

  async function remove(post: BlogPost) {
    if (!window.confirm(t.confirmDelete)) return
    setError(null)
    const result = await deleteBlogPostAction(projectId, post.id).catch(() => null)
    if (!result || !result.ok) {
      setError(t.deleteFailed)
      return
    }
    await mutate((current) => current?.filter((p) => p.id !== post.id), { revalidate: false })
    setView({ kind: 'list' })
  }

  function upsert(post: BlogPost) {
    void mutate(
      (current) => {
        const rest = (current ?? []).filter((p) => p.id !== post.id)
        return [post, ...rest]
      },
      { revalidate: false },
    )
  }

  if (view.kind === 'ai') {
    return (
      <div className="p-4">
        <BlogAiPanel
          projectId={projectId}
          lang={lang}
          topics={topics}
          profile={profile}
          onBack={() => setView({ kind: 'list' })}
          onRememberProfile={(next) => onDispatch({ op: 'updateBlogProfile', profile: next })}
          onCreated={(post) => {
            upsert(post)
            setView({ kind: 'edit', post })
          }}
        />
      </div>
    )
  }

  if (view.kind === 'edit') {
    return (
      <div className="p-4">
        <BlogPostForm
          key={view.post?.id ?? 'new'}
          projectId={projectId}
          post={view.post}
          lang={lang}
          onBack={() => setView({ kind: 'list' })}
          onSaved={upsert}
          onDelete={view.post ? () => void remove(view.post as BlogPost) : undefined}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h4 className="font-display text-base font-bold text-foreground">{t.title}</h4>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t.intro}</p>
        {!published && <p className="mt-1 text-xs text-muted-foreground">{t.noSlug}</p>}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setView({ kind: 'ai' })}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-2.5 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90"
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          {t.ai}
        </button>
        <button
          type="button"
          onClick={() => setView({ kind: 'edit', post: null })}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t.newPost}
        </button>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {isLoading ? (
        <div className="flex justify-center py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" />
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
          <p>{t.loadFailed}</p>
          <button type="button" onClick={() => void mutate()} className="text-brand underline-offset-2 hover:underline">
            {t.retry}
          </button>
        </div>
      ) : posts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm leading-relaxed text-muted-foreground">{t.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {posts.map((post) => {
            const status = statusOf(post)
            return (
              <li key={post.id}>
                <button
                  type="button"
                  onClick={() => setView({ kind: 'edit', post })}
                  className="flex w-full flex-col gap-1.5 rounded-xl border border-border bg-background p-3 text-left transition-colors hover:border-brand/40"
                >
                  <span className="line-clamp-2 text-sm font-medium text-foreground">{post.title}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span
                      className={`rounded-full px-2 py-0.5 ${
                        status === 'live'
                          ? 'bg-emerald-500/15 text-emerald-500'
                          : status === 'scheduled'
                            ? 'bg-amber-500/15 text-amber-500'
                            : 'bg-secondary text-muted-foreground'
                      }`}
                    >
                      {t[status]}
                    </span>
                    {post.sample && <span className="rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">{t.sample}</span>}
                    {post.aiGenerated && <span className="rounded-full bg-brand/15 px-2 py-0.5 text-brand">{t.aiTag}</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">{t.google}</p>
    </div>
  )
}
