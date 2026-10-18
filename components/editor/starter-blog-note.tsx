'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { CheckCircle2, FileText, Loader2, TriangleAlert, X } from 'lucide-react'
import { addStarterBlogPostsAction } from '@/lib/blog-actions'
import { BLOG_CHANGED_EVENT } from '@/lib/blog-client'
import { blogNow } from '@/lib/blog-clock'
import { blogPostsKey, fetchBlogPosts } from '@/lib/blog-posts-fetcher'
import { COMPANY } from '@/lib/legal/company'
import {
  STARTER_CARD_COPY,
  STARTER_CARD_WAIT_MS,
  starterCardState,
  supportMailHref,
  type StarterCardState,
} from '@/lib/starter-blog-card'
import type { NoteLang } from '@/lib/starter-blog-note'
import type { BlogSettings } from '@/lib/website-schema'

type Props = {
  projectId: string
  lang: NoteLang
  settings: BlogSettings | undefined
  /** The site was created moments ago and its posts are still being written. */
  starterPending: boolean
  /** Saves a blog setting without adding an undo step. */
  onPatchSettings: (patch: BlogSettings) => void
}

export function StarterBlogNote({ projectId, lang, settings, starterPending, onPatchSettings }: Props) {
  const copy = STARTER_CARD_COPY[lang]
  const [waitExpired, setWaitExpired] = useState(!starterPending)
  const [pinned, setPinned] = useState<StarterCardState | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [retryFailed, setRetryFailed] = useState(false)

  useEffect(() => {
    if (waitExpired) return
    const stop = setTimeout(() => setWaitExpired(true), STARTER_CARD_WAIT_MS)
    return () => clearTimeout(stop)
  }, [waitExpired])

  const { data: posts, mutate } = useSWR(blogPostsKey(projectId), () => fetchBlogPosts(projectId), {
    revalidateOnFocus: false,
  })

  const computed = starterCardState({ settings, posts, now: blogNow(), starterPending, waitExpired })
  // Once the success card has been shown it stays for this session, but never returns after a reload.
  const state = computed === 'hidden' ? (pinned ?? 'hidden') : computed

  useEffect(() => {
    if (computed !== 'success' || pinned === 'success') return
    setPinned('success')
    onPatchSettings({ starterCardDismissed: true })
  }, [computed, pinned, onPatchSettings])

  if (state === 'hidden') return null

  function dismiss() {
    setPinned('hidden')
    onPatchSettings({ starterCardDismissed: true })
  }

  async function retry() {
    setRetrying(true)
    setRetryFailed(false)
    try {
      const result = await addStarterBlogPostsAction(projectId)
      if (result.ok || ('reason' in result && result.reason === 'already_added')) {
        await mutate()
        window.dispatchEvent(new Event(BLOG_CHANGED_EVENT))
      } else {
        setRetryFailed(true)
      }
    } catch {
      setRetryFailed(true)
    } finally {
      setRetrying(false)
    }
  }

  const Icon = state === 'success' ? CheckCircle2 : state === 'failed' ? TriangleAlert : FileText

  return (
    <div
      role={state === 'failed' ? 'alert' : 'status'}
      data-testid="starter-blog-card"
      data-state={state}
      className="flex items-start gap-2 border-b border-border bg-brand/10 px-3 py-2.5"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
      <div className="min-w-0 flex-1">
        {state === 'preparing' && (
          <>
            <p className="text-xs font-semibold text-foreground">{copy.preparing.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{copy.preparing.body}</p>
          </>
        )}
        {state === 'success' && (
          <>
            <p className="text-xs font-semibold text-foreground">{copy.success.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {copy.success.lead}
              <a
                href={supportMailHref({ email: COMPANY.supportEmail, projectId, lang })}
                className="font-medium text-brand underline underline-offset-2"
              >
                {copy.success.link}
              </a>
              {copy.success.tail}
            </p>
          </>
        )}
        {state === 'failed' && (
          <>
            <p className="text-xs font-semibold text-foreground">{copy.failed.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{copy.failed.body}</p>
            <button
              type="button"
              onClick={retry}
              disabled={retrying}
              className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-brand/40 px-2 py-1 text-xs font-medium text-brand transition-colors hover:bg-brand/10 disabled:opacity-60"
            >
              {retrying && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
              {retrying ? copy.failed.retrying : copy.failed.retry}
            </button>
            {retryFailed && (
              <p className="mt-1 text-xs text-destructive">{copy.failed.body}</p>
            )}
          </>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={copy.dismiss}
        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  )
}
