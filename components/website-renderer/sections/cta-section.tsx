'use client'

import type { Section } from '@/lib/website-schema'
import { SiteButton } from '@/components/website-renderer/primitives'

type CtaData = Extract<Section, { type: 'cta' }>

export function CtaSection({ data }: { data: CtaData }) {
  return (
    <section className="px-6 py-16 sm:py-20">
      <div
        className="mx-auto flex w-full max-w-4xl flex-col items-center gap-6 px-6 py-12 text-center sm:px-12"
        style={{
          borderRadius: 'var(--site-radius)',
          background:
            'linear-gradient(135deg, color-mix(in srgb, var(--site-primary) 90%, black 0%), color-mix(in srgb, var(--site-accent) 55%, var(--site-primary)))',
        }}
      >
        <h2
          className="text-balance text-2xl font-bold sm:text-3xl"
          style={{
            fontFamily: 'var(--site-heading-font)',
            color: 'var(--site-primary-fg)',
          }}
        >
          {data.title}
        </h2>
        {data.description ? (
          <p
            className="max-w-xl text-pretty text-sm leading-relaxed sm:text-base"
            style={{
              color: 'color-mix(in srgb, var(--site-primary-fg) 85%, transparent)',
            }}
          >
            {data.description}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-center gap-3">
          <span
            className="inline-flex"
            style={
              {
                // invert: on the gradient, the primary button becomes a light chip
                '--site-primary': 'var(--site-primary-fg)',
                '--site-primary-fg': 'var(--site-primary)',
              } as React.CSSProperties
            }
          >
            <SiteButton button={data.primaryButton} />
          </span>
          {data.secondaryButton && (
            <span
              style={
                {
                  '--site-border':
                    'color-mix(in srgb, var(--site-primary-fg) 60%, transparent)',
                  '--site-fg': 'var(--site-primary-fg)',
                } as React.CSSProperties
              }
            >
              <SiteButton button={data.secondaryButton} variant="outline" />
            </span>
          )}
        </div>
      </div>
    </section>
  )
}
