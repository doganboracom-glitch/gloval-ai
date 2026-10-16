'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Check, Loader2, Sparkles, X } from 'lucide-react'
import { AdvancedAiBadge } from '@/components/advanced-ai-badge'
import { getStoreAiStatus, markStoreAiApplied } from '@/lib/store-ai-actions'
import { STORE_AI_DRAFT_NOTE, costLabel, type StoreAiNextAttempt } from '@/lib/store-ai-constants'
import { STORE_AI_ERROR_MESSAGES } from '@/lib/store-ai-messages'
import type { StoreAiGeneratedSpec, StoreAiTextResult } from '@/lib/store-ai-text'

export type AiApplyChange = {
  description?: string
  specs?: Array<{ name: string; value: string }>
  seoTitle?: string
  seoDescription?: string
  imageAlts?: Array<string | null>
  categoryId?: string
}

type Props = {
  projectId: string
  productKey: string
  name: string
  categoryId: string
  categories: ReadonlyArray<{ id: string; name: string }>
  specs: ReadonlyArray<{ name: string; value: string }>
  imageUrls: readonly string[]
  disabled?: boolean
  onApply: (change: AiApplyChange) => void
}

type Failure = { message: string; insufficient: boolean }

const actionClass =
  'inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50'

function specForForm(spec: StoreAiGeneratedSpec): { name: string; value: string } {
  return { name: spec.name, value: spec.verify ? `(Doğrulayın) ${spec.value}`.trim() : spec.value }
}

export function ProductAiAssistant({
  projectId,
  productKey,
  name,
  categoryId,
  categories,
  specs,
  imageUrls,
  disabled,
  onApply,
}: Props) {
  const { data: status, mutate } = useSWR(['store-ai-status', projectId, productKey], () =>
    getStoreAiStatus(projectId, productKey, 'text'),
  )
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<StoreAiTextResult | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [applied, setApplied] = useState<Set<string>>(new Set())
  const controller = useRef<AbortController | null>(null)

  const next: StoreAiNextAttempt | null = status?.ok ? status.next : null
  const balance = status?.ok ? status.balance : null
  const cannotAfford = status?.ok === true && !status.canAfford

  async function generate() {
    if (running) return
    const abort = new AbortController()
    controller.current = abort
    setRunning(true)
    setFailure(null)
    try {
      const response = await fetch('/api/ecommerce/ai-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abort.signal,
        body: JSON.stringify({
          projectId,
          productKey,
          requestId: crypto.randomUUID(),
          name,
          categoryId: categoryId || null,
          specs,
          imageUrls,
          lang: 'tr',
        }),
      })
      const json = await response.json().catch(() => null)
      if (response.ok && json?.ok) {
        setResult(json.result as StoreAiTextResult)
        setApplied(new Set())
      } else {
        setFailure({
          message: json?.message ?? STORE_AI_ERROR_MESSAGES.generation_failed,
          insufficient: json?.error === 'insufficient_credits',
        })
      }
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError'
      setFailure({
        message: aborted ? STORE_AI_ERROR_MESSAGES.aborted : STORE_AI_ERROR_MESSAGES.generation_failed,
        insufficient: false,
      })
    } finally {
      controller.current = null
      setRunning(false)
      void mutate()
    }
  }

  async function use(keys: string[], change: AiApplyChange) {
    onApply(change)
    setApplied((current) => new Set([...current, ...keys]))
    await markStoreAiApplied(projectId, productKey, 'text')
    void mutate()
  }

  const rows: Array<{ key: string; label: string; preview: React.ReactNode; change: AiApplyChange }> = result
    ? [
        {
          key: 'description',
          label: 'Açıklama',
          preview: <p className="whitespace-pre-line text-sm">{result.description}</p>,
          change: { description: result.description },
        },
        ...(result.specs.length > 0
          ? [
              {
                key: 'specs',
                label: 'Özellikler',
                preview: (
                  <ul className="flex flex-col gap-1 text-sm">
                    {result.specs.map((spec) => (
                      <li key={spec.name} className="flex flex-wrap items-center gap-2">
                        <span>
                          {spec.name}
                          {spec.value ? `: ${spec.value}` : ''}
                        </span>
                        {spec.verify && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                            Doğrulayın
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ),
                change: { specs: result.specs.map(specForForm) },
              },
            ]
          : []),
        {
          key: 'seoTitle',
          label: 'SEO başlığı',
          preview: <p className="text-sm">{result.seoTitle}</p>,
          change: { seoTitle: result.seoTitle },
        },
        ...(result.seoDescription
          ? [
              {
                key: 'seoDescription',
                label: 'SEO açıklaması',
                preview: <p className="text-sm">{result.seoDescription}</p>,
                change: { seoDescription: result.seoDescription },
              },
            ]
          : []),
        ...(result.imageAlts.some(Boolean)
          ? [
              {
                key: 'imageAlts',
                label: 'Görsel açıklamaları',
                preview: (
                  <ol className="flex list-inside list-decimal flex-col gap-1 text-sm">
                    {result.imageAlts.map((alt, index) => (
                      <li key={index} className={alt ? '' : 'text-muted-foreground'}>
                        {alt ?? 'Öneri yok'}
                      </li>
                    ))}
                  </ol>
                ),
                change: { imageAlts: result.imageAlts },
              },
            ]
          : []),
        ...(result.categoryId
          ? [
              {
                key: 'categoryId',
                label: 'Kategori',
                preview: <p className="text-sm">{categories.find((c) => c.id === result.categoryId)?.name}</p>,
                change: { categoryId: result.categoryId },
              },
            ]
          : []),
      ]
    : []

  const buttonLabel = result ? 'Yeniden dene' : 'Yapay zekâ ile doldur'

  return (
    <section aria-label="Yapay zekâ ile ürün metni" className="rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-brand" aria-hidden />
            Yapay zekâ ile doldur
            <AdvancedAiBadge flow="productText" />
          </h3>
          <p className="text-xs text-muted-foreground">
            Görsel, ürün adı ve özelliklerden açıklama, özellikler, SEO ve görsel açıklamaları önerir.
            {balance !== null && ` Bakiye: ${balance} kredi.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {running && (
            <button type="button" onClick={() => controller.current?.abort()} className={actionClass}>
              <X className="size-3.5" aria-hidden />
              İptal
            </button>
          )}
          <button
            type="button"
            onClick={generate}
            disabled={running || disabled || cannotAfford}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-brand px-3 text-sm font-medium text-brand-foreground outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50"
          >
            {running ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
            {running ? 'Hazırlanıyor…' : buttonLabel}
            {next && !running && <span className="text-xs opacity-80">· {costLabel(next)}</span>}
          </button>
        </div>
      </div>

      {(failure || cannotAfford) && (
        <div role="alert" className="mt-3 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <p>{failure?.message ?? STORE_AI_ERROR_MESSAGES.insufficient_credits}</p>
          {(failure?.insufficient || cannotAfford) && (
            <p className="mt-1 flex flex-wrap gap-3 text-xs font-medium underline">
              <Link href="/billing" target="_blank">
                Kredi yükle
              </Link>
              <Link href="/support/new" target="_blank">
                Destek al
              </Link>
            </p>
          )}
        </div>
      )}

      {result && (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">{STORE_AI_DRAFT_NOTE}</p>
          {rows.map((row) => (
            <div key={row.key} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3">
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-xs font-semibold text-muted-foreground">{row.label}</p>
                {row.preview}
              </div>
              <button
                type="button"
                onClick={() => void use([row.key], row.change)}
                disabled={applied.has(row.key)}
                className={actionClass}
              >
                {applied.has(row.key) ? <Check className="size-3.5" aria-hidden /> : null}
                {applied.has(row.key) ? 'Kullanıldı' : 'Kullan'}
              </button>
            </div>
          ))}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void use(rows.map((r) => r.key), Object.assign({}, ...rows.map((r) => r.change)))}
              className={actionClass}
            >
              Hepsini kullan
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
