'use client'

import { Quote } from 'lucide-react'
import type { Section } from '@/lib/website-schema'
import {
  SectionShell,
  SectionHeading,
} from '@/components/website-renderer/primitives'

type TestimonialsData = Extract<Section, { type: 'testimonials' }>

export function TestimonialsSection({ data }: { data: TestimonialsData }) {
  return (
    <SectionShell id="testimonials">
      <SectionHeading title={data.title} />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.items.map((item, i) => (
          <figure
            key={i}
            className="flex flex-col p-5"
            style={{
              backgroundColor: 'var(--site-card)',
              border: '1px solid var(--site-border)',
              borderRadius: 'var(--site-radius)',
            }}
          >
            <Quote
              className="h-5 w-5"
              style={{ color: 'var(--site-primary)' }}
            />
            <blockquote
              className="mt-3 flex-1 text-sm leading-relaxed"
              style={{ color: 'var(--site-fg)' }}
            >
              {item.quote}
            </blockquote>
            <figcaption className="mt-4 text-sm">
              <span
                className="font-semibold"
                style={{ color: 'var(--site-fg)' }}
              >
                {item.author}
              </span>
              {item.role ? (
                <span style={{ color: 'var(--site-muted-fg)' }}>
                  {' · '}
                  {item.role}
                </span>
              ) : null}
            </figcaption>
          </figure>
        ))}
      </div>
    </SectionShell>
  )
}
