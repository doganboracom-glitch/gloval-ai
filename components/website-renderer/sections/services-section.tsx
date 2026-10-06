'use client'

import { useState } from 'react'
import type { Section } from '@/lib/website-schema'
import {
  SectionShell,
  SectionHeading,
} from '@/components/website-renderer/primitives'
import { DynamicIcon } from '@/components/website-renderer/icon'
import { ItemDetailDialog, type ItemDetail } from '@/components/website-renderer/item-detail'

type ServicesData = Extract<Section, { type: 'services' }>

export function ServicesSection({ data, lang }: { data: ServicesData; lang?: string }) {
  const [detail, setDetail] = useState<ItemDetail | null>(null)

  return (
    <SectionShell id="services">
      <SectionHeading title={data.title} subtitle={data.subtitle} />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.items.map((item) => (
          <button
            key={item.title}
            type="button"
            onClick={() =>
              setDetail({ title: item.title, eyebrow: data.title, description: item.description })
            }
            aria-haspopup="dialog"
            className="cursor-pointer p-5 text-start transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              backgroundColor: 'var(--site-card)',
              border: '1px solid var(--site-border)',
              borderRadius: 'var(--site-radius)',
              outlineColor: 'var(--site-primary)',
            }}
          >
            <span
              className="inline-flex h-10 w-10 items-center justify-center"
              style={{
                backgroundColor:
                  'color-mix(in srgb, var(--site-primary) 16%, transparent)',
                color: 'var(--site-primary)',
                borderRadius: 'var(--site-radius)',
              }}
            >
              <DynamicIcon name={item.icon} className="h-5 w-5" />
            </span>
            <span
              className="mt-4 block text-base font-semibold"
              style={{
                fontFamily: 'var(--site-heading-font)',
                color: 'var(--site-fg)',
              }}
            >
              {item.title}
            </span>
            <span
              className="mt-2 block text-sm leading-relaxed"
              style={{ color: 'var(--site-muted-fg)' }}
            >
              {item.description}
            </span>
          </button>
        ))}
      </div>
      <ItemDetailDialog detail={detail} onClose={() => setDetail(null)} lang={lang} />
    </SectionShell>
  )
}
