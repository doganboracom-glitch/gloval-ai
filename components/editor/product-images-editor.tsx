'use client'

import { useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ImagePlus, Trash2, Upload } from 'lucide-react'
import type { WebsiteSchema } from '@/lib/website-schema'
import { isUsableImageSrc } from '@/lib/about-media'
import { PRODUCT_IMAGES_MAX } from '@/lib/list-limits'
import {
  collectSiteImages,
  galleryOf,
  moveImage,
  PRODUCT_IMAGE_ACCEPT,
  suggestProductImageAlt,
  validateProductImageFile,
  type GalleryImage,
} from '@/lib/product-image-rules'
import { GhostButton, IconBtn, TextField } from '@/components/editor/editor-fields'
import { AiImagePreviewPanel } from '@/components/editor/ai-image-preview-panel'

const COPY = {
  tr: {
    title: 'Ürün görselleri',
    count: (n: number) => `${n} / ${PRODUCT_IMAGES_MAX}`,
    cover: 'Kapak',
    coverHint: 'İlk görsel ürün kartında ve ürün sayfasının ilk görseli olarak kullanılır.',
    alt: 'Görsel açıklaması (alt metin, zorunlu)',
    altSuggest: 'Önerilen metni kullan',
    up: 'Yukarı taşı',
    down: 'Aşağı taşı',
    remove: 'Görseli sil',
    upload: 'Görsel yükle',
    pick: 'Mevcut görsellerden seç',
    pickEmpty: 'Sitenizde seçilebilecek başka görsel yok.',
    pickClose: 'Seçimi kapat',
    badType: 'Yalnızca PNG, JPG veya WebP yüklenebilir.',
    badSize: 'Görsel en fazla 5 MB olabilir.',
    full: `En fazla ${PRODUCT_IMAGES_MAX} görsel eklenebilir.`,
  },
  en: {
    title: 'Product images',
    count: (n: number) => `${n} / ${PRODUCT_IMAGES_MAX}`,
    cover: 'Cover',
    coverHint: 'The first image is used on the product card and as the first image on the product page.',
    alt: 'Image description (alt text, required)',
    altSuggest: 'Use suggested text',
    up: 'Move up',
    down: 'Move down',
    remove: 'Delete image',
    upload: 'Upload image',
    pick: 'Choose from existing images',
    pickEmpty: 'There are no other images on your site to choose from.',
    pickClose: 'Close picker',
    badType: 'Only PNG, JPG or WebP files can be uploaded.',
    badSize: 'An image can be at most 5 MB.',
    full: `Up to ${PRODUCT_IMAGES_MAX} images.`,
  },
} as const

type Props = {
  site: WebsiteSchema
  sectionIndex: number
  productIndex: number
  product: { name: string; images?: GalleryImage[]; src?: string; alt?: string }
  projectId: string | null
  disabled?: boolean
  onChange: (images: GalleryImage[]) => void
}

export function ProductImagesEditor({ site, sectionIndex, productIndex, product, projectId, disabled, onChange }: Props) {
  const lang = site.meta.language === 'en' ? 'en' : 'tr'
  const c = COPY[lang]
  const gallery = galleryOf(product)
  const full = gallery.length >= PRODUCT_IMAGES_MAX
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)

  const add = (src: string, alt?: string) => {
    if (full || !isUsableImageSrc(src)) return
    onChange([...gallery, { src, alt: alt?.trim() || suggestProductImageAlt(product.name, gallery.length, lang) }])
  }

  const onFile = (file: File | undefined) => {
    if (!file) return
    const problem = validateProductImageFile(file)
    if (problem) {
      setError(problem === 'type' ? c.badType : c.badSize)
      return
    }
    setError(null)
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result) add(reader.result)
    }
    reader.readAsDataURL(file)
  }

  const used = new Set(gallery.map((image) => image.src.trim()))
  const existing = picking ? collectSiteImages(site).filter((image) => !used.has(image.src)) : []

  return (
    <div className="flex flex-col gap-1.5" data-product-images>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{c.title}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{c.count(gallery.length)}</span>
      </div>
      {gallery.length > 0 ? <p className="text-xs text-muted-foreground">{c.coverHint}</p> : null}

      {gallery.map((image, g) => {
        const missingAlt = !image.alt?.trim()
        return (
          <div key={`${image.src.slice(-24)}-${g}`} className="flex items-start gap-2" data-product-image-row>
            <div className="relative shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.src} alt="" className="h-14 w-14 rounded-md border border-border object-cover" />
              {g === 0 ? (
                <span className="absolute inset-x-0 bottom-0 rounded-b-md bg-brand px-1 text-center text-[10px] font-semibold text-brand-foreground">
                  {c.cover}
                </span>
              ) : null}
            </div>
            <div className="flex-1">
              <TextField
                label={c.alt}
                value={image.alt ?? ''}
                maxLength={160}
                hint={missingAlt ? suggestProductImageAlt(product.name, g, lang) : undefined}
                onCommit={(v) =>
                  onChange(
                    gallery.map((x, k) =>
                      k === g ? { ...x, alt: v.trim() || suggestProductImageAlt(product.name, g, lang) } : x,
                    ),
                  )
                }
              />
              {missingAlt ? (
                <button
                  type="button"
                  className="mt-1 text-xs font-medium text-brand hover:underline"
                  onClick={() =>
                    onChange(gallery.map((x, k) => (k === g ? { ...x, alt: suggestProductImageAlt(product.name, g, lang) } : x)))
                  }
                >
                  {c.altSuggest}
                </button>
              ) : null}
            </div>
            <div className="flex flex-col gap-1">
              <IconBtn label={c.up} small onClick={() => onChange(moveImage(gallery, g, g - 1))}>
                <ArrowUp className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn label={c.down} small onClick={() => onChange(moveImage(gallery, g, g + 1))}>
                <ArrowDown className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn label={c.remove} small onClick={() => onChange(gallery.filter((_, k) => k !== g))}>
                <Trash2 className="h-3.5 w-3.5" />
              </IconBtn>
            </div>
          </div>
        )
      })}

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {full ? (
        <p className="text-xs text-muted-foreground">{c.full}</p>
      ) : (
        <>
          <GhostButton onClick={() => fileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            {c.upload}
          </GhostButton>
          <input
            ref={fileRef}
            type="file"
            accept={PRODUCT_IMAGE_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              onFile(file)
            }}
          />
          <GhostButton onClick={() => setPicking((open) => !open)}>
            <ImagePlus className="h-3.5 w-3.5" />
            {picking ? c.pickClose : c.pick}
          </GhostButton>
          {picking ? (
            existing.length === 0 ? (
              <p className="text-xs text-muted-foreground">{c.pickEmpty}</p>
            ) : (
              <ul className="grid grid-cols-4 gap-1.5" data-product-image-picker>
                {existing.map((image) => (
                  <li key={image.src}>
                    <button
                      type="button"
                      className="block overflow-hidden rounded-md border border-border hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
                      onClick={() => add(image.src, image.alt)}
                      aria-label={image.alt || c.pick}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image.src} alt="" className="aspect-square w-full object-cover" />
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
          <AiImagePreviewPanel
            site={site}
            sectionKey={`products:${sectionIndex}.${productIndex}`}
            projectId={projectId}
            canAdd={!full}
            disabled={disabled}
            onUse={(image) => add(image.src, image.alt)}
          />
        </>
      )}
    </div>
  )
}
