'use client'

import type { Section } from '@/lib/website-schema'
import { SectionShell, SectionHeading } from '@/components/website-renderer/primitives'
import { DynamicIcon } from '@/components/website-renderer/icon'

type ProcessData = Extract<Section, { type: 'process' }>

export function ProcessSection({ data }: { data: ProcessData }) {
  return (
    <SectionShell id="process" tinted>
      <SectionHeading title={data.title} subtitle={data.subtitle} />
      <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {data.steps.map((step, i) => (
          <li key={i} className="relative flex flex-col">
            <div className="flex items-center gap-3">
              <span
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-sm font-bold"
                style={{
                  backgroundColor: 'var(--site-primary)',
                  color: 'var(--site-primary-fg)',
                  borderRadius: 'var(--site-radius)',
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              {step.icon ? (
                <DynamicIcon
                  name={step.icon}
                  className="h-5 w-5"
                  style={{ color: 'var(--site-accent)' }}
                />
              ) : null}
            </div>
            <h3
              className="mt-4 text-base font-semibold"
              style={{ fontFamily: 'var(--site-heading-font)', color: 'var(--site-fg)' }}
            >
              {step.title}
            </h3>
            <p
              className="mt-1.5 text-sm leading-relaxed"
              style={{ color: 'var(--site-muted-fg)' }}
            >
              {step.description}
            </p>
          </li>
        ))}
      </ol>
    </SectionShell>
  )
}
