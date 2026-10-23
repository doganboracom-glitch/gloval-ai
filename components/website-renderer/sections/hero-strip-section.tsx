'use client'

import type { Section } from '@/lib/website-schema'
import { heroStripBoxes } from '@/lib/hero-strip'
import { DynamicIcon } from '@/components/website-renderer/icon'

type HeroStripData = Extract<Section, { type: 'heroStrip' }>

const COLUMNS: Record<number, string> = {
  1: 'mx-auto max-w-md grid-cols-1',
  2: 'sm:grid-cols-2 lg:mx-auto lg:max-w-3xl',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
}

/**
 * Row of short feature boxes right under the hero or slider. Sample boxes are
 * stripped from public pages upstream, so a site without a real box renders
 * nothing there; the editor preview still shows the placeholders.
 */
export function HeroStripSection({ data }: { data: HeroStripData }) {
  const boxes = heroStripBoxes(data.items, { includeSamples: true })
  if (boxes.length === 0) return null

  return (
    <section id="hero-strip" className="scroll-mt-20 px-6 py-8 sm:py-10" data-hero-strip>
      <ul className={`mx-auto grid w-full max-w-6xl gap-4 ${COLUMNS[Math.min(boxes.length, 4)]}`}>
        {boxes.map((item, i) => (
          <li
            key={`${item.title}-${i}`}
            className="flex items-start gap-3 border p-4"
            style={{
              backgroundColor: 'var(--site-card)',
              borderColor: 'var(--site-border)',
              borderRadius: 'var(--site-radius)',
            }}
          >
            <span
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--site-accent) 18%, transparent)',
                color: 'var(--site-accent)',
                borderRadius: 'var(--site-radius)',
              }}
            >
              <DynamicIcon name={item.icon} className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              {item.title.trim() !== '' && (
                <h3
                  className="text-pretty text-sm font-semibold leading-snug"
                  style={{ fontFamily: 'var(--site-heading-font)', color: 'var(--site-fg)' }}
                >
                  {item.title}
                </h3>
              )}
              {item.text.trim() !== '' && (
                <p className="mt-0.5 text-pretty text-sm leading-relaxed" style={{ color: 'var(--site-muted-fg)' }}>
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
