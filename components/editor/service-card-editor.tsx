'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, ChevronUp, Sparkles, Trash2, Upload } from 'lucide-react'
import type { WebsiteSchema } from '@/lib/website-schema'
import type { EditOperation } from '@/lib/website-edit-operations'
import { isUsableImageSrc } from '@/lib/about-media'
import { SERVICE_ITEM_LIMITS } from '@/lib/service-item-limits'
import { canRemoveEntry } from '@/lib/list-limits'
import { servicePath } from '@/lib/service-pages'
import { AI_ACTION_COSTS } from '@/lib/ai-action-costs'
import { suggestServiceAlt } from '@/lib/service-image'
import {
  META_DESCRIPTION_RANGE,
  blocksToText,
  filterServiceIcons,
  hasLegacyServiceSeo,
  metaDescriptionState,
  normalizeServiceText,
  resolveServiceSeo,
  serviceIconLabel,
} from '@/lib/service-card'
import { IconBtn, TextField, UploadButton } from '@/components/editor/editor-fields'
import { AiImagePreviewPanel } from '@/components/editor/ai-image-preview-panel'
import { DynamicIcon } from '@/components/website-renderer/icon'

type ServicesData = Extract<WebsiteSchema['sections'][number], { type: 'services' }>
type ServiceItem = ServicesData['items'][number]
type Lang = 'tr' | 'en'

const COPY = {
  tr: {
    title: 'Başlık',
    googlePreview: "Google'da görünür:",
    description: 'Kısa açıklama',
    shortDescriptionHint: "Anasayfada ve Google'da (meta açıklama) görünür",
    metaBadge: 'META AÇIKLAMA',
    chars: 'karakter',
    icon: 'İkon',
    iconSearch: 'İkon ara…',
    iconNone: 'Eşleşen ikon yok.',
    iconPick: 'İkon seç',
    iconPreview: 'Anasayfada görünüşü',
    image: 'Görsel',
    upload: 'Görsel yükle',
    remove: 'Kaldır',
    alt: 'Alt metin',
    page: 'Hizmet sayfası',
    itemPage: 'Bu hizmetin sayfası açık',
    slug: 'Sayfa adresi',
    content: 'Detaylı açıklama',
    descriptionHint: 'Hizmetinizi ayrıntılı anlatın. Alt başlık için satırı "## " ile başlatın, madde işareti için "- " kullanın.',
    descriptionPlaceholder: '## Hizmet nedir?\nHizmetinizi kısaca anlatın.\n\n## Nasıl çalışır?\n- İlk adım\n- İkinci adım',
    headingWarning: (limit: number) => `Bir alt başlık ${limit} karakter sınırını aşıyor. Yazdığınız metin korunuyor; başlığı kısaltıp tekrar deneyin.`,
    paragraphWarning: (limit: number) => `Bir paragraf ${limit} karakter sınırını aşıyor ve paragraf sınırında bölünemiyor. Yazdığınız metin korunuyor; kısaltın veya paragrafı ayırın.`,
    blockWarning: (count: number, limit: number) => `${count} blok sınırından sonra gelen metin son bloğa ${limit} karakter sınırını aşmadan sığmıyor. Yazdığınız metin korunuyor; kısaltın veya paragrafları ayırın.`,
    moveUp: 'Yukarı taşı',
    moveDown: 'Aşağı taşı',
    aiWrite: 'AI ile metin yaz',
    aiWriting: 'Yazılıyor…',
    aiCostUnit: 'kredi / üretim',
    sample: 'Bu metin platform tarafından örnek olarak hazırlandı. İşletmenize uygunsa onaylayın ya da düzenleyin.',
    approve: 'İçeriği onayla',
    advanced: "Gelişmiş: Google'da farklı göster",
    seoTitle: 'SEO başlığı (eski)',
    seoDescription: 'SEO açıklaması (eski)',
    expand: 'Aç',
    collapse: 'Kapat',
  },
  en: {
    title: 'Title',
    googlePreview: 'Shown on Google as:',
    description: 'Short description',
    shortDescriptionHint: 'Shown on the home page and on Google (meta description)',
    metaBadge: 'META DESCRIPTION',
    chars: 'characters',
    icon: 'Icon',
    iconSearch: 'Search icons…',
    iconNone: 'No matching icon.',
    iconPick: 'Choose icon',
    iconPreview: 'How it looks on the home page',
    image: 'Image',
    upload: 'Upload image',
    remove: 'Remove',
    alt: 'Alt text',
    page: 'Service page',
    itemPage: 'This service has its own page',
    slug: 'Page address',
    content: 'Detailed description',
    descriptionHint: 'Describe your service in detail. Start a line with "## " for a subheading and use "- " for bullet points.',
    descriptionPlaceholder: '## What is the service?\nDescribe the result.\n\n## How it works\n- First step\n- Second step',
    headingWarning: (limit: number) => `A subheading exceeds the ${limit}-character limit. Your text is preserved; shorten the heading to save.`,
    paragraphWarning: (limit: number) => `A paragraph exceeds the ${limit}-character limit and cannot be split at a paragraph boundary. Your text is preserved; shorten or split the paragraph.`,
    blockWarning: (count: number, limit: number) => `Text beyond the ${count}-block limit does not fit in the last block without exceeding ${limit} characters. Your text is preserved; shorten or split paragraphs.`,
    moveUp: 'Move up',
    moveDown: 'Move down',
    aiWrite: 'Write text with AI',
    aiWriting: 'Writing…',
    aiCostUnit: 'credit per generation',
    sample: 'This text was drafted by the platform as a sample. Approve or edit it if it fits your business.',
    approve: 'Approve content',
    advanced: 'Advanced: show something different on Google',
    seoTitle: 'SEO title (legacy)',
    seoDescription: 'SEO description (legacy)',
    expand: 'Expand',
    collapse: 'Collapse',
  },
} as const

type Copy = (typeof COPY)[Lang]

/** A textarea that reports every keystroke and commits valid drafts on blur. */
function DraftArea({
  label,
  value,
  rows,
  hint,
  badge,
  maxLength,
  placeholder,
  resizable = false,
  headerRight,
  syncKey,
  onDraft,
  onCommit,
  describedBy,
}: {
  label: string
  value: string
  rows: number
  hint?: string
  badge?: string
  maxLength?: number
  placeholder?: string
  resizable?: boolean
  headerRight?: React.ReactNode
  syncKey?: unknown
  onDraft?: (draft: string) => void
  onCommit: (value: string) => void | boolean
  describedBy?: string
}) {
  const [draft, setDraft] = useState(value)
  const dirty = useRef(false)
  const previousSyncKey = useRef(syncKey)
  const textareaId = useId()
  const hintId = useId()

  useEffect(() => {
    if (Object.is(previousSyncKey.current, syncKey)) return
    previousSyncKey.current = syncKey
    dirty.current = false
    setDraft(value)
  }, [syncKey, value])

  if (!dirty.current && draft !== value) setDraft(value)

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={textareaId} className="flex items-center gap-2 text-xs text-muted-foreground">
          {label}
          {badge ? (
            <span className="rounded-sm bg-brand/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-brand">
              {badge}
            </span>
          ) : null}
        </label>
        {headerRight}
      </div>
      <textarea
        id={textareaId}
        rows={rows}
        value={draft}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-describedby={[hint ? hintId : '', describedBy ?? ''].filter(Boolean).join(' ') || undefined}
        onChange={(e) => {
          dirty.current = true
          setDraft(e.target.value)
          onDraft?.(e.target.value)
        }}
        onBlur={() => {
          if (draft === value) {
            dirty.current = false
            return
          }
          if (onCommit(draft) !== false) dirty.current = false
        }}
        className={`w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary ${resizable ? 'resize-y' : 'resize-none'}`}
      />
      {hint ? (
        <span id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </div>
  )
}

const STATE_CLASS = {
  good: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-600 dark:text-amber-400',
} as const

/** Searchable icon grid with a preview of the homepage card header. */
export function ServiceIconPicker({
  value,
  title,
  lang,
  c,
  onChange,
}: {
  value: string
  title: string
  lang: Lang
  c: Copy
  onChange: (key: string) => void
}) {
  const [query, setQuery] = useState('')
  const inputId = useId()
  const matches = filterServiceIcons(query)

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-xs text-muted-foreground">
        {c.icon}
      </label>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background p-2" aria-label={c.iconPreview}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand/15 text-brand">
          <DynamicIcon name={value || 'sparkles'} className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="truncate text-sm font-medium">{title}</span>
      </div>
      <input
        id={inputId}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={c.iconSearch}
        className="h-8 rounded-md border border-border bg-background px-2 text-xs"
      />
      <div
        role="group"
        aria-label={c.iconPick}
        className="grid max-h-36 grid-cols-6 gap-1 overflow-y-auto rounded-md border border-border bg-background p-1"
      >
        {matches.map((key) => {
          const active = key === value
          const label = serviceIconLabel(key, lang)
          return (
            <button
              key={key}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={active}
              onClick={() => onChange(key)}
              className={`flex h-8 items-center justify-center rounded-md border text-foreground transition-colors ${
                active ? 'border-brand bg-brand/15 text-brand' : 'border-transparent hover:bg-muted'
              }`}
            >
              <DynamicIcon name={key} className="h-4 w-4" aria-hidden="true" />
            </button>
          )
        })}
        {matches.length === 0 ? (
          <p className="col-span-6 px-1 py-2 text-center text-[11px] text-muted-foreground">{c.iconNone}</p>
        ) : null}
      </div>
    </div>
  )
}

export function ServiceCardEditor({
  site,
  index,
  item,
  itemIndex,
  total,
  lang,
  pageOn,
  listSlug,
  busy,
  writing,
  onWriteWithAi,
  onDispatch,
  projectId,
}: {
  site: WebsiteSchema
  index: number
  item: ServiceItem
  itemIndex: number
  total: number
  lang: Lang
  pageOn: boolean
  listSlug: string
  busy: boolean
  writing: boolean
  onWriteWithAi: () => void
  onDispatch: (op: EditOperation) => void
  projectId: string | null
}) {
  const c = COPY[lang]
  const [open, setOpen] = useState(false)
  const [descDraft, setDescDraft] = useState<string | null>(null)
  const bodyId = useId()

  const blocks = item.detail ?? []
  const itemOn = item.pageEnabled !== false
  const hasImage = isUsableImageSrc(item.src)
  const fallbackAlt = suggestServiceAlt(site, item.title, lang)
  const siteName = site.navigation.logoText
  const seo = resolveServiceSeo(
    { title: item.title, description: item.description, seoTitle: item.seoTitle, seoDescription: item.seoDescription },
    siteName,
  )
  const meta = metaDescriptionState(descDraft ?? item.description)
  const descriptionValue = descDraft ?? blocksToText(blocks)
  const normalizedDescription = normalizeServiceText(descriptionValue)
  const setField = (field: 'title' | 'description' | 'icon', value: string) =>
    onDispatch({ op: 'updateItemField', index, itemIndex, field, value })
  const patchItem = (p: Extract<EditOperation, { op: 'updateServiceItem' }>['patch']) =>
    onDispatch({ op: 'updateServiceItem', index, item: itemIndex, patch: p })

  return (
    <div className="flex flex-col rounded-lg border border-border bg-background/60">
      <div className="flex items-center gap-1 p-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left text-sm font-medium hover:bg-muted"
        >
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand/15 text-brand">
            <DynamicIcon name={item.icon || 'sparkles'} className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span className="truncate">
            {itemIndex + 1}. {item.title || '—'}
          </span>
          <span className="sr-only">{open ? c.collapse : c.expand}</span>
        </button>
        <IconBtn
          label={c.moveUp}
          small
          disabled={itemIndex === 0}
          onClick={() => onDispatch({ op: 'moveItem', index, itemIndex, direction: 'up' })}
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn
          label={c.moveDown}
          small
          disabled={itemIndex === total - 1}
          onClick={() => onDispatch({ op: 'moveItem', index, itemIndex, direction: 'down' })}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn
          label={c.remove}
          small
          disabled={!canRemoveEntry('services', total)}
          onClick={() => onDispatch({ op: 'removeItem', index, itemIndex })}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </IconBtn>
      </div>

      {open && (
        <div id={bodyId} className="flex flex-col gap-4 border-t border-border p-3">
          <div className="flex flex-col gap-1">
            <TextField label={c.title} value={item.title} onCommit={(v) => setField('title', v)} />
            <p className="truncate text-xs text-muted-foreground" aria-live="polite">
              {c.googlePreview} <span className="text-foreground">{seo.title}</span>
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <DraftArea
              label={c.description}
              badge={c.metaBadge}
              hint={c.shortDescriptionHint}
              rows={3}
              value={item.description}
              onDraft={setDescDraft}
              onCommit={(v) => {
                setDescDraft(null)
                setField('description', v)
              }}
            />
            <p
              className={`text-xs ${
                meta.state === 'good' ? STATE_CLASS.good : meta.state === 'empty' ? 'text-muted-foreground' : STATE_CLASS.warn
              }`}
              aria-live="polite"
            >
              {meta.length} {c.chars} ({META_DESCRIPTION_RANGE.min}-{META_DESCRIPTION_RANGE.max})
            </p>
          </div>

          <ServiceIconPicker
            value={item.icon ?? ''}
            title={item.title}
            lang={lang}
            c={c}
            onChange={(key) => setField('icon', key)}
          />

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">{c.image}</span>
            {hasImage && (
              <div className="flex items-start gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.src}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-md border border-border object-cover"
                />
                <div className="flex-1">
                  <TextField
                    label={c.alt}
                    value={item.alt ?? ''}
                    placeholder={fallbackAlt}
                    onCommit={(v) => patchItem({ alt: v.trim() || fallbackAlt })}
                  />
                </div>
                <IconBtn label={c.remove} small onClick={() => patchItem({ src: '', alt: '' })}>
                  <Trash2 className="h-3.5 w-3.5" />
                </IconBtn>
              </div>
            )}
            <UploadButton
              label={c.upload}
              icon={<Upload className="h-3.5 w-3.5" />}
              onFile={(dataUri) => patchItem({ src: dataUri, alt: item.alt || fallbackAlt })}
            />
            <AiImagePreviewPanel
              site={site}
              sectionKey={`services:${index}.${itemIndex}`}
              projectId={projectId}
              canAdd
              disabled={busy}
              onUse={(image) => {
                if (isUsableImageSrc(image.src)) patchItem({ src: image.src, alt: image.alt || fallbackAlt })
              }}
            />
          </div>

          {pageOn && (
            <div className="flex flex-col gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c.page}</span>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--color-brand)]"
                  checked={itemOn}
                  onChange={(e) => patchItem({ pageEnabled: e.target.checked })}
                />
                {c.itemPage}
              </label>

              {itemOn && (
                <>
                  {item.sample ? (
                    <div role="note" className="flex flex-col gap-2 rounded-md border border-brand/40 bg-brand/10 p-3 text-xs">
                      <p className="text-muted-foreground">{c.sample}</p>
                      <button
                        type="button"
                        onClick={() => patchItem({ approve: true })}
                        className="self-start font-medium text-brand hover:underline"
                      >
                        {c.approve}
                      </button>
                    </div>
                  ) : null}

                  <TextField
                    label={c.slug}
                    value={item.slug ?? ''}
                    mono
                    hint={listSlug && item.slug ? servicePath(listSlug, item.slug) : undefined}
                    onCommit={(v) => patchItem({ slug: v })}
                  />

                  <div className="flex flex-col gap-2">
                    <DraftArea
                      label={c.content}
                      value={descriptionValue}
                      rows={12}
                      hint={c.descriptionHint}
                      placeholder={c.descriptionPlaceholder}
                      resizable
                      syncKey={blocks}
                      onDraft={setDescDraft}
                      onCommit={(text) => {
                        const parsed = normalizeServiceText(text)
                        if (parsed.warning) return false
                        setDescDraft(null)
                        patchItem({ blocks: parsed.blocks })
                        return true
                      }}
                      headerRight={
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-xs text-muted-foreground">
                            {AI_ACTION_COSTS.serviceDetail} {c.aiCostUnit}
                          </span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={onWriteWithAi}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline disabled:opacity-50"
                          >
                            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                            {writing ? c.aiWriting : c.aiWrite}
                          </button>
                        </div>
                      }
                    />
                    {normalizedDescription.warning ? (
                      <p role="status" aria-live="polite" className={`text-xs ${STATE_CLASS.warn}`}>
                        {normalizedDescription.warning === 'heading-too-long'
                          ? c.headingWarning(SERVICE_ITEM_LIMITS.blockHeading)
                          : normalizedDescription.warning === 'paragraph-too-long'
                            ? c.paragraphWarning(SERVICE_ITEM_LIMITS.blockBody)
                            : c.blockWarning(SERVICE_ITEM_LIMITS.blocks, SERVICE_ITEM_LIMITS.blockBody)}
                      </p>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          )}

          {hasLegacyServiceSeo(item) && (
            <details className="rounded-md border border-border">
              <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium">{c.advanced}</summary>
              <div className="flex flex-col gap-3 border-t border-border p-3">
                <TextField
                  label={c.seoTitle}
                  value={item.seoTitle ?? ''}
                  maxLength={SERVICE_ITEM_LIMITS.seoTitle}
                  onCommit={(v) => patchItem({ seoTitle: v })}
                />
                <TextField
                  label={c.seoDescription}
                  value={item.seoDescription ?? ''}
                  multiline
                  rows={2}
                  maxLength={SERVICE_ITEM_LIMITS.seoDescription}
                  onCommit={(v) => patchItem({ seoDescription: v })}
                />
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
