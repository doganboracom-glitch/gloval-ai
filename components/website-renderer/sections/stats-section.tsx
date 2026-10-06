'use client'

import type { Section } from '@/lib/website-schema'
import {
  SectionShell,
  SectionHeading,
} from '@/components/website-renderer/primitives'
import { DynamicIcon } from '@/components/website-renderer/icon'

type StatsData = Extract<Section, { type: 'stats' }>

export function StatsSection({ data }: { data: StatsData }) {
  const cols = Math.min(data.items.length, 4)
  return (
    <SectionShell id="stats">
      {data.title ? (
        <SectionHeading title={data.title} subtitle={data.subtitle} />
      ) : null}
      <div
        className={`grid gap-6 ${data.title ? 'mt-10' : ''} grid-cols-2 ${
          cols >= 4 ? 'lg:grid-cols-4' : cols === 3 ? 'lg:grid-cols-3' : ''
        }`}
      >
        {data.items.map((item, i) => (
          <div
            key={`${item.label}-${i}`}
            className="flex flex-col items-center px-2 text-center"
          >
            {item.icon ? (
              <span
                className="mb-3 inline-flex h-10 w-10 items-center justify-center"
                style={{
                  backgroundColor:
                    'color-mix(in srgb, var(--site-primary) 16%, transparent)',
                  color: 'var(--site-primary)',
                  borderRadius: 'var(--site-radius)',
                }}
              >
                <DynamicIcon name={item.icon} className="h-5 w-5" />
              </span>
            ) : null}
            <span
              className="text-3xl font-extrabold sm:text-4xl"
              style={{
                fontFamily: 'var(--site-heading-font)',
                color: 'var(--site-primary)',
              }}
            >
              {item.value}
            </span>
            <span
              className="mt-1.5 text-sm leading-snug"
              style={{ color: 'var(--site-muted-fg)' }}
            >
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </SectionShell>
  )
}
