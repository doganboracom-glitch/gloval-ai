'use client'

import { postsPreparingLabel, postsRetryLabel, postsStalledLabel, type SiteBlogData } from '@/lib/blog-site'

/** Preview-only: shown when the starter posts did not arrive in time. Client file because of the click handler. */
export function PostsRetry({ stalled, lang }: { stalled: NonNullable<SiteBlogData['stalled']>; lang: 'tr' | 'en' }) {
  if (stalled.retrying) {
    return (
      <p role="status" className="text-sm" style={{ color: 'var(--site-muted-fg)' }}>
        {postsPreparingLabel(lang)}
      </p>
    )
  }
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 text-sm" style={{ color: 'var(--site-muted-fg)' }}>
      <span>
        {postsStalledLabel(lang)}
        {stalled.error ? ` (${stalled.error})` : ''}
      </span>
      <button
        type="button"
        onClick={stalled.onRetry}
        className="font-medium underline underline-offset-4"
        style={{ color: 'var(--site-primary)' }}
      >
        {postsRetryLabel(lang)}
      </button>
    </div>
  )
}
