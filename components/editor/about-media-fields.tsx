'use client'

import { useState } from 'react'
import { Plus, Sparkles, Trash2, Upload } from 'lucide-react'
import type { WebsiteSchema } from '@/lib/website-schema'
import type { EditOperation } from '@/lib/website-edit-operations'
import {
  ABOUT_LAYOUTS,
  MAX_ABOUT_IMAGES,
  aboutBadgeLimit,
  aboutImageHint,
  collectReusableImages,
  isUsableImageSrc,
  layoutAvailability,
  suggestAboutAlt,
  usableAboutImages,
  type AboutLayout,
} from '@/lib/about-media'
import { GhostButton, IconBtn, TextField, UploadButton } from '@/components/editor/editor-fields'
import { useEditorProjectId, useSitePublished } from '@/components/editor/published-context'
import { AiImagePreviewPanel } from '@/components/editor/ai-image-preview-panel'

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
    } as Record<AboutLayout, string>,
    needs: {
      'needs-image': 'Önce bir görsel ekleyin.',
      'needs-two-images': 'En az 2 görsel gerekir.',
    } as Record<string, string>,
    images: 'Görseller',
    alt: 'Görsel açıklaması (alt metin)',
    upload: 'Görsel yükle',
    remove: 'Kaldır',
    reuse: 'Sitedeki görsellerden ekle',
    generate: 'AI ile üret (2 kredi)',
    working: 'Hazırlanıyor…',
    suggestAlt: 'AI ile öner (1 kredi)',
    noCredits: 'AI krediniz yetersiz.',
    dailyLimit: 'Günlük ücretsiz işlem limitine ulaştınız.',
    failed: 'Görsel üretilemedi, kredi düşülmedi.',
    badge: 'Rozet metni',
    ctaLabel: 'Buton metni',
    ctaHref: 'Buton bağlantısı',
    max: `En fazla ${MAX_ABOUT_IMAGES} görsel.`,
    hintTitle: '"Hakkımızda" bölümüne görsel ekleyin',
    hintBody: 'Yayındaki siteniz değişmez; görseli eklediğinizde yeniden yayınlayınca görünür.',
    hintAdd: 'Görsel ekle',
    hintClose: 'Önerileri kapat',
  },
  en: {
    heading: 'Section imagery',
    enable: 'Use the image layout',
    layout: 'Layout',
    layouts: {
      corner: 'Corner frame',
      collage: 'Collage',
      round: 'Round',
    } as Record<AboutLayout, string>,
    needs: {
      'needs-image': 'Add an image first.',
      'needs-two-images': 'Needs at least 2 images.',
    } as Record<string, string>,
    images: 'Images',
    alt: 'Image description (alt text)',
    upload: 'Upload image',
    remove: 'Remove',
    reuse: 'Add from the site images',
    generate: 'Generate with AI (2 credits)',
    working: 'Working…',
    suggestAlt: 'Suggest with AI (1 credit)',
    noCredits: 'Not enough AI credits.',
    dailyLimit: 'You reached the free daily action limit.',
    failed: 'Could not generate the image. No credits were used.',
    badge: 'Badge text',
    ctaLabel: 'Button label',
    ctaHref: 'Button link',
    max: `Up to ${MAX_ABOUT_IMAGES} images.`,
    hintTitle: 'Add an image to your About section',
    hintBody: 'Your live site does not change; the image shows up once you publish again.',
    hintAdd: 'Add image',
    hintClose: 'Dismiss suggestion',
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

  const published = useSitePublished()
  const hint = aboutImageHint(site, published)
  const [busy, setBusy] = useState<'image' | `alt:${number}` | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const post = async (url: string, body: Record<string, unknown>) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schema: site, index, ...body }),
    })
    if (res.status === 402) throw new Error(c.noCredits)
    if (res.status === 429) throw new Error(c.dailyLimit)
    if (!res.ok) throw new Error(c.failed)
    return res.json()
  }

  const projectId = useEditorProjectId()

  // The generated image is appended from the CURRENT local state only after the
  // user presses "Kullan"; the server never writes the site itself.
  const useGenerated = (image: { src: string; alt: string }) => {
    if (!isUsableImageSrc(image.src)) {
      setNotice(c.failed)
      return
    }
    addImage(image.src, image.alt || fallbackAlt, 'ai')
  }

  const suggestAlt = async (i: number) => {
    if (busy) return
    setBusy(`alt:${i}`)
    setNotice(null)
    try {
      const data = await post('/api/about-alt', { imageIndex: i })
      if (typeof data.alt !== 'string' || !data.alt.trim()) throw new Error(c.failed)
      patch({ images: stored.map((s, k) => (k === i ? { ...s, alt: data.alt } : s)) })
    } catch (err) {
      setNotice(err instanceof Error ? err.message : c.failed)
    } finally {
      setBusy(null)
    }
  }

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
      {hint === 'published' && (
        <div role="note" className="flex flex-col gap-2 rounded-md border border-brand/40 bg-brand/10 p-3 text-xs">
          <p className="font-medium text-foreground">{c.hintTitle}</p>
          <p className="text-muted-foreground">{c.hintBody}</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={busy !== null || !canAdd}
              onClick={() => patch({ enabled: true, ...(media?.layout ? {} : { layout: 'corner' }) })}
              className="inline-flex items-center gap-1 font-medium text-brand hover:underline disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {c.hintAdd}
            </button>
            <button
              type="button"
              onClick={() => onDispatch({ op: 'dismissHint', hint: 'aboutImage' })}
              className="text-muted-foreground hover:underline"
            >
              {c.hintClose}
            </button>
          </div>
        </div>
      )}
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
                      patch({
                        images: stored.map((s, k) => (k === i ? { ...s, alt: v.trim() || fallbackAlt } : s)),
                      })
                    }
                  />
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void suggestAlt(i)}
                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline disabled:opacity-50"
                  >
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                    {busy === `alt:${i}` ? c.working : c.suggestAlt}
                  </button>
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
            <AiImagePreviewPanel
              site={site}
              index={index}
              projectId={projectId}
              canAdd={canAdd}
              disabled={busy !== null}
              onUse={useGenerated}
            />
            {notice ? (
              <p role="status" className="text-xs text-destructive">
                {notice}
              </p>
            ) : null}
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-xs font-medium text-muted-foreground">{c.layout}</legend>
            <div className="grid grid-cols-2 gap-2">
              {ABOUT_LAYOUTS.map((layout) => {
                const state = layoutAvailability(layout, shownCount)
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
            maxLength={aboutBadgeLimit(media?.label ?? '')}
            onCommit={(v) => patch({ label: v })}
          />

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
