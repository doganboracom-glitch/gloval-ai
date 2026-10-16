'use client'

import { useRef, useState } from 'react'
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react'
import type { BlogPost } from '@/lib/blog'
import { blogConfirmCopy, callBlogAi, newRequestId } from '@/lib/blog-client'
import { AdvancedAiBadge } from '@/components/advanced-ai-badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { OutOfCreditsModal } from '@/components/pricing/out-of-credits'
import type { BlogProfile } from '@/lib/website-schema'

type Lang = 'tr' | 'en'

const T = {
  tr: {
    back: 'Yazılar',
    title: 'Yapay zekayla yazı hazırla',
    intro: 'Konuyu yazın. Yazı taslak olarak eklenir; yayınlamadan önce siz gözden geçirirsiniz. Başarılı bir taslak 3 AI kredisi harcar, başarısız denemede kredi düşmez.',
    topic: 'Yazı konusu',
    suggestions: 'Konu önerileri',
    factsTitle: 'İşletmenizle ilgili bilgiler (isteğe bağlı)',
    factsIntro: 'Yazı yalnızca burada verdiğiniz bilgileri işletmenize ait gerçek olarak kullanır. Boş bırakırsanız genel, bilgilendirici bir yazı hazırlanır.',
    offering: 'Ne sunuyorsunuz?',
    region: 'Hizmet bölgesi',
    difference: 'Sizi farklı kılan nedir?',
    audience: 'Kimlere hizmet veriyorsunuz?',
    contact: 'İletişim bilgisi',
    remember: 'Bu bilgileri sonraki yazılar için hatırla',
    generate: 'Taslağı hazırla',
    working: 'Yazı hazırlanıyor, bu bir dakika sürebilir…',
    credits: 'AI krediniz yetersiz.',
    limit: 'Yazı sınırına ulaştınız.',
    daily: 'Günlük ücretsiz kullanım sınırına ulaştınız.',
    failed: 'Yazı hazırlanamadı. Kredi düşülmedi, tekrar deneyebilirsiniz.',
  },
  en: {
    back: 'Posts',
    title: 'Write a post with AI',
    intro: 'Describe the topic. The post is added as a draft and you review it before publishing. A successful draft uses 3 AI credits; a failed attempt costs nothing.',
    topic: 'Post topic',
    suggestions: 'Topic ideas',
    factsTitle: 'About your business (optional)',
    factsIntro: 'The post only treats what you enter here as facts about your business. Leave it empty for a general, informative article.',
    offering: 'What do you offer?',
    region: 'Service area',
    difference: 'What makes you different?',
    audience: 'Who do you serve?',
    contact: 'Contact details',
    remember: 'Remember these answers for future posts',
    generate: 'Write the draft',
    working: 'Writing your post, this can take a minute…',
    credits: 'Not enough AI credits.',
    limit: 'You reached the post limit.',
    daily: 'You reached the free daily limit.',
    failed: 'Could not write the post. No credits were charged; you can try again.',
  },
} as const

const FIELDS = ['offering', 'region', 'difference', 'audience', 'contact'] as const

const inputClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30'

export function BlogAiPanel({
  projectId,
  lang,
  topics,
  profile,
  onBack,
  onCreated,
  onRememberProfile,
}: {
  projectId: string
  lang: Lang
  topics: string[]
  profile: BlogProfile | undefined
  onBack: () => void
  onCreated: (post: BlogPost) => void
  onRememberProfile: (profile: BlogProfile | null) => void
}) {
  const t = T[lang]
  const [topic, setTopic] = useState('')
  const [answers, setAnswers] = useState<BlogProfile>(profile ?? {})
  const [remember, setRemember] = useState(Boolean(profile && Object.keys(profile).length))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [askConfirm, setAskConfirm] = useState(false)
  const busyRef = useRef(false)
  const confirmCopy = blogConfirmCopy(lang)

  async function generate() {
    setAskConfirm(false)
    if (topic.trim().length < 3 || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    const cleaned: BlogProfile = {}
    for (const key of FIELDS) {
      const value = answers[key]?.trim()
      if (value) cleaned[key] = value
    }
    const outcome = await callBlogAi('/api/blog/ai-write', {
      projectId,
      requestId: newRequestId(),
      topic: topic.trim(),
      answers: cleaned,
    })
    busyRef.current = false
    setBusy(false)
    if (outcome.ok) {
      onRememberProfile(remember && Object.keys(cleaned).length ? cleaned : null)
      onCreated(outcome.post)
      return
    }
    if (outcome.reason === 'credits') {
      setError(t.credits)
      setUpgradeOpen(true)
    } else if (outcome.reason === 'limit') setError(t.limit)
    else if (outcome.reason === 'daily') setError(t.daily)
    else setError(t.failed)
  }

  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        onClick={onBack}
        className="flex w-fit items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t.back}
      </button>

      <div>
        <h4 className="flex flex-wrap items-center gap-2 font-display text-base font-bold text-foreground">
          {t.title}
          <AdvancedAiBadge flow="blogWrite" lang={lang === 'en' ? 'en' : 'tr'} />
        </h4>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t.intro}</p>
      </div>

      <div>
        <label htmlFor="blog-ai-topic" className="mb-1.5 block text-xs font-medium text-muted-foreground">{t.topic}</label>
        <textarea
          id="blog-ai-topic"
          rows={2}
          maxLength={200}
          className={inputClass}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
        {topics.length > 0 && (
          <div className="mt-2">
            <p className="mb-1.5 text-xs text-muted-foreground">{t.suggestions}</p>
            <div className="flex flex-wrap gap-1.5">
              {topics.map((idea) => (
                <button
                  key={idea}
                  type="button"
                  onClick={() => setTopic(idea)}
                  className="rounded-full border border-border px-3 py-1 text-left text-xs text-foreground transition-colors hover:border-brand/50 hover:bg-brand/10"
                >
                  {idea}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <fieldset className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <legend className="px-1 text-xs font-medium text-muted-foreground">{t.factsTitle}</legend>
        <p className="text-xs leading-relaxed text-muted-foreground">{t.factsIntro}</p>
        {FIELDS.map((key) => (
          <div key={key}>
            <label htmlFor={`blog-ai-${key}`} className="mb-1.5 block text-xs font-medium text-muted-foreground">{t[key]}</label>
            <input
              id={`blog-ai-${key}`}
              className={inputClass}
              value={answers[key] ?? ''}
              maxLength={key === 'offering' || key === 'difference' ? 600 : 400}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [key]: e.target.value }))}
            />
          </div>
        ))}
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" className="h-4 w-4 accent-brand" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          {t.remember}
        </label>
      </fieldset>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {busy && <p role="status" className="text-sm text-muted-foreground">{t.working}</p>}

      <button
        type="button"
        onClick={() => setAskConfirm(true)}
        disabled={busy || topic.trim().length < 3}
        className="flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
        {t.generate}
      </button>
      <ConfirmDialog
        open={askConfirm}
        title={confirmCopy.creditsTitle}
        description={confirmCopy.writeBody}
        confirmLabel={confirmCopy.creditsContinue}
        cancelLabel={confirmCopy.cancel}
        onConfirm={() => void generate()}
        onCancel={() => setAskConfirm(false)}
      />
      <OutOfCreditsModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  )
}
