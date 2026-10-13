'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { ProductImagePlaceholder } from '@/components/store/product-image-placeholder'
import type { ProductImage } from '@/lib/product-images'
import { galleryView, stepGalleryIndex } from '@/lib/product-gallery-view'

export function ProductGallery({ images, name }: { images: ProductImage[]; name: string }) {
  const visible = images.slice(0, 8)
  const [active, setActive] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const count = visible.length
  const current = visible[Math.min(active, Math.max(count - 1, 0))] ?? null
  const view = galleryView(images.length, active)
  const go = (delta: number) => {
    if (count < 2) return
    setActive((i) => stepGalleryIndex(i, delta, count))
  }

  useEffect(() => {
    if (!lightbox) return
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightbox(false)
      if (event.key === 'ArrowLeft') go(-1)
      if (event.key === 'ArrowRight') go(1)
      if (event.key === 'Tab') {
        const focusable = [closeRef.current, ...Array.from(document.querySelectorAll<HTMLButtonElement>('[data-lightbox-control]'))].filter(Boolean) as HTMLButtonElement[]
        if (focusable.length && (event.shiftKey && document.activeElement === focusable[0] || !event.shiftKey && document.activeElement === focusable.at(-1))) { event.preventDefault(); (event.shiftKey ? focusable.at(-1) : focusable[0])?.focus() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, count])

  useEffect(() => { if (!lightbox) triggerRef.current?.focus() }, [lightbox])
  if (!current) return <div className="aspect-square overflow-hidden rounded-[var(--site-radius,1rem)] border border-border"><ProductImagePlaceholder name={name} /></div>
  return <>
    <div className="flex flex-col gap-3">
      <div className="group relative aspect-square overflow-hidden rounded-[var(--site-radius,1rem)] border border-border bg-muted" onTouchStart={(e) => { (e.currentTarget as HTMLElement).dataset.touchX = String(e.touches[0].clientX) }} onTouchEnd={(e) => { const start = Number((e.currentTarget as HTMLElement).dataset.touchX); const delta = e.changedTouches[0].clientX - start; if (count > 1 && Math.abs(delta) > 40) go(delta < 0 ? 1 : -1) }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}<img src={current.url} alt={current.alt || name} className="size-full object-cover" loading="eager" decoding="async" />
        <button ref={triggerRef} type="button" onClick={() => setLightbox(true)} className="absolute inset-0 cursor-zoom-in" aria-label="Görseli büyüt" />
        {view.counter && <span aria-live="polite" className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-full border border-border bg-background/85 px-2.5 py-1 text-xs font-medium text-foreground">{view.counter}</span>}
        {view.showArrows && <><button type="button" onClick={() => go(-1)} aria-label="Önceki görsel" className="absolute left-3 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/85"><ChevronLeft /></button><button type="button" onClick={() => go(1)} aria-label="Sonraki görsel" className="absolute right-3 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/85"><ChevronRight /></button></>}
      </div>
      {view.showStrip && <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Ürün görselleri">{visible.map((image, index) => <button key={`${image.url}-${index}`} type="button" onClick={() => setActive(index)} aria-label={`${index + 1}. görseli göster`} aria-current={index === active} className="size-20 shrink-0 overflow-hidden rounded-lg border-2" style={{ borderColor: index === active ? 'var(--site-primary, var(--primary))' : 'var(--site-border, var(--border))' }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={image.url} alt="" className="size-full object-cover" loading="lazy" /></button>)}</div>}
    </div>
    {lightbox && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/95 p-4" role="dialog" aria-modal="true" aria-label="Ürün görseli" onMouseDown={(e) => { if (e.target === e.currentTarget) setLightbox(false) }}><button ref={closeRef} type="button" onClick={() => setLightbox(false)} aria-label="Kapat" className="absolute right-4 top-4 rounded-full border border-border bg-card p-2"><X /></button>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={current.url} alt={current.alt || name} className="max-h-[88vh] max-w-full rounded-xl object-contain" />{count > 1 && <><button data-lightbox-control type="button" onClick={() => go(-1)} aria-label="Önceki görsel" className="absolute left-4 rounded-full border border-border bg-card p-3"><ChevronLeft /></button><button data-lightbox-control type="button" onClick={() => go(1)} aria-label="Sonraki görsel" className="absolute right-4 rounded-full border border-border bg-card p-3"><ChevronRight /></button></>}</div>}
  </>
}
