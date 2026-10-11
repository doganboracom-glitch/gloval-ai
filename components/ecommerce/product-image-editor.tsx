'use client'

import { useId, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Trash2 } from 'lucide-react'
import {
  PRODUCT_IMAGE_LIMITS,
  PRODUCT_IMAGE_MIME_TYPES,
  type ProductImage,
} from '@/lib/product-images'

const ERROR_MESSAGES: Record<string, string> = {
  too_large: 'Görsel 5 MB sınırını aşıyor.',
  invalid_request: 'Yükleme isteği geçersiz.',
  unsupported_type: 'Yalnızca JPG, PNG veya WebP yükleyebilirsiniz.',
  invalid_image: 'Dosya geçerli bir görsel değil.',
}

const inputCls =
  'h-9 w-full rounded-md border border-input bg-background/60 px-2 text-xs outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30'

type Props = {
  projectId: string
  images: ProductImage[]
  onChange: (images: ProductImage[]) => void
  onUploaded: (url: string) => void
  onBusyChange: (busy: boolean) => void
}

export function ProductImageEditor({ projectId, images, onChange, onUploaded, onBusyChange }: Props) {
  const inputId = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(images)
  latest.current = images

  const remaining = PRODUCT_IMAGE_LIMITS.maxCount - images.length - uploading

  async function uploadOne(file: File) {
    if (!(PRODUCT_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
      return ERROR_MESSAGES.unsupported_type
    }
    if (file.size > PRODUCT_IMAGE_LIMITS.maxBytes) return ERROR_MESSAGES.too_large

    const body = new FormData()
    body.set('projectId', projectId)
    body.set('file', file)
    try {
      const res = await fetch('/api/ecommerce/product-images', { method: 'POST', body })
      const data = (await res.json()) as { ok: boolean; url?: string; error?: string }
      if (!data.ok || !data.url) {
        return ERROR_MESSAGES[data.error ?? ''] ?? 'Görsel yüklenemedi. Lütfen tekrar deneyin.'
      }
      onUploaded(data.url)
      onChange([...latest.current, { url: data.url, alt: '' }])
      return null
    } catch {
      return 'Görsel yüklenemedi. Bağlantınızı kontrol edin.'
    }
  }

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    const files = Array.from(list).slice(0, Math.max(remaining, 0))
    setError(
      list.length > files.length
        ? `En fazla ${PRODUCT_IMAGE_LIMITS.maxCount} görsel ekleyebilirsiniz.`
        : null,
    )
    if (files.length === 0) return

    setUploading((n) => n + files.length)
    onBusyChange(true)
    for (const file of files) {
      const message = await uploadOne(file)
      if (message) setError(message)
      setUploading((n) => {
        const next = n - 1
        if (next === 0) onBusyChange(false)
        return next
      })
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  function move(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= images.length) return
    const next = [...images]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-3">
      {images.length > 0 && (
        <ul className="grid grid-cols-2 gap-3">
          {images.map((image, index) => (
            <li key={image.url} className="flex flex-col gap-2 rounded-lg border border-border p-2">
              <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt={image.alt} className="size-full object-cover" />
                {index === 0 && (
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
                    Kapak
                  </span>
                )}
              </div>
              <input
                aria-label={`${index + 1}. görsel alternatif metni`}
                value={image.alt}
                maxLength={PRODUCT_IMAGE_LIMITS.maxAlt}
                placeholder="Alternatif metin"
                onChange={(e) =>
                  onChange(images.map((it, i) => (i === index ? { ...it, alt: e.target.value } : it)))
                }
                className={inputCls}
              />
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label="Öne al"
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                  >
                    <ArrowLeft className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === images.length - 1}
                    aria-label="Geriye al"
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                  >
                    <ArrowRight className="size-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => onChange(images.filter((_, i) => i !== index))}
                  aria-label="Görseli kaldır"
                  className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div>
        <input
          ref={fileRef}
          id={inputId}
          type="file"
          multiple
          accept={PRODUCT_IMAGE_MIME_TYPES.join(',')}
          className="sr-only"
          onChange={(e) => void handleFiles(e.target.files)}
        />
        <label
          htmlFor={inputId}
          aria-disabled={remaining <= 0}
          className={`flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm font-medium transition-colors hover:border-primary hover:text-primary ${
            remaining <= 0 ? 'pointer-events-none opacity-50' : ''
          }`}
        >
          {uploading > 0 ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          {uploading > 0 ? 'Yükleniyor…' : 'Görsel ekle'}
        </label>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {images.length}/{PRODUCT_IMAGE_LIMITS.maxCount} görsel. JPG, PNG veya WebP, en fazla 5 MB. İlk görsel
          kapak olarak kullanılır.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
