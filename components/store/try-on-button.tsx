'use client'

import { useRef, useState, type ReactNode } from 'react'
import { Sparkles, Upload, X, Download, RotateCcw, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * TryOnButton
 * -----------
 * Buyer-facing "AI ile üzerinde dene" trigger + modal, shared by the real
 * storefront (`components/store/product-detail.tsx`) and every demo site's
 * product detail page (`components/demo-site/catalog-detail.tsx`).
 *
 * Deliberately styled with the app's own shadcn tokens (bg-card/border-border)
 * rather than a demo's `--site-*` theme vars — this is a utility overlay, not
 * on-page content, matching how `product-detail.tsx`'s own "already in cart"
 * dialog is styled.
 *
 * The buyer's uploaded photo is held only in local component state (as a
 * data URL) and sent straight to `/api/try-on` — it is never persisted.
 */

const MAX_FILE_BYTES = 6 * 1024 * 1024

type Copy = {
  cta: string
  title: string
  intro: string
  uploadHint: string
  changePhoto: string
  generate: string
  generating: string
  tryAgain: string
  download: string
  close: string
  errorTooLarge: string
  errorType: string
  errorGeneric: Record<'unavailable' | 'failed' | 'rate_limited' | 'not_available' | 'default', string>
}

const COPY: Record<'tr' | 'en', Copy> = {
  tr: {
    cta: 'AI ile üzerinde dene',
    title: 'Üzerinde dene',
    intro: 'Bir fotoğrafını yükle, yapay zekâ ürünü senin üzerinde göstersin.',
    uploadHint: 'Fotoğraf yükle (JPG, PNG veya WEBP, en fazla 6MB)',
    changePhoto: 'Fotoğrafı değiştir',
    generate: 'Oluştur',
    generating: 'Oluşturuluyor…',
    tryAgain: 'Tekrar dene',
    download: 'İndir',
    close: 'Kapat',
    errorTooLarge: 'Fotoğraf çok büyük. Lütfen 6MB altında bir görsel seç.',
    errorType: 'Sadece JPG, PNG veya WEBP formatında fotoğraf yükleyebilirsin.',
    errorGeneric: {
      unavailable: 'Bu özellik şu anda kullanılamıyor.',
      failed: 'Görsel oluşturulamadı. Lütfen tekrar dene.',
      rate_limited: 'Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar dene.',
      not_available: 'Bu özellik şu anda kullanılamıyor.',
      default: 'Bir şeyler ters gitti. Lütfen tekrar dene.',
    },
  },
  en: {
    cta: 'Try it on with AI',
    title: 'Try it on',
    intro: 'Upload a photo of yourself and let AI show you wearing the product.',
    uploadHint: 'Upload a photo (JPG, PNG or WEBP, up to 6MB)',
    changePhoto: 'Change photo',
    generate: 'Generate',
    generating: 'Generating…',
    tryAgain: 'Try again',
    download: 'Download',
    close: 'Close',
    errorTooLarge: 'That photo is too large. Please choose one under 6MB.',
    errorType: 'Please upload a JPG, PNG or WEBP photo.',
    errorGeneric: {
      unavailable: 'This feature is not available right now.',
      failed: 'Could not generate the image. Please try again.',
      rate_limited: 'Too many attempts. Please try again in a few minutes.',
      not_available: 'This feature is not available right now.',
      default: 'Something went wrong. Please try again.',
    },
  },
}

type TryOnTarget =
  | { mode: 'store'; storeSlug: string }
  | { mode: 'demo'; demoSlug: string }

export function TryOnButton({
  productImage,
  productName,
  lang = 'tr',
  target,
  trigger,
}: {
  productImage: string
  productName: string
  lang?: 'tr' | 'en'
  target: TryOnTarget
  /**
   * Custom trigger rendering for pages that use their own theme (demo sites
   * theme via `--site-*` vars instead of shadcn tokens). Receives an
   * `onClick` to open the modal; the caller owns all visual styling.
   */
  trigger?: (props: { onClick: () => void }) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [photo, setPhoto] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const t = COPY[lang]

  function reset() {
    setPhoto(null)
    setResult(null)
    setStatus('idle')
    setErrorMsg(null)
  }

  function close() {
    setOpen(false)
    reset()
  }

  function handleFile(file: File | undefined) {
    if (!file) return
    if (file.size > MAX_FILE_BYTES) {
      setErrorMsg(t.errorTooLarge)
      return
    }
    if (!/^image\/(jpeg|jpg|png|webp)$/.test(file.type)) {
      setErrorMsg(t.errorType)
      return
    }
    setErrorMsg(null)
    setResult(null)
    const reader = new FileReader()
    reader.onload = () => setPhoto(reader.result as string)
    reader.readAsDataURL(file)
  }

  async function generate() {
    if (!photo) return
    setStatus('loading')
    setErrorMsg(null)
    try {
      const res = await fetch('/api/try-on', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: target.mode,
          storeSlug: target.mode === 'store' ? target.storeSlug : undefined,
          demoSlug: target.mode === 'demo' ? target.demoSlug : undefined,
          personPhoto: photo,
          productImage,
          productName,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; dataUrl?: string; error?: string }
      if (!res.ok || !data.ok || !data.dataUrl) {
        const key = (data.error as keyof Copy['errorGeneric']) ?? 'default'
        setErrorMsg(t.errorGeneric[key] ?? t.errorGeneric.default)
        setStatus('error')
        return
      }
      setResult(data.dataUrl)
      setStatus('idle')
    } catch {
      setErrorMsg(t.errorGeneric.default)
      setStatus('error')
    }
  }

  const openModal = () => setOpen(true)

  return (
    <>
      {trigger ? (
        trigger({ onClick: openModal })
      ) : (
        <Button type="button" variant="outline" size="lg" className="gap-2" onClick={openModal}>
          <Sparkles className="size-4" />
          {t.cta}
        </Button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={close} aria-hidden="true" />
          <div className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="flex items-center gap-2 font-display text-base font-bold text-card-foreground">
                <Sparkles className="size-4 text-primary" />
                {t.title}
              </h2>
              <button
                type="button"
                onClick={close}
                className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={t.close}
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {result ? (
                <div className="flex flex-col gap-4">
                  <div className="overflow-hidden rounded-xl border border-border bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={result || '/placeholder.svg'} alt={productName} className="w-full object-cover" />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 gap-2" onClick={reset}>
                      <RotateCcw className="size-4" />
                      {t.tryAgain}
                    </Button>
                    <a href={result} download="try-on.png" className="flex-1">
                      <Button className="w-full gap-2">
                        <Download className="size-4" />
                        {t.download}
                      </Button>
                    </a>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <p className="text-sm leading-relaxed text-muted-foreground">{t.intro}</p>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0])}
                  />

                  {photo ? (
                    <div className="flex flex-col gap-3">
                      <div className="aspect-square overflow-hidden rounded-xl border border-border bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo || '/placeholder.svg'} alt="" className="size-full object-cover" />
                      </div>
                      <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                        {t.changePhoto}
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border px-6 py-10 text-center text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                    >
                      <Upload className="size-6" />
                      <span className="text-sm">{t.uploadHint}</span>
                    </button>
                  )}

                  {errorMsg && (
                    <p className="flex items-start gap-2 text-sm text-destructive">
                      <AlertCircle className="mt-0.5 size-4 shrink-0" />
                      {errorMsg}
                    </p>
                  )}

                  <Button size="lg" disabled={!photo || status === 'loading'} onClick={generate} className="gap-2">
                    <Sparkles className="size-4" />
                    {status === 'loading' ? t.generating : t.generate}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
