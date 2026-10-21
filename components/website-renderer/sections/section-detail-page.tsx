'use client'

import { Check } from 'lucide-react'
import type { WebsiteSchema } from '@/lib/website-schema'
import { SectionShell, SiteButton } from '@/components/website-renderer/primitives'
import {
  detailLeadImage,
  detailStripImages,
  parseDetailBody,
  resolveAboutDetail,
  type DetailImage,
} from '@/lib/section-detail'

function Photo({ image, className = '' }: { image: DetailImage; className?: string }) {
  return (
    <div
      className={`overflow-hidden ${className}`}
      style={{ borderRadius: 'var(--site-radius)', border: '1px solid var(--site-border)' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.src} alt={image.alt} loading="lazy" decoding="async" className="h-full w-full object-cover" />
    </div>
  )
}

function BlockBody({ body }: { body: string }) {
  return (
    <div className="mt-3 grid gap-4">
      {parseDetailBody(body).map((part, i) =>
        part.type === 'ul' ? (
          <ul key={i} className="grid gap-2">
            {part.items.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm leading-relaxed sm:text-base">
                <Check className="mt-1 h-4 w-4 shrink-0" style={{ color: 'var(--site-primary)' }} />
                <span style={{ color: 'var(--site-muted-fg)' }}>{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p
            key={i}
            className="text-pretty text-sm leading-relaxed sm:text-base"
            style={{ color: 'var(--site-muted-fg)' }}
          >
            {part.text}
          </p>
        ),
      )}
    </div>
  )
}

/**
 * Long-form "Hakkımızda" page that the home about section links to with
 * "Daha fazlası…". The text lives on the about section (`detail`), so editing
 * the section edits this page; the header and footer come from the shared site.
 */
export function SectionDetailPage({ site }: { site: WebsiteSchema }) {
  const resolved = resolveAboutDetail(site)
  if (!resolved) return null

  const { section, detail, blocks, pageTitle } = resolved
  const lang = site.meta.language === 'en' ? 'en' : 'tr'
  const heading = detail.heading?.trim() || section.title
  const altBase = `${site.meta.name} - ${heading}`
  const lead = detailLeadImage(section, altBase)
  const strip = detailStripImages(section, altBase)

  return (
    <SectionShell id="about-detail">
      <article className="mx-auto w-full max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--site-primary)' }}>
          {pageTitle}
        </p>
        <h1
          className="mt-3 text-balance text-3xl font-bold sm:text-4xl"
          style={{ fontFamily: 'var(--site-heading-font)', color: 'var(--site-fg)' }}
        >
          {heading}
        </h1>

        {lead ? <Photo image={lead} className="mt-8 aspect-[16/9]" /> : null}

        <div className="mt-10 grid gap-10">
          {blocks.map((block, i) => {
            const Tag = block.level === 'h3' ? 'h3' : 'h2'
            return (
              <section key={`${block.heading ?? 'block'}-${i}`}>
                {block.heading ? (
                  <Tag
                    className={`text-pretty font-bold ${block.level === 'h3' ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl'}`}
                    style={{ fontFamily: 'var(--site-heading-font)', color: 'var(--site-fg)' }}
                  >
                    {block.heading}
                  </Tag>
                ) : null}
                {block.body ? <BlockBody body={block.body} /> : null}
              </section>
            )
          })}
        </div>

        {strip.length > 0 ? (
          <div className={`mt-12 grid gap-3 ${strip.length === 1 ? '' : strip.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
            {strip.map((image) => (
              <Photo key={image.src} image={image} className="aspect-[4/3]" />
            ))}
          </div>
        ) : null}

        <div className="mt-12">
          <SiteButton button={{ label: lang === 'en' ? 'Back to home' : 'Ana sayfaya dön', href: '/' }} variant="outline" />
        </div>
      </article>
    </SectionShell>
  )
}
