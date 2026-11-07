'use client'

import { useCallback, useEffect, useRef, useState, type KeyboardEventHandler, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type AdsScrollRowProps = {
  children: ReactNode
  role?: string
  'aria-label'?: string
  'aria-orientation'?: 'horizontal' | 'vertical'
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>
  /** Changes whenever the selected item changes so it can be scrolled into view. */
  activeKey?: string
  className?: string
}

const SELECTED_SELECTOR = '[aria-selected="true"], [aria-current="true"], [aria-pressed="true"]'

/**
 * Horizontal row that scrolls sideways only. The scrollbar is hidden, the cross
 * axis is clipped (no stray vertical scrollbar) and edge fades with a chevron
 * hint appear while more items exist beyond the visible area.
 */
export function AdsScrollRow({
  children,
  role,
  'aria-label': ariaLabel,
  'aria-orientation': ariaOrientation,
  onKeyDown,
  activeKey,
  className,
}: AdsScrollRowProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: false, end: false })

  const measure = useCallback(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const maxScroll = scroller.scrollWidth - scroller.clientWidth
    const start = scroller.scrollLeft > 1
    const end = maxScroll - scroller.scrollLeft > 1
    setEdges((previous) => (previous.start === start && previous.end === end ? previous : { start, end }))
  }, [])

  useEffect(() => {
    measure()
    const scroller = scrollerRef.current
    if (!scroller || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(scroller)
    return () => observer.disconnect()
  }, [measure, children])

  useEffect(() => {
    const scroller = scrollerRef.current
    const selected = scroller?.querySelector<HTMLElement>(SELECTED_SELECTOR)
    if (!scroller || !selected) return
    const padding = 24
    const left = selected.offsetLeft - padding
    const right = selected.offsetLeft + selected.offsetWidth + padding
    if (left < scroller.scrollLeft) scroller.scrollLeft = Math.max(0, left)
    else if (right > scroller.scrollLeft + scroller.clientWidth) scroller.scrollLeft = right - scroller.clientWidth
    measure()
  }, [activeKey, measure])

  return (
    <div className={cn('relative', className)}>
      <div
        ref={scrollerRef}
        role={role}
        aria-label={ariaLabel}
        aria-orientation={ariaOrientation}
        onKeyDown={onKeyDown}
        onScroll={measure}
        data-testid="ads-scroll-row"
        className="relative flex gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      <span
        aria-hidden="true"
        data-edge="start"
        data-visible={edges.start}
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-start bg-gradient-to-r from-background via-background/80 to-transparent pl-0.5 text-muted-foreground transition-opacity',
          edges.start ? 'opacity-100' : 'opacity-0',
        )}
      >
        <ChevronLeft className="size-4" />
      </span>
      <span
        aria-hidden="true"
        data-edge="end"
        data-visible={edges.end}
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 flex w-10 items-center justify-end bg-gradient-to-l from-background via-background/80 to-transparent pr-0.5 text-muted-foreground transition-opacity',
          edges.end ? 'opacity-100' : 'opacity-0',
        )}
      >
        <ChevronRight className="size-4" />
      </span>
    </div>
  )
}
