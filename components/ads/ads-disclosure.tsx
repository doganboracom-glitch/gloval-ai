'use client'

import { useCallback, useEffect, useId, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const STORAGE_PREFIX = 'gloval:ads:disclosure:'
export const ADS_DISCLOSURE_OPEN_EVENT = 'gloval:ads:disclosure-open'

/** Opens a disclosure by its `id` (e.g. from a "review ad copy" shortcut) and scrolls it into view. */
export function openAdsDisclosure(id: string) {
  window.dispatchEvent(new CustomEvent(ADS_DISCLOSURE_OPEN_EVENT, { detail: id }))
  window.requestAnimationFrame(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

function readStored(id: string): boolean | null {
  try {
    const value = window.localStorage.getItem(`${STORAGE_PREFIX}${id}`)
    return value === '1' ? true : value === '0' ? false : null
  } catch {
    return null
  }
}

function writeStored(id: string, open: boolean) {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${id}`, open ? '1' : '0')
  } catch {
    // Storage can be unavailable (private mode); the panel still works for this session.
  }
}

/**
 * Collapsible panel for secondary Ads content. Children stay mounted while
 * collapsed so unsaved form input survives a toggle; the open state is
 * remembered per `id` on this device.
 */
export function AdsDisclosure({
  id,
  title,
  summary,
  defaultOpen = false,
  headingLevel = 3,
  className,
  children,
}: {
  id: string
  title: ReactNode
  summary?: ReactNode
  defaultOpen?: boolean
  headingLevel?: 2 | 3 | 4
  className?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = `${useId()}-panel`
  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4'

  useEffect(() => {
    const stored = readStored(id)
    if (stored !== null) setOpen(stored)
  }, [id])

  useEffect(() => {
    function onOpen(event: Event) {
      if ((event as CustomEvent<string>).detail !== id) return
      setOpen(true)
      writeStored(id, true)
    }
    window.addEventListener(ADS_DISCLOSURE_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(ADS_DISCLOSURE_OPEN_EVENT, onOpen)
  }, [id])

  const toggle = useCallback(() => {
    setOpen((current) => {
      writeStored(id, !current)
      return !current
    })
  }, [id])

  return (
    <section id={id} className={cn('flex scroll-mt-24 flex-col rounded-xl border border-border bg-card', className)}>
      <Heading className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
          className="flex w-full items-center justify-between gap-3 rounded-xl p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="font-semibold">{title}</span>
            {summary ? <span className="text-sm font-normal leading-relaxed text-muted-foreground">{summary}</span> : null}
          </span>
          <ChevronDown aria-hidden="true" className={cn('size-5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </button>
      </Heading>
      <div id={panelId} hidden={!open} className="flex flex-col gap-4 border-t border-border p-4">
        {children}
      </div>
    </section>
  )
}
