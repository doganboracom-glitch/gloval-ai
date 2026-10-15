'use client'

import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { nextTrapIndex } from '@/lib/focus-trap'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Accessible replacement for `window.confirm`: an alertdialog that traps focus,
 * starts on the safe (cancel) action, closes on Escape without that key
 * reaching the editor behind it, and returns focus to whatever opened it.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const cancelHandler = useRef(onCancel)
  cancelHandler.current = onCancel
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        cancelHandler.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
      if (items.length === 0) return
      event.preventDefault()
      const next = nextTrapIndex(items.length, items.indexOf(document.activeElement as HTMLElement), event.shiftKey)
      items[next]?.focus()
    }
    // Capture phase on window: runs before the editor's own Escape handler.
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      opener?.focus?.()
    }
  }, [open])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"
      >
        <h2 id={titleId} className="text-base font-semibold text-foreground">
          {title}
        </h2>
        <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-secondary/40 px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`inline-flex h-9 items-center justify-center rounded-lg px-4 text-sm font-medium transition-opacity hover:opacity-90 ${
              destructive ? 'bg-destructive text-white' : 'bg-brand text-brand-foreground'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
