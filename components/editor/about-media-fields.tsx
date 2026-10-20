'use client'

import { Plus, Trash2, Upload } from 'lucide-react'
import type { WebsiteSchema } from '@/lib/website-schema'
import type { EditOperation } from '@/lib/website-edit-operations'
import {
  ABOUT_LAYOUTS,
  MAX_ABOUT_IMAGES,
  collectReusableImages,
  hasRealFigure,
  isUsableImageSrc,
  layoutAvailability,
  suggestAboutAlt,
  usableAboutImages,
  type AboutLayout,
} from '@/lib/about-media'
import { GhostButton, IconBtn, TextField, UploadButton } from '@/components/editor/editor-fields'

type AboutSectionData = Extract<WebsiteSchema['sections'][number], { type: 'about' }>

const COPY = {
  tr: {
    heading: 'Bölüm görseli',
    enable: 'Görselli düzeni kullan',
    layout: 'Düzen',
    layouts: {
      corner: 'Köşe çerçeve',
      collage: 'Kolaj',
      round: 'Yuvarlak',
      figure: 'Rakamlı',
    } as Record<AboutLayout, string>,
    needs: {
      'needs-image': 'Önce bir görsel ekleyin.',
      'needs-two-images': 'En az 2 görsel gerekir.',
      'needs-figure': 'Önce gerçek bir rakam ve etiket girin.',
    } as Record<string, string>,
    images: 'Görseller',
    alt: 'Görsel açıklaması (alt metin)',
    upload: 'Görsel yükle',
    remove: 'Kaldır',
    reuse: 'Sitedeki görsellerden ekle',
    badge: 'Rozet metni',
    ctaLabel: 'Buton metni',
    ctaHref: 'Buton bağlantısı',
    figureValue: 'Rakam (örn. 2012)',
    figureLabel: 'Rakam etiketi (örn. Kuruluş yılı)',
    figureHint: 'Yalnızca gerçek bilgilerinizi girin; uydurma rakam kullanmayın.',
    max: `En fazla ${MAX_ABOUT_IMAGES} görsel.`,
  },
  en: {
    heading: 'Section imagery',
    enable: 'Use the image layout',
    layout: 'Layout',
    layouts: {
      corner: 'Corner frame',
      collage: 'Collage',
      round: 'Round',
      figure: 'With figure',
    } as Record<AboutLayout, string>,
    needs: {
      'needs-image': 'Add an image first.',
      'needs-two-images': 'Needs at least 2 images.',
      'needs-figure': 'Enter a real figure and label first.',
    } as Record<string, string>,
    images: 'Images',
    alt: 'Image description (alt text)',
    upload: 'Upload image',
    remove: 'Remove',
    reuse: 'Add from the site images',
    badge: 'Badge text',
    ctaLabel: 'Button label',
    ctaHref: 'Button link',
    figureValue: 'Figure (e.g. 2012)',
    figureLabel: 'Figure label (e.g. Founded)',
    figureHint: 'Only enter facts that are true for your business.',
    max: `Up to ${MAX_ABOUT_IMAGES} images.`,
  },
} as const

export function AboutMediaFields({
  site,
  index,
  section,
  onDispatch,
}: {
  site: WebsiteSchema
  index: number
  section: AboutSectionData
  onDispatch: (op: EditOperation) => void
}) {
  const lang = site.meta.language === 'en' ? 'en' : 'tr'
  const c = COPY[lang]
  const media = section.media
  const enabled = !!media && media.enabled !== false
  const stored = media?.images ?? []
  const fallbackAlt = suggestAboutAlt(site, section.title, lang)
  const shownCount = usableAboutImages(media, fallbackAlt).length
  const activeLayout = (media?.layout as AboutLayout | undefined) ?? 'corner'

  const patch = (p: Extract<EditOperation, { op: 'updateAboutMedia' }>['patch']) =>
    onDispatch({ op: 'updateAboutMedia', index, patch: p })

  const used = new Set(stored.map((i) => i.src))
  const reusable = collectReusableImages(site).filter((i) => !used.has(i.src))
  const canAdd = stored.length < MAX_ABOUT_IMAGES

  const addImage = (src: string, alt?: string, origin?: string) => {
    if (!isUsableImageSrc(src) || !canAdd) return
    patch({
      enabled: true,
      images: [...stored, { src, alt: alt || fallbackAlt, origin }],
      ...(media?.layout ? {} : { layout: 'corner' }),
    })
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--color-brand)]"
          checked={enabled}
          onChange={(e) =>
            patch({ enabled: e.target.checked, ...(media?.layout ? {} : { layout: 'corner' }) })
          }
        />
        {c.enable}
      </label>

      {enabled && (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{c.images}</span>
            {stored.map((image, i) => (
              <div key={i} className="flex items-start gap-2">
                {isUsableImageSrc(image.src) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image.src}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-md border border-border object-cover"
                  />
                ) : null}
                <div className="flex-1">
                  <TextField
                    label={c.alt}
                    value={image.alt ?? ''}
                    onCommit={(v) =>
                      patch({ images: stored.map((s, k) => (k === i ? { ...s, alt: v } : s)) })
                    }
                  />
                </div>
                <IconBtn
                  label={c.remove}
                  small
                  onClick={() => patch({ images: stored.filter((_, k) => k !== i) })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </IconBtn>
              </div>
            ))}
            {canAdd ? (
              <div className="flex flex-wrap gap-2">
                <UploadButton
                  label={c.upload}
                  icon={<Upload className="h-3.5 w-3.5" />}
                  onFile={(dataUri) => addImage(dataUri, undefined, 'upload')}
                />
                {reusable.slice(0, 3).map((image) => (
                  <GhostButton key={image.src} onClick={() => addImage(image.src, image.alt, 'reused')}>
                    <Plus className="h-3.5 w-3.5" />
                    {c.reuse}
                  </GhostButton>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{c.max}</p>
            )}
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-xs font-medium text-muted-foreground">{c.layout}</legend>
            <div className="grid grid-cols-2 gap-2">
              {ABOUT_LAYOUTS.map((layout) => {
                const state = layoutAvailability(layout, shownCount, media?.figure)
                const active = activeLayout === layout
                return (
                  <button
                    key={layout}
                    type="button"
                    disabled={!state.available}
                    aria-pressed={active}
                    title={state.reason ? c.needs[state.reason] : undefined}
                    onClick={() => patch({ layout })}
                    className={`rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      active
                        ? 'border-brand bg-brand/10 text-foreground'
                        : 'border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {c.layouts[layout]}
                    {state.reason ? (
                      <span className="mt-0.5 block text-[11px] font-normal">{c.needs[state.reason]}</span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <TextField
            label={c.badge}
            value={media?.label ?? ''}
            onCommit={(v) => patch({ label: v })}
          />

          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-2 gap-2">
              <TextField
                label={c.figureValue}
                value={media?.figure?.value ?? ''}
                onCommit={(v) =>
                  patch({ figure: { value: v, label: media?.figure?.label ?? '' } })
                }
              />
              <TextField
                label={c.figureLabel}
                value={media?.figure?.label ?? ''}
                onCommit={(v) =>
                  patch({ figure: { value: media?.figure?.value ?? '', label: v } })
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {hasRealFigure(media?.figure) ? c.figureHint : c.figureHint}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <TextField
              label={c.ctaLabel}
              value={media?.cta?.label ?? ''}
              onCommit={(v) => patch({ cta: { label: v, href: media?.cta?.href || '#contact' } })}
            />
            <TextField
              label={c.ctaHref}
              value={media?.cta?.href ?? ''}
              onCommit={(v) => patch({ cta: { label: media?.cta?.label ?? '', href: v } })}
            />
          </div>
        </>
      )}
    </div>
  )
}
