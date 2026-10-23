'use client'

import { useRef, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Images,
  ImageIcon,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react'
import { TextField, IconBtn } from '@/components/editor/editor-fields'
import { useLanguage } from '@/components/language-provider'
import {
  HERO_SLIDE_MAX,
  HERO_SLIDE_MIN,
  collectSiteImages,
  heroLinkOptions,
  heroSlideViews,
  isSafeHeroHref,
  recommendedHeroSize,
  slideMissingAlt,
  validateHeroUpload,
} from '@/lib/hero-slides'
import type { HeroSlideView } from '@/lib/hero-slides'
import type { EditOperation } from '@/lib/website-edit-operations'
import type { Section, WebsiteSchema } from '@/lib/website-schema'

type HeroSection = Extract<Section, { type: 'hero' }>

type Props = {
  hero: HeroSection
  site: WebsiteSchema
  onDispatch: (op: EditOperation) => void
  onRegenerateHeroImage?: (request: string) => void
  onRegenerateSlideImage?: (slideIndex: number, request: string) => void
  heroImageWorking: boolean
  workingSlide?: number | null
}

/**
 * Every hero is edited as a list of slides. A hero without a `slides` array is
 * its own single slide, so the same controls (and the same ops, routed by
 * `hasSlides`) cover both shapes.
 */
export function HeroSlidesField({
  hero,
  site,
  onDispatch,
  onRegenerateHeroImage,
  onRegenerateSlideImage,
  heroImageWorking,
  workingSlide = null,
}: Props) {
  const { t } = useLanguage()
  const ui = t.editor.ui
  const views = heroSlideViews(hero)
  const hasSlides = (hero.slides?.length ?? 0) > 0
  const size = recommendedHeroSize(hero.layout ?? 'split')
  const sizeNote = size.note === 'side' ? ui.heroSizeSide : size.note === 'cover' ? ui.heroSizeCover : ui.heroSizeStandard
  const canAdd = views.length < HERO_SLIDE_MAX
  const canRemove = hasSlides && views.length > HERO_SLIDE_MIN
  const siteImages = collectSiteImages(site)

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium">{ui.heroSlidesTitle}</span>
        <p className="text-[11px] leading-snug text-muted-foreground">{ui.heroSlidesIntro}</p>
        <p className="text-[11px] leading-snug text-muted-foreground">{sizeNote}</p>
      </div>

      {views.map((view, index) => (
        <SlideCard
          key={index}
          index={index}
          view={view}
          total={views.length}
          site={site}
          siteImages={siteImages}
          canRemove={canRemove}
          working={hasSlides ? workingSlide === index : heroImageWorking}
          onDispatch={onDispatch}
          onImagePatch={(patch) =>
            onDispatch(
              hasSlides
                ? { op: 'updateSlideImage', slideIndex: index, patch }
                : { op: 'updateHeroImage', patch },
            )
          }
          onRegenerate={
            hasSlides
              ? onRegenerateSlideImage
                ? (request) => onRegenerateSlideImage(index, request)
                : undefined
              : onRegenerateHeroImage
          }
        />
      ))}

      {canAdd && (
        <button
          type="button"
          onClick={() => onDispatch({ op: 'addHeroSlide' })}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs font-medium transition-colors hover:border-primary hover:text-primary"
        >
          <Plus className="h-4 w-4" />
          {ui.slideAdd} ({views.length}/{HERO_SLIDE_MAX})
        </button>
      )}
    </div>
  )
}

function SlideCard({
  index,
  view,
  total,
  site,
  siteImages,
  canRemove,
  working,
  onDispatch,
  onImagePatch,
  onRegenerate,
}: {
  index: number
  view: HeroSlideView
  total: number
  site: WebsiteSchema
  siteImages: { src: string; alt: string }[]
  canRemove: boolean
  working: boolean
  onDispatch: (op: EditOperation) => void
  onImagePatch: (patch: { imagePrompt?: string; src?: string; alt?: string }) => void
  onRegenerate?: (request: string) => void
}) {
  const { t } = useLanguage()
  const ui = t.editor.ui
  const current = view.image?.imagePrompt ?? ''
  const [draft, setDraft] = useState(current)
  const dirtyRef = useRef(false)
  if (!dirtyRef.current && draft !== current) setDraft(current)

  const [uploadError, setUploadError] = useState<string | null>(null)
  const [linkError, setLinkError] = useState(false)
  const [picking, setPicking] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const src = view.image?.src ?? ''
  const missingAlt = slideMissingAlt(view)
  const pages = heroLinkOptions(site)
  const selectedPage = pages.some((p) => p.href === view.buttonHref) ? view.buttonHref : ''

  const patchSlide = (patch: { title?: string; description?: string; buttonLabel?: string; buttonHref?: string }) =>
    onDispatch({ op: 'updateHeroSlide', slideIndex: index, patch })

  function handleFile(file: File | undefined) {
    if (!file) return
    const check = validateHeroUpload(file)
    if (!check.ok) {
      setUploadError(check.reason === 'type' ? ui.slideUploadBadType : ui.slideUploadTooBig)
      return
    }
    setUploadError(null)
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      if (result) onImagePatch({ src: result })
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold">
            {ui.slideLabel} {index + 1}
          </span>
          {index === 0 && (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
              {ui.slideFirstBadge}
            </span>
          )}
        </div>
        {total > 1 && (
          <div className="flex items-center">
            <IconBtn
              small
              label={ui.slideMoveUp}
              disabled={index === 0}
              onClick={() => onDispatch({ op: 'moveHeroSlide', from: index, to: index - 1 })}
            >
              <ChevronUp className="h-4 w-4" />
            </IconBtn>
            <IconBtn
              small
              label={ui.slideMoveDown}
              disabled={index === total - 1}
              onClick={() => onDispatch({ op: 'moveHeroSlide', from: index, to: index + 1 })}
            >
              <ChevronDown className="h-4 w-4" />
            </IconBtn>
            {canRemove && (
              <IconBtn small label={ui.slideRemove} onClick={() => onDispatch({ op: 'removeHeroSlide', slideIndex: index })}>
                <Trash2 className="h-4 w-4" />
              </IconBtn>
            )}
          </div>
        )}
      </div>

      <TextField label={ui.slideTitle} value={view.title} onCommit={(v) => patchSlide({ title: v })} />
      <TextField
        label={ui.slideSubtitle}
        multiline
        rows={2}
        value={view.description}
        onCommit={(v) => patchSlide({ description: v })}
      />
      <TextField label={ui.slideButtonLabel} value={view.buttonLabel} onCommit={(v) => patchSlide({ buttonLabel: v })} />

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{ui.slideButtonHref}</span>
        <select
          aria-label={ui.slideLinkPage}
          value={selectedPage}
          onChange={(e) => {
            setLinkError(false)
            patchSlide({ buttonHref: e.target.value })
          }}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary"
        >
          <option value="">{view.buttonHref && !selectedPage ? ui.slideLinkCustom : ui.slideLinkNone}</option>
          {pages.map((p) => (
            <option key={p.href} value={p.href}>
              {p.label}
            </option>
          ))}
        </select>
        <TextField
          label={ui.slideLinkCustom}
          value={view.buttonHref}
          placeholder="https://..."
          onCommit={(v) => {
            if (!isSafeHeroHref(v)) {
              setLinkError(true)
              return
            }
            setLinkError(false)
            patchSlide({ buttonHref: v.trim() })
          }}
        />
        {linkError && (
          <span role="alert" className="text-[11px] text-destructive">
            {ui.slideLinkInvalid}
          </span>
        )}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{ui.heroImage}</span>
        <textarea
          rows={2}
          value={draft}
          placeholder={ui.heroImageHint}
          onChange={(e) => {
            dirtyRef.current = true
            setDraft(e.target.value)
          }}
          onBlur={() => {
            dirtyRef.current = false
            if (draft !== current) onImagePatch({ imagePrompt: draft })
          }}
          className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary placeholder:text-muted-foreground"
        />
      </label>

      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary remote/data URI preview
        <img
          src={src}
          alt={view.image?.alt ?? ''}
          className="h-24 w-full rounded-lg border border-border object-cover"
        />
      ) : null}

      <TextField
        label={ui.slideAlt}
        value={view.image?.alt ?? ''}
        hint={ui.slideAltHint}
        onCommit={(v) => onImagePatch({ alt: v })}
      />
      {missingAlt && (
        <span role="status" className="flex items-center gap-1 text-[11px] text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" />
          {ui.slideAltMissing}
        </span>
      )}

      {onRegenerate && (
        <button
          type="button"
          onClick={() => {
            const request = draft.trim()
            dirtyRef.current = false
            if (request && request !== current) onImagePatch({ imagePrompt: request })
            onRegenerate(request)
          }}
          disabled={working}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-sm font-medium transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
        >
          {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
          {working ? ui.heroImageWorking : ui.heroImageRegenerate}
        </button>
      )}

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-medium transition-colors hover:border-primary hover:text-primary"
      >
        <Upload className="h-4 w-4" />
        {ui.heroImageUpload}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          handleFile(file)
        }}
      />
      <span className="text-[11px] text-muted-foreground">{ui.slideImageUploadHint}</span>
      {uploadError && (
        <span role="alert" className="text-[11px] text-destructive">
          {uploadError}
        </span>
      )}

      <button
        type="button"
        onClick={() => setPicking((v) => !v)}
        aria-expanded={picking}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-medium transition-colors hover:border-primary hover:text-primary"
      >
        <Images className="h-4 w-4" />
        {picking ? ui.slidePickClose : ui.slidePickExisting}
      </button>
      {picking &&
        (siteImages.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">{ui.slideNoExisting}</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {siteImages.map((img) => (
              <button
                key={img.src}
                type="button"
                onClick={() => {
                  onImagePatch({ src: img.src, ...(img.alt ? { alt: img.alt } : {}) })
                  setPicking(false)
                }}
                className="overflow-hidden rounded-md border border-border transition-colors hover:border-primary"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary remote/data URI preview */}
                <img src={img.src} alt={img.alt} className="h-14 w-full object-cover" />
              </button>
            ))}
          </div>
        ))}
    </div>
  )
}
