'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, PackageOpen, X } from 'lucide-react'
import type { ProductImage } from '@/lib/product-images'

export function ProductGallery({ images, name }: { images: ProductImage[]; name: string }) {
  const visible = images.slice(0, 8)
  const [active, setActive] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  const count = visible.length
  const current = visible[Math.min(active, Math.max(count - 1, 0))] ?? null

  useEffect(() => {
    if (!lightbox) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightbox(false)
      if (event.key === 'ArrowLeft') setActive((i) => (i - 1 + count) % count)
      if (event.key === 'ArrowRight') setActive((i) => (i + 1) % count)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, count])

  if (!current) return <div className="flex aspect-square items-center justify-center rounded-[var(--site-radius,1rem)] border border-border bg-muted text-muted-foreground"><PackageOpen className="size-16" /></div>
  const go = (delta: number) => setActive((i) => (i + delta + count) % count)

  return <>
    <div className="flex flex-col gap-3">
      <div className="group relative aspect-square overflow-hidden rounded-[var(--site-radius,1rem)] border border-border bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current.url} alt={current.alt || name} className="size-full object-cover" loading="eager" decoding="async" />
        <button type="button" onClick={() => setLightbox(true)} className="absolute inset-0 cursor-zoom-in" aria-label="Görseli büyüt" />
        {count > 1 && <>
          <button type="button" onClick={() => go(-1)} aria-label="Önceki görsel" className="absolute left-3 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/85 text-foreground shadow-sm backdrop-blur hover:bg-background"><ChevronLeft className="size-5" /></button>
          <button type="button" onClick={() => go(1)} aria-label="Sonraki görsel" className="absolute right-3 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/85 text-foreground shadow-sm backdrop-blur hover:bg-background"><ChevronRight className="size-5" /></button>
          <span className="absolute bottom-3 right-3 z-10 rounded-full bg-background/85 px-3 py-1 text-xs font-semibold backdrop-blur">{active + 1}/{count}</span>
        </>}
      </div>
      {count > 1 && <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Ürün görselleri">
        {visible.map((image, index) => <button key={`${image.url}-${index}`} type="button" onClick={() => setActive(index)} aria-label={`${index + 1}. görseli göster`} aria-current={index === active} className="size-20 shrink-0 overflow-hidden rounded-lg border-2 transition-colors" style={{ borderColor: index === active ? 'var(--site-primary, var(--primary))' : 'var(--site-border, var(--border))' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}<img src={image.url} alt="" className="size-full object-cover" loading="lazy" />
        </button>)}
      </div>}
      {count > 1 && <div className="flex justify-center gap-1.5 md:hidden" aria-hidden="true">{visible.map((_, index) => <span key={index} className="size-1.5 rounded-full" style={{ backgroundColor: index === active ? 'var(--site-primary, var(--primary))' : 'var(--site-border, var(--border))' }} />)}</div>}
    </div>
    {lightbox && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/95 p-4" role="dialog" aria-modal="true" aria-label="Ürün görseli">
      <button type="button" onClick={() => setLightbox(false)} aria-label="Kapat" className="absolute right-4 top-4 rounded-full border border-border bg-card p-2 text-foreground"><X className="size-5" /></button>
      {/* eslint-disable-next-line @next/next/no-img-element */}<img src={current.url} alt={current.alt || name} className="max-h-[88vh] max-w-full rounded-xl object-contain" />
      {count > 1 && <><button type="button" onClick={() => go(-1)} aria-label="Önceki görsel" className="absolute left-4 rounded-full border border-border bg-card p-3"><ChevronLeft /></button><button type="button" onClick={() => go(1)} aria-label="Sonraki görsel" className="absolute right-4 rounded-full border border-border bg-card p-3"><ChevronRight /></button></>}
    </div>}
  </>
}
