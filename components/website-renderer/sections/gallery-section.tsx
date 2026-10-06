'use client'

import type { Section } from '@/lib/website-schema'
import {
  SectionShell,
  SectionHeading,
  SiteImage,
} from '@/components/website-renderer/primitives'

type GalleryData = Extract<Section, { type: 'gallery' }>

export function GallerySection({ data }: { data: GalleryData }) {
  return (
    <SectionShell id="gallery" tinted>
      <SectionHeading title={data.title} subtitle={data.subtitle} />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.items.map((item, i) => (
          <figure key={i} className="flex flex-col gap-2">
            <SiteImage
              image={{
                imagePrompt: item.imagePrompt,
                src: item.src,
                alt: item.alt ?? item.caption,
                aspectRatio: item.aspectRatio ?? '4/3',
              }}
              seed={i + 1}
              className="w-full"
            />
            {item.caption ? (
              <figcaption
                className="text-xs"
                style={{ color: 'var(--site-muted-fg)' }}
              >
                {item.caption}
              </figcaption>
            ) : null}
          </figure>
        ))}
      </div>
    </SectionShell>
  )
}
