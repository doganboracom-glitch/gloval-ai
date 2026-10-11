'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, PackageOpen } from 'lucide-react'
import type { ProductImage } from '@/lib/product-images'

export function ProductGallery({ images, name }: { images: ProductImage[]; name: string }) {
  const [active, setActive] = useState(0)
  const count = images.length
  const current = images[Math.min(active, Math.max(count - 1, 0))] ?? null

  if (!current) {
    return (
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-border bg-muted text-muted-foreground">
        <PackageOpen className="size-16" />
      </div>
    )
  }

  const go = (delta: number) => setActive((i) => (i + delta + count) % count)

  return (
    <div className="flex flex-col gap-3">
      <div className="group relative aspect-square overflow-hidden rounded-2xl border border-border bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current.url} alt={current.alt || name} className="size-full object-cover" />
        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Önceki görsel"
              className="absolute left-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/85 text-foreground backdrop-blur transition-opacity hover:bg-background focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Sonraki görsel"
              className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/85 text-foreground backdrop-blur transition-opacity hover:bg-background focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
            >
              <ChevronRight className="size-5" />
            </button>
            <span className="absolute bottom-2 right-2 rounded-full bg-background/85 px-2.5 py-0.5 text-xs font-medium backdrop-blur">
              {Math.min(active, count - 1) + 1} / {count}
            </span>
          </>
        )}
      </div>

      {count > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Ürün görselleri">
          {images.map((image, i) => (
            <li key={image.url} className="shrink-0">
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={`${i + 1}. görseli göster`}
                aria-current={i === active}
                className={`block size-16 overflow-hidden rounded-lg border-2 transition-colors ${
                  i === active ? 'border-primary' : 'border-border hover:border-primary/50'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt="" className="size-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
