'use client'

import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Loader2 } from 'lucide-react'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Confirmation modal for irreversible order actions. Focus starts on the safe
 * "cancel" button, Tab is trapped inside, Esc and backdrop dismiss, and while a
 * request is in flight every control and dismissal path is disabled.
 */
export function OrderActionConfirmDialog({
  title,
  description,
  cancelLabel,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onDismiss,
}: {
  title: string
  description: string
  cancelLabel: string
  confirmLabel: string
  busy: boolean
  error: string | null
  onConfirm: () => void
  onDismiss: () => void
}) {
  const titleId = useId()
  const descId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const busyRef = useRef(busy)
  busyRef.current = busy

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    return () => previous?.focus?.()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (!busyRef.current) onDismiss()
        return
      }
      if (e.key !== 'Tab') return
      const items = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (!items || items.length === 0) {
        e.preventDefault()
        panelRef.current?.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || !panelRef.current?.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !panelRef.current?.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onDismiss])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (!busy && e.target === e.currentTarget) onDismiss()
      }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        aria-busy={busy}
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl outline-none"
      >
        <h2 id={titleId} className="text-balance text-base font-semibold">
          {title}
        </h2>
        <p id={descId} className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
        {error && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            onClick={onDismiss}
            className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-destructive px-3 text-sm font-medium text-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
