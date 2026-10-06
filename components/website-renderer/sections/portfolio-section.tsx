'use client'

import { useState } from 'react'
import type { Section } from '@/lib/website-schema'
import { SectionShell, SectionHeading, SiteImage } from '@/components/website-renderer/primitives'
import { ItemDetailDialog, type ItemDetail } from '@/components/website-renderer/item-detail'

type PortfolioData = Extract<Section, { type: 'portfolio' }>

export function PortfolioSection({ data, lang }: { data: PortfolioData; lang?: string }) {
  const [detail, setDetail] = useState<ItemDetail | null>(null)

  return (
    <SectionShell id="portfolio">
      <SectionHeading title={data.title} subtitle={data.subtitle} />
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {data.items.map((item, i) => (
          <button
            key={i}
            type="button"
            onClick={() =>
              setDetail({
                title: item.title,
                eyebrow: item.category,
                description: item.description,
                imagePrompt: item.imagePrompt,
                src: item.src,
                alt: item.alt,
                seed: i + 3,
                aspectRatio: '16/9',
              })
            }
            aria-haspopup="dialog"
            className="group cursor-pointer text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
            style={{ outlineColor: 'var(--site-primary)' }}
          >
            <SiteImage
              image={{ imagePrompt: item.imagePrompt, src: item.src, alt: item.alt, aspectRatio: '4/3' }}
              seed={i + 3}
              className="w-full transition-transform duration-300 group-hover:scale-[1.02]"
            />
            <span className="mt-3 block">
              {item.category ? (
                <span
                  className="block text-xs font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--site-primary)' }}
                >
                  {item.category}
                </span>
              ) : null}
              <span
                className="block text-pretty font-semibold"
                style={{ fontFamily: 'var(--site-heading-font)', color: 'var(--site-fg)' }}
              >
                {item.title}
              </span>
              {item.description ? (
                <span
                  className="mt-1 line-clamp-3 block text-pretty text-sm leading-relaxed"
                  style={{ color: 'var(--site-muted-fg)' }}
                >
                  {item.description}
                </span>
              ) : null}
            </span>
          </button>
        ))}
      </div>
      <ItemDetailDialog detail={detail} onClose={() => setDetail(null)} lang={lang} />
    </SectionShell>
  )
}
