'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, Download, Loader2, RotateCcw, Sparkles, Upload, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TRY_ON_COPY, tryOnErrorMessage } from '@/lib/try-on-copy'
import { PhotoTooLargeError, compressPhotoFile } from '@/lib/try-on-photo'

const MAX_FILE_BYTES = 12 * 1024 * 1024

// Above every fixed element a storefront or demo site can render (cart button,
// sticky mobile buy bar, lightbox, drawers). The dialog is portalled to <body>
// into its own `isolate` stacking context, so nothing inside the page's
// transformed/overflow-clipped wrappers can paint over it.
const DIALOG_Z_INDEX = 2147483000

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]):not([type="file"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]):not([disabled])'

export type TryOnTarget = { mode: 'store'; storeSlug: string } | { mode: 'demo'; demoSlug: string }

function useBodyScrollLock() {
  useEffect(() => {
    const { body, documentElement } = document
    const previousOverflow = body.style.overflow
    const previousPaddingRight = body.style.paddingRight
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth
    body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`
    return () => {
      body.style.overflow = previousOverflow
      body.style.paddingRight = previousPaddingRight
    }
  }, [])
}

export function TryOnDialog({
  productImage,
  productName,
  lang,
  target,
  onClose,
}: {
  productImage: string
  productName: string
  lang: 'tr' | 'en'
  target: TryOnTarget
  onClose: () => void
}) {
  const t = TRY_ON_COPY[lang]
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const [photo, setPhoto] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useBodyScrollLock()

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (!dialogRef.current.contains(active)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      abortRef.current?.abort()
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [])

  function reset() {
    setPhoto(null)
    setResult(null)
    setStatus('idle')
    setErrorMsg(null)
  }

  async function handleFile(file: File | undefined) {
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
    try {
      setPhoto(await compressPhotoFile(file))
    } catch (error) {
      setErrorMsg(error instanceof PhotoTooLargeError ? t.errorTooLarge : t.errorType)
    }
  }

  async function generate() {
    if (!photo || status === 'loading') return
    const controller = new AbortController()
    abortRef.current = controller
    setStatus('loading')
    setErrorMsg(null)
    try {
      const res = await fetch('/api/try-on', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
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
      if (controller.signal.aborted) return
      if (!res.ok || !data.ok || !data.dataUrl) {
        setErrorMsg(tryOnErrorMessage(t, res.status, data.error))
        setStatus('idle')
        return
      }
      setResult(data.dataUrl)
      setStatus('idle')
    } catch {
      if (controller.signal.aborted) return
      setErrorMsg(t.errorGeneric.default)
      setStatus('idle')
    }
  }

  const loading = status === 'loading'

  return createPortal(
    <div
      className="fixed inset-0 isolate flex items-center justify-center p-4"
      style={{ zIndex: DIALOG_Z_INDEX }}
    >
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h2 id={titleId} className="flex items-center gap-2 font-display text-base font-bold">
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            {t.title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={t.close}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-muted-foreground">{t.intro}</p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                void handleFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />

            <div className="relative aspect-square w-full shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
              {result ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={result} alt={productName} className="size-full object-contain" />
              ) : photo ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo} alt="" className="size-full object-cover" />
                  {loading ? (
                    <div
                      role="status"
                      className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 text-sm font-medium text-foreground backdrop-blur-[2px]"
                    >
                      <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
                      {t.generating}
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="absolute bottom-3 left-1/2 -translate-x-1/2 shadow-md"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {t.changePhoto}
                    </Button>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex size-full flex-col items-center justify-center gap-2 border-2 border-dashed border-border px-6 text-center text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                >
                  <Upload className="size-6" aria-hidden="true" />
                  <span className="text-sm">{t.uploadHint}</span>
                </button>
              )}
            </div>

            <p
              aria-live="polite"
              className="flex min-h-10 items-start gap-2 text-sm leading-snug text-destructive"
            >
              {errorMsg ? (
                <>
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {errorMsg}
                </>
              ) : null}
            </p>
          </div>
        </div>

        <div className="shrink-0 border-t border-border px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
          {result ? (
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" className="h-11 gap-2" onClick={reset}>
                <RotateCcw className="size-4" aria-hidden="true" />
                {t.tryAgain}
              </Button>
              <a
                href={result}
                download="try-on.png"
                className={cn(buttonVariants({ variant: 'default' }), 'h-11 gap-2')}
              >
                <Download className="size-4" aria-hidden="true" />
                {t.download}
              </a>
            </div>
          ) : (
            <Button
              type="button"
              disabled={!photo || loading}
              onClick={generate}
              className="h-11 w-full gap-2"
            >
              <Sparkles className="size-4" aria-hidden="true" />
              {loading ? t.generating : t.generate}
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
