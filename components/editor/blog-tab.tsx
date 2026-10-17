'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { Loader2, Plus, Sparkles } from 'lucide-react'
import {
  addStarterBlogPostsAction,
  deleteBlogPostAction,
  listBlogPostsAction,
  markBlogPostPersonalizedAction,
  regenerateStarterBlogPostsAction,
  updateBlogPostAction,
} from '@/lib/blog-actions'
import { isRegenerableStarterPost, isStarterPost, livePosts, type BlogPost } from '@/lib/blog'
import { SearchPromoCard } from '@/components/editor/search-promo-card'
import { BLOG_CHANGED_EVENT, blogConfirmCopy } from '@/lib/blog-client'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { EditOperation } from '@/lib/website-edit-operations'
import type { BlogProfile, BlogSettings } from '@/lib/website-schema'
import { BlogPostForm } from '@/components/editor/blog-post-form'
import { BlogAiPanel } from '@/components/editor/blog-ai-panel'
import { BlogPersonalizePanel } from '@/components/editor/blog-personalize-panel'

type Lang = 'tr' | 'en'
type View =
  | { kind: 'list' }
  | { kind: 'ai' }
  | { kind: 'personalize'; post: BlogPost }
  | { kind: 'edit'; post: BlogPost | null }

const T = {
  tr: {
    personalizeLabel: 'Firmanıza özelleştirin',
    personalizeCta: 'AI ile özelleştir',
    markPersonalized: 'Özelleştirildi olarak işaretle',
    markFailed: 'Yazı işaretlenemedi.',
    addStarter: 'Örnek blog yazılarını ekle',
    addStarterHint: 'Sektörünüze uygun 3 genel yazı eklenir. Ücretsizdir; özelleştirene kadar arama motorlarında görünmez.',
    addStarterFailed: 'Örnek yazılar eklenemedi. Biraz sonra tekrar deneyin.',
    addStarterDone: 'Örnek yazılar zaten eklenmiş.',
    addStarterBusy: 'Örnek yazılar şu anda hazırlanıyor. Birkaç dakika sonra tekrar bakın.',
    addStarterDaily: 'Bugünlük örnek yazı hakkınız doldu. Yarın tekrar deneyin.',
    addStarterSuspended: 'Aboneliğiniz askıda olduğu için yazı eklenemedi.',
    addStarterPostLimit: 'Planınızın blog yazısı sınırına ulaşıldı.',
    addStarterTimeout: 'Yazılar zamanında hazırlanamadı. Tekrar deneyin.',
    addStarterDb: 'Yazılar kaydedilemedi. Biraz sonra tekrar deneyin.',
    regenerate: 'Örnek blog yazılarını yeniden oluştur',
    regenerateHint: 'Yalnızca düzenlemediğiniz ve özelleştirmediğiniz örnek yazılar yenilenir. Ücretsizdir.',
    regenerateTitle: 'Örnek yazılar yeniden oluşturulsun mu?',
    regenerateBody: 'Düzenlemediğiniz ve özelleştirmediğiniz örnek yazılar silinip sektörünüze uygun yenileriyle değiştirilir. Kendi yazılarınıza ve düzenlediğiniz yazılara dokunulmaz. Kredi düşmez.',
    regenerateConfirm: 'Yeniden oluştur',
    regenerateNothing: 'Yenilenecek örnek yazı bulunamadı.',
    title: 'Blog yazıları',
    visibility: 'Sitede görünürlük',
    showInMenu: 'Menüde göster',
    showLatest: 'Ana sayfada son yazıları göster',
    needsLivePost: 'Yayında yazı olmadığı için menü bağlantısı ve son yazılar bölümü şu an görünmüyor.',
    intro: 'Yazılar sitenizin /blog sayfasında yayınlanır ve site haritasına eklenir.',
    newPost: 'Yeni yazı',
    ai: 'AI ile yaz',
    empty: 'Henüz yazınız yok. İlk yazınızı kendiniz yazabilir veya yapay zekaya hazırlatabilirsiniz.',
    draft: 'Taslak',
    live: 'Yayında',
    scheduled: 'Planlı',
    publishNow: 'Şimdi yayınla',
    publishNowFailed: 'Yazı yayınlanamadı. Örnek içerik onayı veya abonelik durumunu kontrol edin.',
    sample: 'Örnek',
    aiTag: 'AI taslağı',
    loadFailed: 'Yazılar yüklenemedi.',
    retry: 'Tekrar dene',
    deleteFailed: 'Yazı silinemedi.',
    noSlug: 'Site yayınlandığında yazılar herkese açık olur.',
    google: 'Google, IndexNow desteklemez. Yeni yazıların Google\u2019da daha hızlı görünmesi için sitemap adresinizi (/sitemap.xml) Google Search Console\u2019a gönderin.',
  },
  en: {
    personalizeLabel: 'Personalize for your business',
    personalizeCta: 'Personalize with AI',
    markPersonalized: 'Mark as personalized',
    markFailed: 'Could not mark the post.',
    addStarter: 'Add sample blog posts',
    addStarterHint: 'Adds 3 general posts for your sector. Free; hidden from search engines until you personalize them.',
    addStarterFailed: 'Could not add sample posts. Try again shortly.',
    addStarterDone: 'Sample posts were already added.',
    addStarterBusy: 'Sample posts are being prepared right now. Check again in a few minutes.',
    addStarterDaily: 'You have used today\u2019s sample post allowance. Try again tomorrow.',
    addStarterSuspended: 'Your subscription is suspended, so posts could not be added.',
    addStarterPostLimit: 'Your plan\u2019s blog post limit has been reached.',
    addStarterTimeout: 'The posts were not ready in time. Please try again.',
    addStarterDb: 'The posts could not be saved. Try again shortly.',
    regenerate: 'Regenerate sample blog posts',
    regenerateHint: 'Only sample posts you have not edited or personalized are replaced. Free.',
    regenerateTitle: 'Regenerate sample posts?',
    regenerateBody: 'Sample posts you have not edited or personalized are deleted and replaced with new ones for your sector. Your own and edited posts are never touched. No credits are used.',
    regenerateConfirm: 'Regenerate',
    regenerateNothing: 'No sample posts to regenerate.',
    title: 'Blog posts',
    visibility: 'Visibility on your site',
    showInMenu: 'Show in menu',
    showLatest: 'Show latest posts on the home page',
    needsLivePost: 'With no published post, the menu link and the latest-posts block stay hidden for now.',
    intro: 'Posts are published at your site\u2019s /blog page and added to the sitemap.',
    newPost: 'New post',
    ai: 'Write with AI',
    empty: 'No posts yet. Write your first one yourself or let AI draft it.',
    draft: 'Draft',
    live: 'Live',
    scheduled: 'Scheduled',
    publishNow: 'Publish now',
    publishNowFailed: 'Could not publish the post. Check the sample-content confirmation or your subscription.',
    sample: 'Sample',
    aiTag: 'AI draft',
    loadFailed: 'Could not load posts.',
    retry: 'Try again',
    deleteFailed: 'Could not delete the post.',
    noSlug: 'Posts become public once the site is published.',
    google: 'Google does not support IndexNow. To get new posts into Google faster, submit your sitemap (/sitemap.xml) in Google Search Console.',
  },
} as const

function BlogSwitch({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-foreground">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
          checked ? 'border-brand bg-brand' : 'border-border bg-secondary'
        }`}
      >
        <span
          aria-hidden
          className={`absolute left-0.5 top-0.5 h-4.5 w-4.5 rounded-full bg-background shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
          style={{ height: '1.125rem', width: '1.125rem' }}
        />
      </button>
    </div>
  )
}

function formatPlannedDate(iso: string | null, lang: Lang): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

function statusOf(post: BlogPost): 'draft' | 'live' | 'scheduled' {
  if (post.status !== 'published') return 'draft'
  return post.publishedAt && Date.parse(post.publishedAt) > Date.now() ? 'scheduled' : 'live'
}

export function BlogTab({
  projectId,
  lang,
  topics,
  profile,
  settings,
  onDispatch,
  published,
  sitemapUrl = null,
}: {
  projectId: string
  lang: Lang
  topics: string[]
  profile: BlogProfile | undefined
  settings?: BlogSettings
  onDispatch: (op: EditOperation) => void
  published: boolean
  sitemapUrl?: string | null
}) {
  const t = T[lang]
  const [view, setView] = useState<View>({ kind: 'list' })
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BlogPost | null>(null)
  const confirmCopy = blogConfirmCopy(lang)

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
  const livePostCount = livePosts(posts).length

  useEffect(() => {
    if (view.kind === 'list') window.scrollTo?.({ top: 0 })
  }, [view.kind])

  useEffect(() => {
    const reload = () => void mutate()
    window.addEventListener(BLOG_CHANGED_EVENT, reload)
    return () => window.removeEventListener(BLOG_CHANGED_EVENT, reload)
  }, [mutate])

  async function remove(post: BlogPost) {
    setDeleteTarget(null)
    setError(null)
    const result = await deleteBlogPostAction(projectId, post.id).catch(() => null)
    if (!result || !result.ok) {
      setError(t.deleteFailed)
      return
    }
    await mutate((current) => current?.filter((p) => p.id !== post.id), { revalidate: false })
    setView({ kind: 'list' })
  }

  const [addingStarter, setAddingStarter] = useState(false)

  async function addStarter() {
    setError(null)
    setAddingStarter(true)
    const result = await addStarterBlogPostsAction(projectId).catch(() => null)
    setAddingStarter(false)
    if (result && result.ok) {
      await mutate()
      return
    }
    const reason = result && !result.ok ? result.reason : null
    const messages: Record<string, string> = {
      already_added: t.addStarterDone,
      in_progress: t.addStarterBusy,
      starter_blog_limit: t.addStarterDaily,
      starter_blog_suspended: t.addStarterSuspended,
      starter_blog_post_limit: t.addStarterPostLimit,
      starter_blog_timeout: t.addStarterTimeout,
      starter_blog_db: t.addStarterDb,
    }
    setError((reason && messages[reason]) || t.addStarterFailed)
  }

  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const regenerableCount = posts.filter(isRegenerableStarterPost).length

  async function regenerateStarter() {
    setConfirmRegenerate(false)
    setError(null)
    setRegenerating(true)
    const result = await regenerateStarterBlogPostsAction(projectId).catch(() => null)
    setRegenerating(false)
    if (result && result.ok) {
      await mutate()
      return
    }
    const reason = result && !result.ok ? result.reason : null
    const messages: Record<string, string> = {
      nothing_to_replace: t.regenerateNothing,
      in_progress: t.addStarterBusy,
      starter_blog_limit: t.addStarterDaily,
      starter_blog_suspended: t.addStarterSuspended,
      starter_blog_post_limit: t.addStarterPostLimit,
      starter_blog_timeout: t.addStarterTimeout,
      starter_blog_db: t.addStarterDb,
    }
    if (reason === 'nothing_to_replace' || reason === 'starter_blog_db' || reason === 'starter_blog_timeout') {
      await mutate()
    }
    setError((reason && messages[reason]) || t.addStarterFailed)
  }

  async function markPersonalized(post: BlogPost) {
    setError(null)
    const result = await markBlogPostPersonalizedAction(projectId, post.id).catch(() => null)
    if (!result || !result.ok) {
      setError(t.markFailed)
      return
    }
    upsert(result.post)
  }

  const [publishingId, setPublishingId] = useState<string | null>(null)

  async function publishNow(post: BlogPost) {
    setError(null)
    setPublishingId(post.id)
    const result = await updateBlogPostAction(projectId, post.id, {
      title: post.title,
      body: post.body,
      slug: post.slug,
      excerpt: post.excerpt,
      keywords: post.keywords,
      seoTitle: post.seoTitle,
      metaDescription: post.metaDescription,
      coverUrl: post.coverUrl,
      coverAlt: post.coverAlt,
      indexable: post.indexable,
      status: 'published',
    }).catch(() => null)
    setPublishingId(null)
    if (!result || !result.ok) {
      setError(t.publishNowFailed)
      return
    }
    upsert(result.post)
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

  const deleteDialog = (
    <ConfirmDialog
      open={deleteTarget !== null}
      title={confirmCopy.deleteTitle}
      description={deleteTarget ? `${deleteTarget.title} — ${confirmCopy.deleteBody}` : confirmCopy.deleteBody}
      confirmLabel={confirmCopy.deleteConfirm}
      cancelLabel={confirmCopy.cancel}
      destructive
      onConfirm={() => deleteTarget && void remove(deleteTarget)}
      onCancel={() => setDeleteTarget(null)}
    />
  )

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

  if (view.kind === 'personalize') {
    return (
      <div className="p-4">
        <BlogPersonalizePanel
          projectId={projectId}
          post={view.post}
          lang={lang}
          profile={profile}
          onBack={() => setView({ kind: 'list' })}
          onRememberProfile={(next) => onDispatch({ op: 'updateBlogProfile', profile: next })}
          onDone={(post) => {
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
          onDelete={view.post ? () => setDeleteTarget(view.post) : undefined}
        />
        {deleteDialog}
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

      <fieldset className="flex flex-col gap-2 rounded-xl border border-border p-3">
        <legend className="px-1 text-xs font-medium text-muted-foreground">{t.visibility}</legend>
        <BlogSwitch
          label={t.showInMenu}
          checked={settings?.showInMenu !== false}
          onChange={(value) => onDispatch({ op: 'updateBlogSettings', patch: { showInMenu: value } })}
        />
        <BlogSwitch
          label={t.showLatest}
          checked={settings?.showLatest !== false}
          onChange={(value) => onDispatch({ op: 'updateBlogSettings', patch: { showLatest: value } })}
        />
        {!isLoading && !loadError && livePostCount === 0 && (
          <p className="text-xs leading-relaxed text-muted-foreground">{t.needsLivePost}</p>
        )}
      </fieldset>

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

      {!isLoading && !loadError && regenerableCount > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <p className="text-xs leading-relaxed text-muted-foreground">{t.regenerateHint}</p>
          <button
            type="button"
            disabled={regenerating}
            onClick={() => setConfirmRegenerate(true)}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
          >
            {regenerating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
            {t.regenerate}
          </button>
        </div>
      )}
      <ConfirmDialog
        open={confirmRegenerate}
        title={t.regenerateTitle}
        description={t.regenerateBody}
        confirmLabel={t.regenerateConfirm}
        cancelLabel={confirmCopy.cancel}
        onConfirm={() => void regenerateStarter()}
        onCancel={() => setConfirmRegenerate(false)}
      />

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
        <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border p-4">
          <p className="text-sm leading-relaxed text-muted-foreground">{t.empty}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{t.addStarterHint}</p>
          <button
            type="button"
            disabled={addingStarter}
            onClick={() => void addStarter()}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
          >
            {addingStarter ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
            {t.addStarter}
          </button>
        </div>
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
                      {status === 'scheduled' ? `${t.scheduled}: ${formatPlannedDate(post.publishedAt, lang)}` : t[status]}
                    </span>
                    {post.sample && <span className="rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">{t.sample}</span>}
                    {post.aiGenerated && <span className="rounded-full bg-brand/15 px-2 py-0.5 text-brand">{t.aiTag}</span>}
                  </span>
                </button>
                {status === 'scheduled' && (
                  <div className="mt-1.5 flex justify-end">
                    <button
                      type="button"
                      disabled={publishingId === post.id}
                      onClick={() => void publishNow(post)}
                      className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
                    >
                      {publishingId === post.id && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
                      {t.publishNow}
                    </button>
                  </div>
                )}
                {(post.sample || isStarterPost(post)) && (
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-500/10 px-3 py-2">
                    <span className="text-xs font-medium text-amber-500">{t.personalizeLabel}</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {isStarterPost(post) && (
                        <button
                          type="button"
                          onClick={() => void markPersonalized(post)}
                          className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                        >
                          {t.markPersonalized}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setView({ kind: 'personalize', post })}
                        className="flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1 text-xs font-medium text-brand-foreground transition-opacity hover:opacity-90"
                      >
                        <Sparkles className="h-3 w-3" aria-hidden />
                        {t.personalizeCta}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <SearchPromoCard sitemapUrl={sitemapUrl} published={published} lang={lang} />
    </div>
  )
}
