'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, X } from 'lucide-react'
import {
  autoplayEmbedUrl,
  lightboxCounter,
  lightboxLabels,
  stepIndex,
  swipeDirection,
  type LightboxItem,
  type LightboxLang,
} from '@/lib/lightbox-nav'

const FOCUSABLE = 'button:not([disabled]), [href], iframe, [tabindex]:not([tabindex="-1"])'

type LightboxProps = {
  items: LightboxItem[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
  lang?: LightboxLang
}

/**
 * Modal viewer for photos and videos. Esc / backdrop click close it, arrow keys and swipes move through the
 * items, Tab stays inside, and focus returns to whatever opened it. A video iframe only exists while its item
 * is on screen, so nothing third-party loads before the visitor opens it.
 */
export function Lightbox({ items, index, onIndexChange, onClose, lang = 'tr' }: LightboxProps) {
  const labels = lightboxLabels(lang)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const count = items.length
  const item = items[index]

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const doc = dialog.ownerDocument
    const sync = () => setFullscreen(doc.fullscreenElement === dialog)
    doc.addEventListener('fullscreenchange', sync)
    return () => {
      doc.removeEventListener('fullscreenchange', sync)
      if (doc.fullscreenElement === dialog) void doc.exitFullscreen?.()
    }
  }, [])

  const step = useCallback(
    (direction: -1 | 1) => onIndexChange(stepIndex(index, count, direction)),
    [index, count, onIndexChange],
  )

  const toggleFullscreen = useCallback(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (dialog.ownerDocument.fullscreenElement) void dialog.ownerDocument.exitFullscreen?.()
    else void dialog.requestFullscreen?.()
  }, [])

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    } else if (e.key === 'ArrowLeft' && count > 1) {
      e.preventDefault()
      step(-1)
    } else if (e.key === 'ArrowRight' && count > 1) {
      e.preventDefault()
      step(1)
    } else if (e.key === 'Tab') {
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = dialogRef.current?.ownerDocument.activeElement
      if (e.shiftKey && (active === first || !dialogRef.current?.contains(active as Node))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !dialogRef.current?.contains(active as Node))) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  if (!item) return null

  const navButton =
    'absolute top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'
  const navStyle = { backgroundColor: 'rgba(0,0,0,0.55)', color: '#fff', outlineColor: '#fff' }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={labels.dialog}
      data-gv-lightbox
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[100] flex flex-col"
      style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ color: '#fff' }}>
        <span className="text-sm tabular-nums" aria-live="polite" data-gv-lightbox-counter>
          {lightboxCounter(index, count)}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={fullscreen ? labels.exitFullscreen : labels.fullscreen}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ backgroundColor: 'rgba(255,255,255,0.12)', outlineColor: '#fff' }}
          >
            {fullscreen ? <Minimize2 className="h-5 w-5" aria-hidden="true" /> : <Maximize2 className="h-5 w-5" aria-hidden="true" />}
          </button>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={labels.close}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ backgroundColor: 'rgba(255,255,255,0.12)', outlineColor: '#fff' }}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4 sm:px-16"
        data-gv-lightbox-stage
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
        onTouchStart={(e) => {
          const t = e.touches[0]
          touchStart.current = t ? { x: t.clientX, y: t.clientY } : null
        }}
        onTouchEnd={(e) => {
          const start = touchStart.current
          const t = e.changedTouches[0]
          touchStart.current = null
          if (!start || !t || count < 2) return
          const dir = swipeDirection(t.clientX - start.x, t.clientY - start.y)
          if (dir) step(dir)
        }}
      >
        {count > 1 ? (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label={labels.prev}
              className={`${navButton} left-2 sm:left-4`}
              style={navStyle}
            >
              <ChevronLeft className="h-6 w-6" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label={labels.next}
              className={`${navButton} right-2 sm:right-4`}
              style={navStyle}
            >
              <ChevronRight className="h-6 w-6" aria-hidden="true" />
            </button>
          </>
        ) : null}

        {item.kind === 'image' ? (
          <figure className="flex max-h-full max-w-full flex-col items-center gap-3" style={{ color: '#fff' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={item.src}
              src={item.src}
              alt={item.alt}
              className="max-h-[calc(100vh-10rem)] max-w-full object-contain"
            />
            {item.caption ? <figcaption className="max-w-2xl text-center text-sm">{item.caption}</figcaption> : null}
          </figure>
        ) : (
          <div className="aspect-video w-full max-w-4xl">
            <iframe
              key={item.embedUrl}
              src={autoplayEmbedUrl(item.embedUrl)}
              title={item.title}
              className="h-full w-full"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        )}
      </div>
    </div>
  )
}
