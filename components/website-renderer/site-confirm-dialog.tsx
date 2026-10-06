'use client'

import { AlertCircle } from 'lucide-react'

/**
 * A small, dependency-light confirmation dialog themed entirely from the
 * generated site's `--site-*` CSS variables, so it matches whichever store it
 * is mounted in (demo or published). Used for the "this product is already in
 * your cart — add another?" prompt. Renders nothing when `open` is false.
 */
export function SiteConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} aria-hidden="true" />
      <div
        className="relative w-full max-w-sm p-6 shadow-2xl"
        style={{
          borderRadius: 'var(--site-radius)',
          backgroundColor: 'var(--site-card)',
          color: 'var(--site-fg)',
          border: '1px solid var(--site-border)',
        }}
      >
        <div className="flex items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--site-primary) 14%, transparent)',
              color: 'var(--site-primary)',
            }}
          >
            <AlertCircle className="h-5 w-5" aria-hidden />
          </span>
          <div className="flex-1">
            <h2 className="text-base font-bold" style={{ fontFamily: 'var(--site-heading-font)' }}>
              {title}
            </h2>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--site-muted-fg)' }}>
              {description}
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-70"
            style={{
              borderRadius: 'var(--site-radius)',
              border: '1px solid var(--site-border)',
              color: 'var(--site-fg)',
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex items-center justify-center px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{
              borderRadius: 'var(--site-radius)',
              backgroundColor: 'var(--site-primary)',
              color: 'var(--site-primary-fg)',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
