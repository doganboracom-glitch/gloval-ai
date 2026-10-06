'use client'

import { Check } from 'lucide-react'
import type { Section } from '@/lib/website-schema'
import {
  SectionShell,
  SectionHeading,
} from '@/components/website-renderer/primitives'

type PricingData = Extract<Section, { type: 'pricing' }>

export function PricingSection({
  data,
  chooseLabel = 'Choose',
}: {
  data: PricingData
  chooseLabel?: string
}) {
  const cols = Math.min(data.plans.length, 3)
  return (
    <SectionShell id="pricing" tinted>
      <SectionHeading title={data.title} subtitle={data.subtitle} />
      <div
        className={`mt-10 grid gap-6 sm:grid-cols-2 ${
          cols >= 3 ? 'lg:grid-cols-3' : ''
        }`}
      >
        {data.plans.map((plan, i) => {
          const highlighted = plan.highlighted
          return (
            <div
              key={`${plan.name}-${i}`}
              className="flex flex-col p-6"
              style={{
                borderRadius: 'var(--site-radius)',
                border: highlighted
                  ? '2px solid var(--site-primary)'
                  : '1px solid var(--site-border)',
                backgroundColor: 'var(--site-bg)',
                boxShadow: highlighted
                  ? '0 20px 40px -20px color-mix(in srgb, var(--site-primary) 45%, transparent)'
                  : 'none',
              }}
            >
              {highlighted ? (
                <span
                  className="mb-3 inline-flex w-fit items-center px-2.5 py-1 text-xs font-semibold"
                  style={{
                    backgroundColor: 'var(--site-primary)',
                    color: 'var(--site-primary-fg)',
                    borderRadius: 'var(--site-radius)',
                  }}
                >
                  ★
                </span>
              ) : null}
              <h3
                className="text-lg font-bold"
                style={{
                  fontFamily: 'var(--site-heading-font)',
                  color: 'var(--site-fg)',
                }}
              >
                {plan.name}
              </h3>
              <div className="mt-2 flex items-end gap-1">
                <span
                  className="text-3xl font-extrabold"
                  style={{
                    fontFamily: 'var(--site-heading-font)',
                    color: 'var(--site-fg)',
                  }}
                >
                  {plan.price}
                </span>
                {plan.period ? (
                  <span
                    className="pb-1 text-sm"
                    style={{ color: 'var(--site-muted-fg)' }}
                  >
                    {plan.period}
                  </span>
                ) : null}
              </div>
              {plan.description ? (
                <p
                  className="mt-2 text-sm leading-relaxed"
                  style={{ color: 'var(--site-muted-fg)' }}
                >
                  {plan.description}
                </p>
              ) : null}
              <ul className="mt-5 flex flex-1 flex-col gap-2.5">
                {plan.features.map((feature, fi) => (
                  <li
                    key={fi}
                    className="flex items-start gap-2 text-sm"
                    style={{ color: 'var(--site-fg)' }}
                  >
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0"
                      style={{ color: 'var(--site-primary)' }}
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <span
                className="mt-6 inline-flex h-11 items-center justify-center px-5 text-sm font-semibold"
                style={{
                  borderRadius: 'var(--site-radius)',
                  fontFamily: 'var(--site-body-font)',
                  backgroundColor: highlighted
                    ? 'var(--site-primary)'
                    : 'transparent',
                  color: highlighted ? 'var(--site-primary-fg)' : 'var(--site-fg)',
                  border: highlighted ? 'none' : '1px solid var(--site-border)',
                }}
              >
                {plan.buttonText ?? chooseLabel}
              </span>
            </div>
          )
        })}
      </div>
    </SectionShell>
  )
}
