'use client'

import { Check } from 'lucide-react'
import type { Section } from '@/lib/website-schema'
import {
  SectionShell,
  SectionHeading,
} from '@/components/website-renderer/primitives'

type AboutData = Extract<Section, { type: 'about' }>

export function AboutSection({ data }: { data: AboutData }) {
  return (
    <SectionShell id="about">
      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <SectionHeading title={data.title} center={false} />
          <p
            className="mt-4 text-pretty text-sm leading-relaxed sm:text-base"
            style={{ color: 'var(--site-muted-fg)' }}
          >
            {data.body}
          </p>
        </div>

        {data.highlights && data.highlights.length > 0 && (
          <ul className="grid content-start gap-3">
            {data.highlights.map((h) => (
              <li
                key={h}
                className="flex items-start gap-3 p-3 text-sm"
                style={{
                  backgroundColor: 'var(--site-card)',
                  border: '1px solid var(--site-border)',
                  borderRadius: 'var(--site-radius)',
                  color: 'var(--site-fg)',
                }}
              >
                <Check
                  className="mt-0.5 h-4 w-4 shrink-0"
                  style={{ color: 'var(--site-primary)' }}
                />
                <span>{h}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionShell>
  )
}
