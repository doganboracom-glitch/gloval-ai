'use client'

import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import type { Section } from '@/lib/website-schema'
import {
  SectionShell,
  SectionHeading,
  onSiteNavClick,
} from '@/components/website-renderer/primitives'
import { DynamicIcon } from '@/components/website-renderer/icon'
import { ItemDetailDialog, type ItemDetail } from '@/components/website-renderer/item-detail'
import { useDemoHref, useHrefNormalizer, useSiteNav } from '@/components/website-renderer/site-nav-context'
import { isUsableImageSrc } from '@/lib/about-media'

type ServicesData = Extract<Section, { type: 'services' }>

type ServicesLinks = {
  /** "Tüm hizmetlerimiz" link under the grid, or null. */
  more: { label: string; href: string } | null
  /** Page path of each item (same order as `data.items`), or null while the pages are off. */
  itemHrefs: (string | null)[]
  itemLinkLabel: string
}

const cardStyle = {
  backgroundColor: 'var(--site-card)',
  border: '1px solid var(--site-border)',
  borderRadius: 'var(--site-radius)',
  outlineColor: 'var(--site-primary)',
} as const

const hasImage = (item: ServicesData['items'][number]) => isUsableImageSrc(item.src)

function ItemBody({
  item,
  linkLabel,
}: {
  item: ServicesData['items'][number]
  linkLabel: string | null
}) {
  const withImage = hasImage(item)
  return (
    <>
      {withImage ? (
        <span className="-m-5 mb-4 block overflow-hidden" style={{ borderRadius: 'var(--site-radius) var(--site-radius) 0 0' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={(item.src as string).trim()}
            alt={item.alt?.trim() || item.title}
            loading="lazy"
            decoding="async"
            className="aspect-[16/10] w-full object-cover"
          />
        </span>
      ) : (
        <span
          className="inline-flex h-10 w-10 items-center justify-center"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--site-primary) 16%, transparent)',
            color: 'var(--site-primary)',
            borderRadius: 'var(--site-radius)',
          }}
        >
          <DynamicIcon name={item.icon} className="h-5 w-5" />
        </span>
      )}
      <span
        className={`${withImage ? '' : 'mt-4 '}block text-base font-semibold`}
        style={{ fontFamily: 'var(--site-heading-font)', color: 'var(--site-fg)' }}
      >
        {item.title}
      </span>
      <span className="mt-2 block text-sm leading-relaxed" style={{ color: 'var(--site-muted-fg)' }}>
        {item.description}
      </span>
      {linkLabel ? (
        <span
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold"
          style={{ color: 'var(--site-primary)' }}
        >
          {linkLabel}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </span>
      ) : null}
    </>
  )
}

export function ServicesSection({
  data,
  lang,
  links = null,
}: {
  data: ServicesData
  lang?: string
  links?: ServicesLinks | null
}) {
  const [detail, setDetail] = useState<ItemDetail | null>(null)
  const nav = useSiteNav()
  const normalize = useHrefNormalizer()
  const demoHref = useDemoHref()
  const resolve = (href: string) => demoHref(normalize(href))

  return (
    <SectionShell id="services">
      <SectionHeading title={data.title} subtitle={data.subtitle} />
      <div
        className={
          data.items.length === 1
            ? 'mx-auto mt-10 grid max-w-md gap-4'
            : 'mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3'
        }
        data-single-item={data.items.length === 1 ? 'true' : undefined}
      >
        {data.items.map((item, i) => {
          const rawHref = links?.itemHrefs[i] ?? null
          if (rawHref) {
            const href = resolve(rawHref)
            return (
              <a
                key={`${item.title}-${i}`}
                href={href}
                onClick={(e) => onSiteNavClick(e, href, nav)}
                className={`block ${hasImage(item) ? 'overflow-hidden ' : ''}p-5 text-start transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`}
                style={cardStyle}
              >
                <ItemBody item={item} linkLabel={links?.itemLinkLabel ?? null} />
              </a>
            )
          }
          return (
            <button
              key={`${item.title}-${i}`}
              type="button"
              onClick={() =>
                setDetail({ title: item.title, eyebrow: data.title, description: item.description })
              }
              aria-haspopup="dialog"
              className={`cursor-pointer ${hasImage(item) ? 'overflow-hidden ' : ''}p-5 text-start transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`}
              style={cardStyle}
            >
              <ItemBody item={item} linkLabel={null} />
            </button>
          )
        })}
      </div>
      {links?.more ? (
        <a
          href={resolve(links.more.href)}
          onClick={(e) => onSiteNavClick(e, resolve(links.more!.href), nav)}
          className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold underline-offset-4 hover:underline"
          style={{ color: 'var(--site-primary)' }}
        >
          {links.more.label}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </a>
      ) : null}
      <ItemDetailDialog detail={detail} onClose={() => setDetail(null)} lang={lang} />
    </SectionShell>
  )
}
