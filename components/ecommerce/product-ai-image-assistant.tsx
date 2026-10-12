'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Check, ImagePlus, Loader2, RefreshCw, X } from 'lucide-react'
import { PRODUCT_IMAGE_LIMITS, type ProductImage } from '@/lib/product-images'
import { getStoreAiStatus } from '@/lib/store-ai-actions'
import { STORE_AI_IMAGE_DISCLAIMER, costLabel } from '@/lib/store-ai-constants'
import { IMAGE_STYLES, canAddToGallery, type ImageStyleId } from '@/lib/store-ai-image-styles'
import { STORE_AI_ERROR_MESSAGES, STORE_AI_IMAGE_ERROR_MESSAGES } from '@/lib/store-ai-messages'

type Props = {
  projectId: string
  productKey: string
  name: string
  images: readonly ProductImage[]
  disabled?: boolean
  onAdd: (image: ProductImage) => void
}

type Candidate = { file: string; url: string }
type Failure = { message: string; insufficient: boolean }

const actionClass =
  'inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50'

export function ProductAiImageAssistant({ projectId, productKey, name, images, disabled, onAdd }: Props) {
  const { data: status, mutate } = useSWR(['store-ai-status', projectId, productKey, 'image'], () =>
    getStoreAiStatus(projectId, productKey, 'image'),
  )
  const [sourceIndex, setSourceIndex] = useState(0)
  const [style, setStyle] = useState<ImageStyleId>('white-studio')
  const [running, setRunning] = useState(false)
  const [adding, setAdding] = useState(false)
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const controller = useRef<AbortController | null>(null)

  const source = images[Math.min(sourceIndex, images.length - 1)]
  const next = status?.ok ? status.next : null
  const balance = status?.ok ? status.balance : null
  const cannotAfford = status?.ok === true && !status.canAfford
  const galleryFull = !canAddToGallery(images.length)

  async function generate() {
    if (running || !source) return
    const abort = new AbortController()
    controller.current = abort
    setRunning(true)
    setFailure(null)
    try {
      const response = await fetch('/api/ecommerce/ai-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abort.signal,
        body: JSON.stringify({
          projectId,
          productKey,
          requestId: crypto.randomUUID(),
          sourceUrl: source.url,
          style,
          name,
        }),
      })
      const json = await response.json().catch(() => null)
      if (response.ok && json?.ok) {
        setCandidate(json.candidate as Candidate)
      } else {
        setFailure({
          message: json?.message ?? STORE_AI_IMAGE_ERROR_MESSAGES.generation_failed ?? STORE_AI_ERROR_MESSAGES.generation_failed,
          insufficient: json?.error === 'insufficient_credits',
        })
      }
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError'
      setFailure({
        message: aborted ? STORE_AI_ERROR_MESSAGES.aborted : (STORE_AI_IMAGE_ERROR_MESSAGES.generation_failed ?? ''),
        insufficient: false,
      })
    } finally {
      controller.current = null
      setRunning(false)
      void mutate()
    }
  }

  async function accept() {
    if (!candidate || adding) return
    setAdding(true)
    setFailure(null)
    try {
      const response = await fetch('/api/ecommerce/ai-image/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          productKey,
          candidate: candidate.file,
          galleryCount: images.length,
          sourceAlt: source?.alt ?? '',
          name,
        }),
      })
      const json = await response.json().catch(() => null)
      if (response.ok && json?.ok) {
        onAdd({ url: json.url as string, alt: String(json.alt ?? '').slice(0, PRODUCT_IMAGE_LIMITS.maxAlt) })
        setCandidate(null)
      } else {
        if (json?.error === 'candidate_expired') setCandidate(null)
        setFailure({
          message: json?.message ?? STORE_AI_ERROR_MESSAGES.generation_failed,
          insufficient: false,
        })
      }
    } catch {
      setFailure({ message: 'Görsel galeriye eklenemedi. Lütfen tekrar deneyin.', insufficient: false })
    } finally {
      setAdding(false)
      void mutate()
    }
  }

  if (images.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
        Yapay zekâ ile alternatif görsel üretmek için önce bir ürün görseli yükleyin.
      </p>
    )
  }

  return (
    <section aria-label="Yapay zekâ ile alternatif görsel" className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <ImagePlus className="size-4 text-brand" aria-hidden />
            Alternatif görsel üret
          </h4>
          <p className="text-xs text-muted-foreground">
            Ürününüz aynı kalır; yalnızca arka plan ve ışık değişir.
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
            disabled={running || disabled || cannotAfford || adding}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-brand px-3 text-sm font-medium text-brand-foreground outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50"
          >
            {running ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
            {running ? 'Üretiliyor…' : candidate ? 'Yeniden dene' : 'Görsel üret'}
            {next && !running && <span className="text-xs opacity-80">· {costLabel(next)}</span>}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {images.length > 1 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Kaynak görsel</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Kaynak görsel">
              {images.map((image, index) => {
                const selected = index === Math.min(sourceIndex, images.length - 1)
                return (
                  <button
                    key={image.url}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={`${index + 1}. görsel`}
                    onClick={() => setSourceIndex(index)}
                    className={`size-14 overflow-hidden rounded-md border-2 outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                      selected ? 'border-brand' : 'border-border opacity-70 hover:opacity-100'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.url} alt="" className="size-full object-cover" />
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div>
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Stil</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Görsel stili">
            {IMAGE_STYLES.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={style === option.id}
                onClick={() => setStyle(option.id)}
                className={`rounded-lg border px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                  style === option.id ? 'border-brand bg-brand/10' : 'border-border bg-background hover:bg-muted'
                }`}
              >
                <span className="block text-xs font-semibold">{option.label}</span>
                <span className="block text-[11px] text-muted-foreground">{option.description}</span>
              </button>
            ))}
          </div>
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

      {candidate && (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={candidate.url}
            alt="Yapay zekâ ile üretilen alternatif ürün görseli"
            className="aspect-square w-full rounded-md border border-border object-cover sm:w-48"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <p className="text-xs text-muted-foreground">{STORE_AI_IMAGE_DISCLAIMER}</p>
            {galleryFull && (
              <p className="text-xs font-medium text-destructive">{STORE_AI_ERROR_MESSAGES.gallery_full}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void accept()}
                disabled={adding || galleryFull || running}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-brand px-3 text-sm font-medium text-brand-foreground outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50"
              >
                {adding ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
                Galeriye ekle
              </button>
              <button
                type="button"
                onClick={() => void generate()}
                disabled={running || adding || cannotAfford}
                className={actionClass}
              >
                <RefreshCw className="size-3.5" aria-hidden />
                Yeniden dene
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">Eklemezseniz görsel bir saat içinde silinir.</p>
          </div>
        </div>
      )}
    </section>
  )
}
