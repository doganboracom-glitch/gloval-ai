'use client'

import { useState } from 'react'
import type { Section } from '@/lib/website-schema'
import { isUsableImageSrc } from '@/lib/about-media'
import type { LightboxItem } from '@/lib/lightbox-nav'
import { Lightbox } from '@/components/website-renderer/lightbox'
import {
  SectionShell,
  SectionHeading,
  SiteImage,
} from '@/components/website-renderer/primitives'

type GalleryData = Extract<Section, { type: 'gallery' }>

export function GallerySection({ data }: { data: GalleryData }) {
  const [open, setOpen] = useState<number | null>(null)
  // Only tiles with a real picture can be enlarged; the rest render exactly as before.
  const viewable = data.items.flatMap((item, i) =>
    isUsableImageSrc(item.src)
      ? [{ i, item: { kind: 'image', src: item.src, alt: item.alt ?? item.caption ?? '', caption: item.caption } satisfies LightboxItem }]
      : [],
  )
  const lightboxItems = viewable.map((v) => v.item)
  const lightboxPos = new Map(viewable.map((v, pos) => [v.i, pos]))
  const lang = typeof document !== 'undefined' && document.documentElement.lang.startsWith('en') ? 'en' : 'tr'
  return (
    <SectionShell id="gallery" tinted>
      <SectionHeading title={data.title} subtitle={data.subtitle} />
      <div
        className={
          data.items.length === 1
            ? 'mx-auto mt-10 grid max-w-2xl gap-4'
            : 'mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3'
        }
        data-single-item={data.items.length === 1 ? 'true' : undefined}
      >
        {data.items.map((item, i) => {
          const image = (
            <SiteImage
              image={{
                imagePrompt: item.imagePrompt,
                src: item.src,
                alt: item.alt ?? item.caption,
                aspectRatio: item.aspectRatio ?? '4/3',
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
      {open !== null ? (
        <Lightbox items={lightboxItems} index={open} onIndexChange={setOpen} onClose={() => setOpen(null)} lang={lang} />
      ) : null}
    </SectionShell>
  )
}
