'use client'

import type { Section } from '@/lib/website-schema'
import { heroStripBoxes, resolveHeroStripIcon } from '@/lib/hero-strip'
import { DynamicIcon } from '@/components/website-renderer/icon'

type HeroStripData = Extract<Section, { type: 'heroStrip' }>

/**
 * Column counts per box count: stacked rows on mobile, 2x2 on tablet and a
 * single row on desktop. Three boxes skip the two-column step so no cell is
 * left orphaned.
 */
const COLUMNS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
}

/**
 * Strip of short feature boxes attached to the bottom of the hero or slider.
 * The hairlines are the grid's own 1px gap showing the border colour, so the
 * vertical dividers (desktop) and horizontal dividers (mobile) can never get
 * out of step with the column count. Boxes are static: no link, no hover.
 * Sample boxes are stripped from public pages upstream, so a site without a
 * real box renders nothing there; the editor preview still shows placeholders.
 */
export function HeroStripSection({ data }: { data: HeroStripData }) {
  const boxes = heroStripBoxes(data.items, { includeSamples: true })
  if (boxes.length === 0) return null

  return (
    <section
      id="hero-strip"
      className="scroll-mt-20 border-y"
      style={{ borderColor: 'var(--site-border)', backgroundColor: 'var(--site-border)' }}
      data-hero-strip
    >
      <ul className={`mx-auto grid w-full max-w-6xl gap-px ${COLUMNS[Math.min(boxes.length, 4)]}`}>
        {boxes.map((item, i) => (
          <li
            key={`${item.title}-${i}`}
            className="flex items-center gap-3 px-6 py-5"
            style={{ backgroundColor: 'var(--site-card)' }}
          >
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center" style={{ color: 'var(--site-accent)' }}>
              <DynamicIcon name={resolveHeroStripIcon(item.icon)} className="h-7 w-7" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              {item.title.trim() !== '' && (
                <p
                  className="text-pretty text-sm font-bold leading-snug"
                  style={{ fontFamily: 'var(--site-heading-font)', color: 'var(--site-fg)' }}
                >
                  {item.title}
                </p>
              )}
              {item.text.trim() !== '' && (
                <p className="mt-0.5 text-pretty text-xs leading-relaxed" style={{ color: 'var(--site-muted-fg)' }}>
                  {item.text}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
