'use client'

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/** Keeps Tab inside `container` so keyboard users cannot wander behind a modal. */
export function trapTab(event: KeyboardEvent, container: HTMLElement | null) {
  if (event.key !== 'Tab' || !container) return
  const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.closest('[hidden]'),
  )
  if (items.length === 0) return
  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement
  if (event.shiftKey && (active === first || !container.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

export const inputClass =
  'h-10 w-full rounded-md border border-input bg-background/60 px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30 aria-[invalid=true]:border-destructive aria-[invalid=true]:focus:ring-destructive/30 disabled:cursor-not-allowed disabled:opacity-60'

export function Field({
  id,
  label,
  required,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  required?: boolean
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label htmlFor={id} className="font-medium">
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-destructive">
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

/** Attributes that tie a control to its hint and error text. */
export function controlProps(id: string, error: string | undefined, hasHint: boolean) {
  return {
    id,
    'aria-invalid': error ? (true as const) : undefined,
    'aria-describedby': error ? `${id}-error` : hasHint ? `${id}-hint` : undefined,
  }
}

/** A collapsible group of fields whose header says, at a glance, what is inside and whether it needs attention. */
export function FormSection({
  title,
  summary,
  done,
  errorCount,
  open,
  onToggle,
  children,
}: {
  title: string
  summary: string
  done: boolean
  errorCount: number
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const panelId = useId()
  return (
    <section className={`rounded-xl border ${errorCount > 0 ? 'border-destructive/60' : 'border-border'}`}>
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <ChevronDown aria-hidden className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? '' : '-rotate-90'}`} />
          <span className="font-medium">{title}</span>
          <span className="ml-auto flex min-w-0 items-center gap-1.5 text-xs">
            {errorCount > 0 ? (
              <span className="shrink-0 rounded-full bg-destructive/15 px-2 py-0.5 font-medium text-destructive">
                {errorCount} hata
              </span>
            ) : (
              <>
                {done && <Check aria-label="Tamamlandı" className="size-3.5 shrink-0 text-accent" />}
                <span className="truncate text-muted-foreground">{summary}</span>
              </>
            )}
          </span>
        </button>
      </h3>
      <div id={panelId} hidden={!open} className="flex flex-col gap-4 border-t border-border p-3">
        {children}
      </div>
    </section>
  )
}

/** Small centered modal used for "leave without saving?" and "archive or delete?". */
export function ConfirmDialog({
  title,
  description,
  onDismiss,
  children,
}: {
  title: string
  description: ReactNode
  onDismiss: () => void
  children: ReactNode
}) {
  const titleId = useId()
  const descId = useId()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
  }, [])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Escape') onDismiss()
        trapTab(event, ref.current)
      }}
    >
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl"
      >
        <h2 id={titleId} className="font-display text-lg font-bold">
          {title}
        </h2>
        <div id={descId} className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {description}
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{children}</div>
      </div>
    </div>
  )
}
