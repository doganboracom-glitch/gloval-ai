'use client'

import type { Section } from '@/lib/website-schema'
import {
  SectionShell,
  SectionHeading,
} from '@/components/website-renderer/primitives'

type FaqData = Extract<Section, { type: 'faq' }>

export function FaqSection({ data }: { data: FaqData }) {
  return (
    <SectionShell id="faq">
      <SectionHeading title={data.title} />
      <div className="mx-auto mt-10 max-w-2xl divide-y" style={{ borderColor: 'var(--site-border)' }}>
        {data.items.map((item, i) => (
          <details key={i} className="group py-4" open={i === 0}>
            <summary
              className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold"
              style={{
                fontFamily: 'var(--site-heading-font)',
                color: 'var(--site-fg)',
              }}
            >
              {item.question}
              <span
                className="transition-transform group-open:rotate-45"
                style={{ color: 'var(--site-primary)' }}
                aria-hidden="true"
              >
                +
              </span>
            </summary>
            <p
              className="mt-2 text-sm leading-relaxed"
              style={{ color: 'var(--site-muted-fg)' }}
            >
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </SectionShell>
  )
}
