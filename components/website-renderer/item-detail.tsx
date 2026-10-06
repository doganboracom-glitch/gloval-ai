'use client'

import { useEffect, useRef } from 'react'
import { SiteImage } from '@/components/website-renderer/primitives'

export type ItemDetail = {
  title: string
  eyebrow?: string
  description?: string
  imagePrompt?: string
  src?: string
  alt?: string
  aspectRatio?: string
  seed?: number
}

const CLOSE_LABEL: Record<string, string> = {
  tr: 'Kapat',
  en: 'Close',
  de: 'Schließen',
  ru: 'Закрыть',
  ar: 'إغلاق',
  az: 'Bağla',
}

/**
 * Detail view for a card (project, service, team member). Rendered inside the
 * site root so the scoped `--site-*` theme variables apply, and shared by the
 * editor preview and the published site because it needs no router.
 */
export function ItemDetailDialog({
  detail,
  onClose,
  lang,
  backLabel,
}: {
  detail: ItemDetail | null
  onClose: () => void
  lang?: string
  backLabel?: string
}) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!detail) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const doc = closeRef.current?.ownerDocument ?? document
    doc.addEventListener('keydown', onKey)
    return () => doc.removeEventListener('keydown', onKey)
  }, [detail, onClose])

  if (!detail) return null
  const closeText = backLabel ?? CLOSE_LABEL[lang ?? 'tr'] ?? CLOSE_LABEL.en

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={detail.title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto"
        style={{
          backgroundColor: 'var(--site-bg)',
          color: 'var(--site-fg)',
          border: '1px solid var(--site-border)',
          borderRadius: 'var(--site-radius)',
          fontFamily: 'var(--site-body-font)',
        }}
      >
        {detail.imagePrompt || detail.src ? (
          <SiteImage
            image={{
              imagePrompt: detail.imagePrompt ?? detail.title,
              src: detail.src,
              alt: detail.alt || detail.title,
              aspectRatio: detail.aspectRatio ?? '16/9',
            }}
            seed={detail.seed ?? 1}
            className="w-full"
          />
        ) : null}
        <div className="p-6 sm:p-8">
          {detail.eyebrow ? (
            <span
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--site-primary)' }}
            >
              {detail.eyebrow}
            </span>
          ) : null}
          <h3
            className="mt-1 text-pretty text-2xl font-bold"
            style={{ fontFamily: 'var(--site-heading-font)' }}
          >
            {detail.title}
          </h3>
          {detail.description ? (
            <p
              className="mt-4 whitespace-pre-line text-pretty leading-relaxed"
              style={{ color: 'var(--site-muted-fg)' }}
            >
              {detail.description}
            </p>
          ) : null}
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="mt-6 inline-flex items-center justify-center px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              borderRadius: 'var(--site-radius)',
              backgroundColor: 'var(--site-primary)',
              color: 'var(--site-primary-fg)',
              outlineColor: 'var(--site-primary)',
            }}
          >
            {closeText}
          </button>
        </div>
      </div>
    </div>
  )
}
