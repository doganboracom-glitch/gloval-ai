'use client'

import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import type { Section } from '@/lib/website-schema'
import { isUsableImageSrc } from '@/lib/about-media'
import type { LightboxItem } from '@/lib/lightbox-nav'
import { Lightbox } from '@/components/website-renderer/lightbox'
import { useDemoHref, useHrefNormalizer, useSiteNav } from '@/components/website-renderer/site-nav-context'
import {
  SectionShell,
  SectionHeading,
  SiteImage,
  onSiteNavClick,
} from '@/components/website-renderer/primitives'

type GalleryData = Extract<Section, { type: 'gallery' }>

/** The home page shows a preview strip; the full set lives on the gallery page. */
export const HOME_GALLERY_LIMIT = 8

function AllPhotosLink({ link }: { link: { label: string; href: string } }) {
  const nav = useSiteNav()
  const normalize = useHrefNormalizer()
  const demoHref = useDemoHref()
  const href = demoHref(normalize(link.href))
  return (
    <div className="mt-8 flex justify-center">
      <a
        href={href}
        onClick={(e) => onSiteNavClick(e, href, nav)}
        className="inline-flex items-center gap-1.5 text-sm font-semibold underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ color: 'var(--site-primary)', outlineColor: 'var(--site-primary)' }}
      >
        {link.label}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </a>
    </div>
  )
}

export function GallerySection({
  data,
  moreLink = null,
}: {
  data: GalleryData
  /** Link to the full gallery page, or null when that page does not exist. */
  moreLink?: { label: string; href: string } | null
}) {
  const [open, setOpen] = useState<number | null>(null)
  const shown = data.items.slice(0, HOME_GALLERY_LIMIT)
  // Only tiles with a real picture can be enlarged; the rest render exactly as before.
  const viewable = shown.flatMap((item, i) =>
    isUsableImageSrc(item.src)
      ? [{ i, item: { kind: 'image', src: item.src, alt: item.alt ?? item.caption ?? '', caption: item.caption } satisfies LightboxItem }]
      : [],
  )
  const lightboxItems = viewable.map((v) => v.item)
  const lightboxPos = new Map(viewable.map((v, pos) => [v.i, pos]))
  const lang = typeof document !== 'undefined' && document.documentElement.lang.startsWith('en') ? 'en' : 'tr'
  const single = shown.length === 1
  return (
    <SectionShell id="gallery" tinted>
      <SectionHeading title={data.title} subtitle={data.subtitle} />
      <div
        className={
          single
            ? 'mx-auto mt-10 grid max-w-xs gap-3'
            : 'mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4'
        }
        data-single-item={single ? 'true' : undefined}
      >
        {shown.map((item, i) => {
          const image = (
            <SiteImage
              image={{
                imagePrompt: item.imagePrompt,
                src: item.src,
                alt: item.alt ?? item.caption,
                aspectRatio: '4/3',
              }}
              seed={i + 1}
              name={item.caption}
              className="w-full"
            />
          )
          const pos = lightboxPos.get(i)
          return (
            <figure key={i} className="flex flex-col gap-2">
              {pos === undefined ? (
                image
              ) : (
                <button
                  type="button"
                  onClick={() => setOpen(pos)}
                  aria-label={`${item.alt ?? item.caption ?? ''} - ${lang === 'en' ? 'enlarge' : 'büyüt'}`.trim()}
                  aria-haspopup="dialog"
                  className="block w-full cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ outlineColor: 'var(--site-primary)' }}
                >
                  {image}
                </button>
              )}
              {item.caption ? (
                <figcaption
                  className="text-xs"
                  style={{ color: 'var(--site-muted-fg)' }}
                >
                  {item.caption}
                </figcaption>
              ) : null}
            </figure>
          )
        })}
      </div>
      {moreLink ? <AllPhotosLink link={moreLink} /> : null}
      {open !== null ? (
        <Lightbox items={lightboxItems} index={open} onIndexChange={setOpen} onClose={() => setOpen(null)} lang={lang} />
      ) : null}
    </SectionShell>
  )
}
