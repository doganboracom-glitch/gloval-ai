'use client'

import { useRef, useState } from 'react'
import useSWR from 'swr'
import { RefreshCw, Sparkles, X } from 'lucide-react'
import type { WebsiteSchema } from '@/lib/website-schema'
import { describePanel, PREVIEW_COSTS } from '@/lib/ai-preview/policy'
import type { PreviewView } from '@/lib/ai-preview/service'

type State = { freeAvailable: boolean; balance: number; preview: PreviewView | null }
export type UsedImage = { src: string; alt: string }

const COPY = {
  tr: {
    generate: 'AI ile üret',
    free: 'ücretsiz önizleme',
    credits: (n: number) => `${n} kredi`,
    working: 'Hazırlanıyor…',
    regenerate: 'Yeniden üret',
    use: 'Kullan',
    close: 'Kapat',
    previewTitle: 'AI görsel önizlemesi',
    freeNote: 'Bu önizleme ücretsiz. Kullan dediğinizde 2 kredi düşer; kapatırsanız hiçbir şey düşmez.',
    paidNote: 'Önizleme için 2 kredi düştü. Kullan ek ücret almaz.',
    balance: (n: number) => `Kalan kredi: ${n}`,
    noCredits: 'AI krediniz yetersiz.',
    dailyLimit: 'Günlük ücretsiz işlem limitine ulaştınız.',
    failed: 'Görsel üretilemedi, kredi düşülmedi.',
    expired: 'Önizlemenin süresi doldu. Yeniden üretebilirsiniz.',
    busy: 'Bir işlem sürüyor, lütfen bekleyin.',
    max: 'En fazla 3 görsel eklenebilir.',
  },
  en: {
    generate: 'Generate with AI',
    free: 'free preview',
    credits: (n: number) => `${n} credits`,
    working: 'Working…',
    regenerate: 'Regenerate',
    use: 'Use',
    close: 'Close',
    previewTitle: 'AI image preview',
    freeNote: 'This preview is free. Using it costs 2 credits; closing costs nothing.',
    paidNote: '2 credits were charged for this preview. Using it costs nothing more.',
    balance: (n: number) => `Credits left: ${n}`,
    noCredits: 'Not enough AI credits.',
    dailyLimit: 'You reached the free daily action limit.',
    failed: 'Could not generate the image. No credits were used.',
    expired: 'The preview expired. You can generate a new one.',
    busy: 'An action is in progress, please wait.',
    max: 'Up to 3 images.',
  },
} as const

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? (r.json() as Promise<State>) : null))

export function AiImagePreviewPanel({
  site,
  index,
  projectId,
  canAdd,
  disabled,
  onUse,
}: {
  site: WebsiteSchema
  index: number
  projectId: string | null
  canAdd: boolean
  disabled?: boolean
  onUse: (image: UsedImage) => void
}) {
  const c = COPY[site.meta.language === 'en' ? 'en' : 'tr']
  const sectionKey = `about:${index}`
  const swrKey = projectId
    ? `/api/ai-previews?projectId=${encodeURIComponent(projectId)}&sectionKey=${encodeURIComponent(sectionKey)}`
    : null
  const { data, mutate } = useSWR(swrKey, fetcher, { revalidateOnFocus: false })
  const [busy, setBusy] = useState<null | 'start' | 'regen' | 'use'>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // One idempotency key per preview and action: a retry after a timeout cannot charge twice.
  const useKey = useRef<{ id: string; key: string } | null>(null)

  if (!projectId) return null

  const preview = data?.preview ?? null
  const panel = describePanel({
    freeAvailable: data?.freeAvailable ?? false,
    balance: data?.balance ?? 0,
    preview,
  })

  const call = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/ai-previews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, sectionKey, ...body }),
    })
    const json = await res.json().catch(() => ({}))
    if (res.ok) return json
    const error =
      res.status === 402 ? c.noCredits
      : res.status === 429 ? c.dailyLimit
      : res.status === 410 ? c.expired
      : res.status === 409 ? c.busy
      : c.failed
    throw new Error(error)
  }

  const run = async (kind: 'start' | 'regen' | 'use', fn: () => Promise<void>) => {
    if (busy) return
    setBusy(kind)
    setNotice(null)
    try {
      await fn()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : c.failed)
      await mutate()
    } finally {
      setBusy(null)
    }
  }

  const start = () =>
    run('start', async () => {
      const json = await call({ action: 'start', schema: site })
      await mutate({ ...(data as State), preview: json.preview }, { revalidate: true })
    })

  const regenerate = () =>
    run('regen', async () => {
      if (!preview) return
      const json = await call({ action: 'regenerate', id: preview.id, key: crypto.randomUUID(), schema: site })
      await mutate({ ...(data as State), preview: json.preview }, { revalidate: true })
    })

  const use = () =>
    run('use', async () => {
      if (!preview) return
      if (useKey.current?.id !== preview.id) useKey.current = { id: preview.id, key: crypto.randomUUID() }
      const json = await call({ action: 'use', id: preview.id, key: useKey.current.key })
      onUse({ src: json.image.src, alt: json.image.alt })
      useKey.current = null
      await mutate({ ...(data as State), preview: null }, { revalidate: true })
    })

  const close = async () => {
    if (!preview || busy) return
    await mutate({ ...(data as State), preview: null }, { revalidate: false })
    await call({ action: 'discard', id: preview.id }).catch(() => undefined)
    await mutate()
  }

  const startLabel = panel.start.free ? c.free : c.credits(panel.start.cost)

  return (
    <div className="flex flex-col gap-2">
      {!preview && (
        <button
          type="button"
          onClick={() => void start()}
          disabled={disabled || busy !== null || !canAdd || !panel.start.enabled}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-medium transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          {busy === 'start' ? c.working : `${c.generate} (${startLabel})`}
        </button>
      )}

      {preview && (
        <div role="group" aria-label={c.previewTitle} className="flex flex-col gap-2 rounded-lg border border-border p-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">{c.previewTitle}</span>
            <button
              type="button"
              onClick={() => void close()}
              aria-label={c.close}
              disabled={busy !== null}
              className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview.imageUrl} alt={preview.alt} className="aspect-[4/3] w-full rounded-md border border-border object-cover" />
          <p className="text-xs text-muted-foreground">{preview.kind === 'free' ? c.freeNote : c.paidNote}</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void regenerate()}
              disabled={busy !== null || !panel.regenerate?.enabled}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-medium hover:border-primary hover:text-primary disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              {busy === 'regen' ? c.working : `${c.regenerate} (${c.credits(PREVIEW_COSTS.regenerate)})`}
            </button>
            <button
              type="button"
              onClick={() => void use()}
              disabled={busy !== null || !panel.use?.enabled}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-brand py-2 text-xs font-medium text-brand-foreground disabled:opacity-50"
            >
              {busy === 'use' ? c.working : panel.use?.cost ? `${c.use} (${c.credits(panel.use.cost)})` : c.use}
            </button>
          </div>
        </div>
      )}

      {data && <p className="text-xs text-muted-foreground">{c.balance(data.balance)}</p>}
      {notice ? (
        <p role="status" className="text-xs text-destructive">
          {notice}
        </p>
      ) : null}
    </div>
  )
}
