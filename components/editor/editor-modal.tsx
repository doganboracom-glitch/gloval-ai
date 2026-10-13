'use client'

import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/**
 * Minimal accessible modal for editor workflows that need more room than the
 * 380px side panel. Rendered in a portal so the panel's overflow and its
 * AI-lock overlay never clip or disable it.
 *
 * `dismissible=false` disables Escape and backdrop clicks, used while there are
 * unsaved edits so a stray click can't throw them away.
 */
export function EditorModal({
  title,
  description,
  onClose,
  dismissible = true,
  footer,
  children,
}: {
  title: string
  description?: string
  onClose: () => void
  dismissible?: boolean
  footer?: React.ReactNode
  children: React.ReactNode
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => previous?.focus?.()
  }, [])

  useEffect(() => {
    if (!dismissible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dismissible, onClose])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-background/80 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-card text-card-foreground shadow-2xl outline-none sm:max-w-2xl sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-balance text-base font-semibold">
              {title}
            </h2>
            {description ? (
              <p className="mt-0.5 text-pretty text-xs leading-snug text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!dismissible}
            aria-label="Kapat"
            title={dismissible ? 'Kapat' : 'Önce kaydedin veya vazgeçin'}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">{children}</div>
        {footer ? <footer className="border-t border-border px-4 py-3">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  )
}
