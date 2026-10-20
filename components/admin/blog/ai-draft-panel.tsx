'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/components/language-provider'
import { Panel } from '@/components/admin/admin-ui'
import { blogAdminT } from '@/lib/blog-admin-copy'
import { DRAFT_TOPIC_MAX } from '@/lib/blog-ai-draft'

const inputClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-brand/50'

export function AiDraftPanel({ onClose }: { onClose: () => void }) {
  const { lang } = useLanguage()
  const t = blogAdminT(lang)
  const copy = t.editor.aiDraft
  const router = useRouter()
  const [topic, setTopic] = useState('')
  const [keywords, setKeywords] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (working) return
    setWorking(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/blog/draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topic, keywords }),
      })
      const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string }
      if (res.ok && json.id) {
        router.push(`/admin/blog/${json.id}`)
        return
      }
      const key = res.status === 429 ? 'rate_limited' : (json.error ?? 'failed')
      setError(t.errors[key] ?? t.errors.failed)
    } catch {
      setError(t.errors.failed)
    }
    setWorking(false)
  }

  return (
    <Panel title={copy.title}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-muted-foreground">{copy.hint}</p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ai-topic" className="text-sm font-medium text-foreground">
            {copy.topic}
          </label>
          <input
            id="ai-topic"
            value={topic}
            onChange={(ev) => setTopic(ev.target.value)}
            maxLength={DRAFT_TOPIC_MAX}
            placeholder={copy.topicPlaceholder}
            disabled={working}
            required
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ai-keywords" className="text-sm font-medium text-foreground">
            {copy.keywords}
          </label>
          <input
            id="ai-keywords"
            value={keywords}
            onChange={(ev) => setKeywords(ev.target.value)}
            disabled={working}
            className={inputClass}
          />
          <span className="text-xs text-muted-foreground">{copy.keywordsHint}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={working || topic.trim().length < 5}>
            {working ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
            {copy.submit}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={working}>
            {copy.cancel}
          </Button>
          <p role="status" aria-live="polite" className="text-xs">
            {working ? (
              <span className="text-muted-foreground">{copy.working}</span>
            ) : error ? (
              <span className="text-destructive">{error}</span>
            ) : null}
          </p>
        </div>
      </form>
    </Panel>
  )
}
