'use client'

import { useState } from 'react'

/**
 * Interactive listing gallery: a large primary image plus selectable
 * thumbnails. Styled entirely from the demo's scoped `--site-*` variables so it
 * matches the surrounding chrome.
 */
export function EmlakGallery({ images, alt }: { images: string[]; alt: string }) {
  const [active, setActive] = useState(0)
  const gallery = images.length > 0 ? images : ['/placeholder.svg']

  return (
    <div>
      <div
        className="relative aspect-[16/10] overflow-hidden"
        style={{ borderRadius: 'var(--site-radius)', border: '1px solid var(--site-border)' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={gallery[active]}
          src={gallery[active] || '/placeholder.svg'}
          alt={alt}
          className="absolute inset-0 h-full w-full object-cover"
          decoding="async"
        />
      </div>

      {gallery.length > 1 && (
        <div className="mt-3 grid grid-cols-4 gap-3">
          {gallery.map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`${alt} — ${i + 1}`}
              aria-current={i === active}
              className="relative aspect-[4/3] overflow-hidden transition-opacity hover:opacity-90"
              style={{
                borderRadius: 'var(--site-radius)',
                border: i === active ? '2px solid var(--site-primary)' : '1px solid var(--site-border)',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src || '/placeholder.svg'}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                loading="lazy"
                decoding="async"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
