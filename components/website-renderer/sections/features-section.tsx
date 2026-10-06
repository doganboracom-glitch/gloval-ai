'use client'

import type { Section } from '@/lib/website-schema'
import {
  SectionShell,
  SectionHeading,
} from '@/components/website-renderer/primitives'
import { DynamicIcon } from '@/components/website-renderer/icon'

type FeaturesData = Extract<Section, { type: 'features' }>

export function FeaturesSection({ data }: { data: FeaturesData }) {
  return (
    <SectionShell id="features" tinted>
      <SectionHeading title={data.title} subtitle={data.subtitle} />
      <div className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2">
        {data.items.map((item) => (
          <div key={item.title} className="flex items-start gap-4">
            <span
              className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center"
              style={{
                backgroundColor:
                  'color-mix(in srgb, var(--site-accent) 18%, transparent)',
                color: 'var(--site-accent)',
                borderRadius: 'var(--site-radius)',
              }}
            >
              <DynamicIcon name={item.icon} className="h-5 w-5" />
            </span>
            <div>
              <h3
                className="text-base font-semibold"
                style={{
                  fontFamily: 'var(--site-heading-font)',
                  color: 'var(--site-fg)',
                }}
              >
                {item.title}
              </h3>
              <p
                className="mt-1.5 text-sm leading-relaxed"
                style={{ color: 'var(--site-muted-fg)' }}
              >
                {item.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </SectionShell>
  )
}
