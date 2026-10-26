'use client'

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react'
import { ChevronDown, Sparkles } from 'lucide-react'

export const ADD_ONS_ANCHOR = 'ek-paketler'
export const PLANS_ANCHOR = 'paketler'
export const HISTORY_ANCHOR = 'odeme-gecmisi'

/** Query params that mean the visitor is heading for an add-on purchase. */
const ADD_ON_INTENT_PARAMS = ['addon', 'publish'] as const

/** Query params that mean the visitor arrives from a plan / upgrade flow. */
const PLAN_INTENT_PARAMS = ['plan', 'upgrade', 'publish'] as const

type UrlPredicate = (hash: string, search: string) => boolean

function bareHash(hash: string): string {
  return hash.replace(/^#/, '')
}

function hasAnyParam(search: string, keys: readonly string[]): boolean {
  const params = new URLSearchParams(search)
  return keys.some((key) => params.has(key))
}

/**
 * Whether the add-ons section must start open: a `#ek-paketler` anchor, or a
 * link that targets an add-on (`?addon=…`, `?publish=…`).
 */
export function wantsAddOnsOpen(hash: string, search: string): boolean {
  if (bareHash(hash) === ADD_ONS_ANCHOR) return true
  return hasAnyParam(search, ADD_ON_INTENT_PARAMS)
}

/**
 * Whether the plans section must start open: `#paketler`, a `#plan-<code>`
 * deep link, or a plan / upgrade / publish flow (`?plan=…`, `?upgrade=…`,
 * `?publish=…`).
 */
export function wantsPlansOpen(hash: string, search: string): boolean {
  const anchor = bareHash(hash)
  if (anchor === PLANS_ANCHOR || anchor.startsWith('plan-')) return true
  return hasAnyParam(search, PLAN_INTENT_PARAMS)
}

/** Only the plans anchors scroll; flow params just open the section. */
export function wantsPlansScroll(hash: string): boolean {
  const anchor = bareHash(hash)
  return anchor === PLANS_ANCHOR || anchor.startsWith('plan-')
}

/** Whether the payment-history section must start open. */
export function wantsHistoryOpen(hash: string, _search: string): boolean {
  return bareHash(hash) === HISTORY_ANCHOR
}

export function CollapsibleSection({
  id,
  title,
  summary,
  icon: Icon = Sparkles,
  forceOpen = false,
  opensOn,
  scrollsOn,
  className = 'mt-10',
  children,
}: {
  /** Anchor id of the section element. */
  id: string
  title: string
  /** Short text next to the title, e.g. the real card or record count. */
  summary?: string
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  /** Server-known default / intent: the section renders open on first paint. */
  forceOpen?: boolean
  /** URL rule that opens the section (hash + search). */
  opensOn: UrlPredicate
  /** Subset of `opensOn` that also scrolls the section into view. */
  scrollsOn?: UrlPredicate
  className?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(forceOpen)
  const sectionRef = useRef<HTMLElement>(null)
  const panelId = useId()
  const headingId = useId()

  const revealFromUrl = useCallback(() => {
    const { hash, search } = window.location
    if (!opensOn(hash, search)) return
    setOpen(true)
    if (scrollsOn && !scrollsOn(hash, search)) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.requestAnimationFrame(() => {
      sectionRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    })
  }, [opensOn, scrollsOn])

  useEffect(() => {
    revealFromUrl()
    window.addEventListener('hashchange', revealFromUrl)
    return () => window.removeEventListener('hashchange', revealFromUrl)
  }, [revealFromUrl])

  return (
    <section
      id={id}
      ref={sectionRef}
      aria-labelledby={headingId}
      className={`${className} scroll-mt-6`}
    >
      <h2 id={headingId} className="font-display text-lg font-semibold">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 rounded-xl border border-border bg-card/70 px-4 py-3 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon className="size-5 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1 text-balance">{title}</span>
          {summary ? (
            <span className="shrink-0 text-sm font-normal text-muted-foreground">{summary}</span>
          ) : null}
          <ChevronDown
            aria-hidden
            className={`size-5 shrink-0 text-muted-foreground transition-transform duration-300 motion-reduce:transition-none ${
              open ? 'rotate-180' : ''
            }`}
          />
        </button>
      </h2>

      {/* `inert` takes the closed content out of the tab order and the
          accessibility tree while it stays mounted for the animation. */}
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
  return (
    <CollapsibleSection
      id={ADD_ONS_ANCHOR}
      title={title}
      summary={summary}
      forceOpen={forceOpen}
      opensOn={wantsAddOnsOpen}
    >
      {children}
    </CollapsibleSection>
  )
}
