'use client'

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, Sparkles } from 'lucide-react'

export const ADD_ONS_ANCHOR = 'ek-paketler'

/** Query params that mean the visitor is heading for an add-on purchase. */
const ADD_ON_INTENT_PARAMS = ['addon', 'publish'] as const

/**
 * Whether the section must start open: a `#ek-paketler` anchor, or a link
 * that targets an add-on (`?addon=…`, `?publish=…`).
 */
export function wantsAddOnsOpen(hash: string, search: string): boolean {
  if (hash.replace(/^#/, '') === ADD_ONS_ANCHOR) return true
  const params = new URLSearchParams(search)
  return ADD_ON_INTENT_PARAMS.some((key) => params.has(key))
}

export function CollapsibleAddOnsSection({
  title,
  summary,
  forceOpen = false,
  children,
}: {
  title: string
  /** Real card count, e.g. "4 paket". */
  summary: string
  /** Server-known intent (e.g. the publish banner is showing). */
  forceOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(forceOpen)
  const sectionRef = useRef<HTMLElement>(null)
  const panelId = useId()
  const headingId = useId()

  const revealFromUrl = useCallback(() => {
    const { hash, search } = window.location
    if (!wantsAddOnsOpen(hash, search)) return
    setOpen(true)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.requestAnimationFrame(() => {
      sectionRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    })
  }, [])

  useEffect(() => {
    revealFromUrl()
    window.addEventListener('hashchange', revealFromUrl)
    return () => window.removeEventListener('hashchange', revealFromUrl)
  }, [revealFromUrl])

  return (
    <section
      id={ADD_ONS_ANCHOR}
      ref={sectionRef}
      aria-labelledby={headingId}
      className="mt-10 scroll-mt-6"
    >
      <h2 id={headingId} className="font-display text-lg font-semibold">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 rounded-xl border border-border bg-card/70 px-4 py-3 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Sparkles className="size-5 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1 text-balance">{title}</span>
          <span className="shrink-0 text-sm font-normal text-muted-foreground">{summary}</span>
          <ChevronDown
            aria-hidden
            className={`size-5 shrink-0 text-muted-foreground transition-transform duration-300 motion-reduce:transition-none ${
              open ? 'rotate-180' : ''
            }`}
          />
        </button>
      </h2>

      {/* `inert` takes the closed cards out of the tab order and the
          accessibility tree while they stay mounted for the animation. */}
      <div
        id={panelId}
        inert={!open}
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="pt-4">{children}</div>
        </div>
      </div>
    </section>
  )
}
