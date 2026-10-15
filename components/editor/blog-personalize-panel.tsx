'use client'

import { useRef, useState } from 'react'
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react'
import type { BlogPost } from '@/lib/blog'
import { callBlogAi, newRequestId } from '@/lib/blog-client'
import { OutOfCreditsModal } from '@/components/pricing/out-of-credits'
import type { BlogProfile } from '@/lib/website-schema'

type Lang = 'tr' | 'en'

const T = {
  tr: {
    back: 'Yazılar',
    title: 'AI ile özelleştir',
    intro: 'Bu örnek yazı, aşağıdaki bilgilerinizle yeniden yazılır. Yalnızca verdiğiniz bilgiler işletmenize ait gerçek olarak kullanılır. Başarılı özelleştirme 3 AI kredisi harcar, başarısızsa kredi düşmez.',
    offering: 'Ne sunuyorsunuz?',
    region: 'Hizmet bölgesi',
    difference: 'Sizi farklı kılan nedir?',
    audience: 'Kimlere hizmet veriyorsunuz?',
    contact: 'İletişim bilgisi (isteğe bağlı)',
    confirm: 'Yazının bu bilgilerle yeniden yazılmasını ve arama motorlarına açık (indexlenebilir) olmasını onaylıyorum.',
    run: 'Özelleştir (3 kredi)',
    working: 'Yazı özelleştiriliyor, bu bir dakika sürebilir…',
    answers: 'Lütfen en az bir soruyu cevaplayın.',
    credits: 'AI krediniz yetersiz.',
    daily: 'Günlük ücretsiz kullanım sınırına ulaştınız.',
    failed: 'Yazı özelleştirilemedi. Kredi düşülmedi, tekrar deneyebilirsiniz.',
    duplicate: 'Bu işlem zaten gerçekleştirildi.',
  },
  en: {
    back: 'Posts',
    title: 'Personalize with AI',
    intro: 'This sample post is rewritten with the details below. Only what you enter is treated as fact about your business. A successful rewrite uses 3 AI credits; a failed one costs nothing.',
    offering: 'What do you offer?',
    region: 'Service area',
    difference: 'What makes you different?',
    audience: 'Who do you serve?',
    contact: 'Contact details (optional)',
    confirm: 'I approve rewriting the post with these details and making it open to search engines (indexable).',
    run: 'Personalize (3 credits)',
    working: 'Personalizing the post, this can take a minute…',
    answers: 'Please answer at least one question.',
    credits: 'Not enough AI credits.',
    daily: 'You reached the free daily limit.',
    failed: 'Could not personalize the post. No credits were charged; you can try again.',
    duplicate: 'This action was already completed.',
  },
} as const

const FIELDS = ['offering', 'region', 'difference', 'audience', 'contact'] as const

const inputClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30'

export function BlogPersonalizePanel({
  projectId,
  post,
  lang,
  profile,
  onBack,
  onDone,
  onRememberProfile,
}: {
  projectId: string
  post: BlogPost
  lang: Lang
  profile: BlogProfile | undefined
  onBack: () => void
  onDone: (post: BlogPost) => void
  onRememberProfile: (profile: BlogProfile | null) => void
}) {
  const t = T[lang]
  const [answers, setAnswers] = useState<BlogProfile>(profile ?? {})
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const busyRef = useRef(false)

  const cleaned: BlogProfile = {}
  for (const key of FIELDS) {
    const value = answers[key]?.trim()
    if (value) cleaned[key] = value
  }
  const hasAnswers = Object.keys(cleaned).length > 0

  async function run() {
    if (busyRef.current || !confirmed || !hasAnswers) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    const outcome = await callBlogAi('/api/blog/personalize', {
      projectId,
      postId: post.id,
      requestId: newRequestId(),
      answers: cleaned,
      confirmed,
    })
    busyRef.current = false
    setBusy(false)
    if (outcome.ok) {
      onRememberProfile(cleaned)
      onDone(outcome.post)
      return
    }
    if (outcome.reason === 'credits') {
      setError(t.credits)
      setUpgradeOpen(true)
    } else if (outcome.reason === 'daily') setError(t.daily)
    else if (outcome.reason === 'duplicate') setError(t.duplicate)
    else if (outcome.reason === 'answers') setError(t.answers)
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
        <h4 className="font-display text-base font-bold text-foreground">{t.title}</h4>
        <p className="mt-1 text-sm font-medium text-foreground">{post.title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t.intro}</p>
      </div>
      <div className="flex flex-col gap-3">
        {FIELDS.map((key) => (
          <div key={key}>
            <label htmlFor={`blog-pz-${key}`} className="mb-1.5 block text-xs font-medium text-muted-foreground">
              {t[key]}
            </label>
            <input
              id={`blog-pz-${key}`}
              className={inputClass}
              value={answers[key] ?? ''}
              maxLength={600}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [key]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-brand"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        {t.confirm}
      </label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {busy && <p role="status" className="text-sm text-muted-foreground">{t.working}</p>}
      <button
        type="button"
        onClick={run}
        disabled={busy || !confirmed || !hasAnswers}
        className="flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
        {t.run}
      </button>
      <OutOfCreditsModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  )
}
