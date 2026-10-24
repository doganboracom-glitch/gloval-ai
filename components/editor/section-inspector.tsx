'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import useSWR from 'swr'
import { ChevronDown, ChevronUp, ImageIcon, Loader2, Plus, Trash2, Upload } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { canAddEntry, canRemoveEntry, limitReason } from '@/lib/list-limits'
import {
  ANNOUNCEMENT_MAX_ITEMS,
  ANNOUNCEMENT_SPEEDS,
  ANNOUNCEMENT_TEXT_MAX,
  isStorefront,
  type WebsiteSchema,
} from '@/lib/website-schema'
import { isInvalidAnnouncementLink } from '@/lib/announcement'
import { VIEW_ALL_DEFAULT } from '@/lib/store-header-links'
import { listOwnerCollections } from '@/lib/store-collections-actions'
import {
  resolveShowcaseSettings,
  SHOWCASE_LIMITS,
  SHOWCASE_SOURCES,
  showcaseEditorState,
} from '@/lib/store-showcase'
import {
  collectionOf,
  IMAGE_ITEM_SECTIONS,
  type EditOperation,
} from '@/lib/website-edit-operations'
import { GhostButton, IconBtn, TextField, UploadButton } from '@/components/editor/editor-fields'
import { MapEmbedField } from '@/components/editor/map-embed-field'
import { AboutMediaFields } from '@/components/editor/about-media-fields'
import { AboutDetailFields } from '@/components/editor/about-detail-fields'
import { AboutCopyFields } from '@/components/editor/about-copy-fields'
import { ServiceDetailFields } from '@/components/editor/service-detail-fields'
import { ProductItemFields } from '@/components/editor/product-item-fields'
import { GalleryFields, GalleryItemExtras } from '@/components/editor/gallery-fields'
import { TestimonialsFields } from '@/components/editor/testimonials-fields'
import { ReferencesFields } from '@/components/editor/references-fields'
import { TeamFields } from '@/components/editor/team-fields'
import { useProductsManaged } from '@/components/editor/published-context'
import { HeroStripFields } from '@/components/editor/hero-strip-fields'
import { FooterLinksEditor } from '@/components/editor/footer-links-editor'

/**
 * SectionInspector
 * ----------------
 * Full manual control over ONE section, generated from the data instead of a
 * hand-written form per section type:
 *  - every scalar text field the section carries,
 *  - its buttons (label + link),
 *  - its plain string lists (about highlights, contact form fields),
 *  - every item of its collection (services, plans, steps, members, columns…)
 *    with add / remove / reorder, and per-item image upload + regeneration.
 *
 * It owns no state: each change is emitted as a typed EditOperation, so the
 * parent's undo/redo history and autosave keep working unchanged.
 */

/** Scalar section fields, in the order they should appear. */
const SCALAR_FIELDS = [
  'badge',
  'title',
  'subtitle',
  'description',
  'body',
  'trustText',
  'tagline',
  'email',
  'phone',
  'address',
  'copyright',
] as const

/** Long-form fields that get a textarea. */
const LONG_FIELDS = new Set(['description', 'body', 'bio', 'quote', 'answer'])

/** Item fields, in the order they should appear. */
const ITEM_FIELDS = [
  'name',
  'title',
  'question',
  'quote',
  'author',
  'role',
  'category',
  'value',
  'label',
  'price',
  'oldPrice',
  'period',
  'description',
  'bio',
  'answer',
  'caption',
  'buttonText',
  'icon',
  'link',
] as const

/** Plain string arrays that can be edited entry by entry. */
const STRING_LIST_FIELDS = ['highlights', 'fields'] as const

export function SectionInspector({
  site,
  index,
  onDispatch,
  onRegenerateItemImage,
  workingItem = null,
}: {
  site: WebsiteSchema
  index: number
  onDispatch: (op: EditOperation) => void
  /** Regenerates one item's image from a freeform description or a URL. */
  onRegenerateItemImage?: (index: number, itemIndex: number, request: string) => void
  /** `"sectionIndex:itemIndex"` of the image currently being generated. */
  workingItem?: string | null
}) {
  const { t } = useLanguage()
  const ui = t.editor.ui
  const section = site.sections[index]
  if (!section) return null

  const record = section as unknown as Record<string, unknown>
  const isContact = section.type === 'contact'
  const scalars = SCALAR_FIELDS.filter(
    (f) => typeof record[f] === 'string' && !(isContact && f === 'address'),
  )
  const items = collectionOf(section) ?? []
  const hasImages = IMAGE_ITEM_SECTIONS.includes(section.type)
  const label = (field: string) => ui.fieldLabels[field] ?? field
  const params = useParams<{ projectId?: string }>()
  const projectId = typeof params?.projectId === 'string' ? params.projectId : null
  const productsManagedByProject = useProductsManaged()
  const managedProducts =
    section.type === 'products' && isStorefront(site) && (productsManagedByProject ?? true)

  return (
    <div className="mt-2 flex flex-col gap-3 border-t border-border pt-2">
      {scalars.map((field) => (
        <TextField
          key={field}
          label={label(field)}
          multiline={LONG_FIELDS.has(field)}
          value={String(record[field] ?? '')}
          onCommit={(v) => onDispatch({ op: 'updateSectionValue', index, field, value: v })}
        />
      ))}

      {isContact && (
        <TextField
          label={label('contactAddress')}
          hint={label('contactAddressHint')}
          placeholder={site.meta.language === 'tr' ? 'Örn. Luna Mücevher, Kadıköy İstanbul' : 'e.g. Luna Jewelry, Brooklyn New York'}
          value={String(record.address ?? '')}
          onCommit={(v) => onDispatch({ op: 'updateSectionValue', index, field: 'address', value: v.trim() })}
        />
      )}

      {section.type === 'contact' && (
        <TextField
          label={label('recipientEmail')}
          value={String(record.recipientEmail ?? '')}
          onCommit={(v) => onDispatch({ op: 'updateSectionValue', index, field: 'recipientEmail', value: v.trim() })}
        />
      )}

      {section.type === 'contact' && site.navigation.logo?.src && !isStorefront(site) && (
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-background p-2">
          <input
            type="checkbox"
            checked={section.showLogo !== false}
            onChange={(e) => onDispatch({ op: 'setContactShowLogo', index, show: e.target.checked })}
            className="mt-0.5 h-3.5 w-3.5 accent-[var(--color-brand)]"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-xs font-medium">{label('showLogo')}</span>
            <span className="text-[11px] leading-snug text-muted-foreground">{label('showLogoHint')}</span>
          </span>
        </label>
      )}

      {section.type === 'contact' && (
        <MapEmbedField
          value={String(record.mapEmbed ?? '')}
          lang={site.meta.language}
          onCommit={(src) => onDispatch({ op: 'updateSectionValue', index, field: 'mapEmbed', value: src })}
        />
      )}

      {(['primary', 'secondary'] as const).map((which) => {
        const key = which === 'primary' ? 'primaryButton' : 'secondaryButton'
        const button = record[key] as { label?: string; href?: string } | undefined
        if (!button) return null
        return (
          <div key={key} className="grid grid-cols-2 gap-2">
            <TextField
              label={which === 'primary' ? ui.primaryButton : ui.secondaryButton}
              value={button.label ?? ''}
              onCommit={(v) =>
                onDispatch({ op: 'updateSectionButton', index, which, field: 'label', value: v })
              }
            />
            <TextField
              label={ui.linkTarget}
              value={button.href ?? ''}
              onCommit={(v) =>
                onDispatch({ op: 'updateSectionButton', index, which, field: 'href', value: v })
              }
            />
          </div>
        )
      })}

      {STRING_LIST_FIELDS.map((field) => {
        const list = record[field]
        if (!Array.isArray(list)) return null
        return (
          <div key={field} className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{label(field)}</span>
            {(list as string[]).map((entry, itemIndex) => (
              <div key={itemIndex} className="flex items-end gap-1">
                <div className="flex-1">
                  <TextField
                    label={`${itemIndex + 1}`}
                    value={entry}
                    onCommit={(v) =>
                      onDispatch({ op: 'updateStringListItem', index, field, itemIndex, value: v })
                    }
                  />
                </div>
                <IconBtn
                  label={ui.remove}
                  small
                  onClick={() =>
                    onDispatch({ op: 'updateStringListItem', index, field, itemIndex, value: null })
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </IconBtn>
              </div>
            ))}
            <GhostButton
              onClick={() => onDispatch({ op: 'addStringListItem', index, field, value: '' })}
            >
              <Plus className="h-3.5 w-3.5" />
              {ui.addEntry}
            </GhostButton>
          </div>
        )
      })}

      {section.type === 'about' && (
        <>
          <AboutMediaFields site={site} index={index} section={section} onDispatch={onDispatch} />
          <AboutCopyFields site={site} index={index} section={section} onDispatch={onDispatch} />
          <AboutDetailFields site={site} index={index} section={section} onDispatch={onDispatch} />
        </>
      )}

      {section.type === 'services' && (
        <ServiceDetailFields site={site} index={index} section={section} onDispatch={onDispatch} />
      )}

      {section.type === 'gallery' && (
        <GalleryFields site={site} index={index} section={section} onDispatch={onDispatch} />
      )}

      {section.type === 'testimonials' && (
        <TestimonialsFields site={site} index={index} section={section} onDispatch={onDispatch} />
      )}

      {section.type === 'references' && (
        <ReferencesFields site={site} index={index} section={section} onDispatch={onDispatch} />
      )}

      {section.type === 'team' && (
        <TeamFields site={site} index={index} section={section} onDispatch={onDispatch} />
      )}

      {section.type === 'products' && !managedProducts && (
        <ProductItemFields site={site} index={index} section={section} onDispatch={onDispatch} />
      )}

      {managedProducts && (
        <ProductsShowcaseSettings
          index={index}
          section={record}
          projectId={projectId}
          onDispatch={onDispatch}
        />
      )}

      {section.type === 'footer' && (
        <FooterLinksEditor site={site} index={index} onDispatch={onDispatch} />
      )}

      {section.type === 'announcement' && (
        <AnnouncementSettings
          index={index}
          section={section}
          lang={site.meta.language}
          onDispatch={onDispatch}
        />
      )}

      {section.type === 'announcement' && (
        <AnnouncementItems
          index={index}
          items={section.items}
          lang={site.meta.language}
          onDispatch={onDispatch}
        />
      )}

      {section.type === 'heroStrip' && (
        <HeroStripFields index={index} section={section} lang={site.meta.language} onDispatch={onDispatch} />
      )}

      {!managedProducts && section.type !== 'footer' && section.type !== 'announcement' && section.type !== 'testimonials' && section.type !== 'references' && section.type !== 'team' && section.type !== 'heroStrip' && items.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">{ui.itemsLabel}</span>
          {items.map((item, itemIndex) => (
            <ItemCard
              key={itemIndex}
              item={item}
              index={index}
              itemIndex={itemIndex}
              total={items.length}
              sectionType={section.type}
              hasImages={hasImages}
              gallery={section.type === 'gallery' ? { site, section } : undefined}
              working={workingItem === `${index}:${itemIndex}`}
              onDispatch={onDispatch}
              onRegenerateItemImage={onRegenerateItemImage}
            />
          ))}
          <GhostButton
            disabled={!canAddEntry(section.type, items.length)}
            onClick={() => onDispatch({ op: 'addItem', index })}
          >
            <Plus className="h-3.5 w-3.5" />
            {ui.addItem}
          </GhostButton>
          {!canAddEntry(section.type, items.length) && (
            <p className="text-xs text-muted-foreground" data-testid="list-limit-add-reason">
              {limitReason(section.type, 'add', site.meta.language === 'en' ? 'en' : 'tr')}
            </p>
          )}
          {!canRemoveEntry(section.type, items.length) && (
            <p className="text-xs text-muted-foreground" data-testid="list-limit-remove-reason">
              {limitReason(section.type, 'remove', site.meta.language === 'en' ? 'en' : 'tr')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

const SPEED_LABELS = {
  tr: { slow: 'Yavaş', normal: 'Normal', fast: 'Hızlı' },
  en: { slow: 'Slow', normal: 'Normal', fast: 'Fast' },
} as const

function AnnouncementSettings({
  index,
  section,
  lang,
  onDispatch,
}: {
  index: number
  section: Extract<WebsiteSchema['sections'][number], { type: 'announcement' }>
  lang: 'tr' | 'en'
  onDispatch: (op: EditOperation) => void
}) {
  const tr = lang === 'tr'
  const toggles = [
    {
      key: 'pauseOnHover' as const,
      label: tr ? 'Üzerine gelince durdur' : 'Pause on hover',
      checked: section.pauseOnHover !== false,
    },
    {
      key: 'dismissible' as const,
      label: tr ? 'Ziyaretçi kapatabilsin' : 'Allow visitors to dismiss',
      checked: section.dismissible === true,
    },
    {
      key: 'useAccentColor' as const,
      label: tr ? 'Vurgu rengini kullan' : 'Use accent color',
      checked: section.useAccentColor === true,
    },
  ]
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">
        {tr ? 'Kayma hızı' : 'Scroll speed'}
      </span>
      <div className="flex gap-1" role="group" aria-label={tr ? 'Kayma hızı' : 'Scroll speed'}>
        {ANNOUNCEMENT_SPEEDS.map((speed) => (
          <button
            key={speed}
            type="button"
            aria-pressed={(section.speed ?? 'normal') === speed}
            onClick={() => onDispatch({ op: 'updateAnnouncement', index, patch: { speed } })}
            className="min-h-9 flex-1 cursor-pointer rounded-md border border-border px-2 text-xs font-medium transition-colors hover:bg-muted aria-pressed:border-brand/60 aria-pressed:bg-brand/15 aria-pressed:text-foreground"
          >
            {SPEED_LABELS[lang][speed]}
          </button>
        ))}
      </div>
      {toggles.map((toggle) => (
        <label key={toggle.key} className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={toggle.checked}
            onChange={(e) =>
              onDispatch({ op: 'updateAnnouncement', index, patch: { [toggle.key]: e.target.checked } })
            }
            className="size-4 cursor-pointer accent-[var(--color-brand)]"
          />
          {toggle.label}
        </label>
      ))}
    </div>
  )
}

function AnnouncementItems({
  index,
  items,
  lang,
  onDispatch,
}: {
  index: number
  items: { text: string; link?: string }[]
  lang: 'tr' | 'en'
  onDispatch: (op: EditOperation) => void
}) {
  const tr = lang === 'tr'
  const atLimit = items.length >= ANNOUNCEMENT_MAX_ITEMS
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">
        {tr ? 'Duyurular' : 'Announcements'} ({items.length}/{ANNOUNCEMENT_MAX_ITEMS})
      </span>
      {items.map((item, itemIndex) => (
        <div key={itemIndex} className="flex flex-col gap-2 rounded-lg border border-border bg-background/60 p-2">
          <div className="flex items-center gap-1">
            <span className="flex-1 truncate text-xs font-semibold text-muted-foreground">
              {itemIndex + 1}. {item.text}
            </span>
            <IconBtn
              label={tr ? 'Yukarı taşı' : 'Move up'}
              small
              disabled={itemIndex === 0}
              onClick={() => onDispatch({ op: 'moveItem', index, itemIndex, direction: 'up' })}
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn
              label={tr ? 'Aşağı taşı' : 'Move down'}
              small
              disabled={itemIndex === items.length - 1}
              onClick={() => onDispatch({ op: 'moveItem', index, itemIndex, direction: 'down' })}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn
              label={tr ? 'Sil' : 'Remove'}
              small
              disabled={!canRemoveEntry('announcement', items.length)}
              onClick={() => onDispatch({ op: 'removeItem', index, itemIndex })}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </IconBtn>
          </div>
          <TextField
            label={tr ? 'Duyuru metni' : 'Announcement text'}
            multiline
            rows={2}
            value={item.text}
            hint={`${item.text.length}/${ANNOUNCEMENT_TEXT_MAX}`}
            onCommit={(v) => onDispatch({ op: 'updateItemField', index, itemIndex, field: 'text', value: v })}
          />
          <TextField
            label={tr ? 'Bağlantı (isteğe bağlı)' : 'Link (optional)'}
            value={item.link ?? ''}
            placeholder="https://… / /sayfa / #bolum"
            hint={
              isInvalidAnnouncementLink(item.link)
                ? tr
                  ? 'Geçersiz bağlantı: yalnızca https://, /yol veya #bağlantı kullanın. Şu an düz metin olarak görünür.'
                  : 'Invalid link: use https://, /path or #anchor only. It currently shows as plain text.'
                : undefined
            }
            onCommit={(v) => onDispatch({ op: 'updateItemField', index, itemIndex, field: 'link', value: v })}
          />
        </div>
      ))}
      <GhostButton disabled={atLimit} onClick={() => onDispatch({ op: 'addItem', index })}>
        <Plus className="h-3.5 w-3.5" />
        {atLimit
          ? tr
            ? `En fazla ${ANNOUNCEMENT_MAX_ITEMS} duyuru eklenebilir`
            : `Up to ${ANNOUNCEMENT_MAX_ITEMS} announcements`
          : tr
            ? 'Duyuru ekle'
            : 'Add announcement'}
      </GhostButton>
    </div>
  )
}

function ProductsShowcaseSettings({
  index,
  section,
  projectId,
  onDispatch,
}: {
  index: number
  section: Record<string, unknown>
  projectId: string | null
  onDispatch: (op: EditOperation) => void
}) {
  const { t, lang } = useLanguage()
  const ui = t.editor.ui
  const settings = resolveShowcaseSettings(section)
  const viewAllLang = lang === 'tr' ? 'tr' : 'en'
  const selectClass =
    'h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground'
  const { data: collectionData } = useSWR(
    projectId ? ['owner-collections', projectId] : null,
    ([, id]) => listOwnerCollections(id),
    { revalidateOnFocus: false },
  )
  const collections = collectionData?.collections ?? []
  const { boundSlug, boundMissing, showPicker, sourceDisabled } = showcaseEditorState(
    section,
    collections,
  )

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background/60 p-2">
      <p className="text-xs leading-relaxed text-muted-foreground">{ui.showcaseManaged}</p>

      {showPicker && (
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          {ui.showcaseCollection}
          <select
            className={selectClass}
            value={boundSlug ?? ''}
            onChange={(e) =>
              onDispatch({ op: 'updateProductsShowcase', index, collection: e.target.value || null })
            }
          >
            <option value="">{ui.showcaseCollectionNone}</option>
            {boundMissing && boundSlug && <option value={boundSlug}>{boundSlug}</option>}
            {collections.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="font-normal">
            {boundMissing ? ui.showcaseCollectionMissing : ui.showcaseCollectionHint}
          </span>
        </label>
      )}

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        {ui.showcaseSource}
        <select
          className={selectClass}
          disabled={sourceDisabled}
          value={settings.source}
          onChange={(e) =>
            onDispatch({
              op: 'updateProductsShowcase',
              index,
              source: e.target.value as (typeof SHOWCASE_SOURCES)[number],
            })
          }
        >
          {SHOWCASE_SOURCES.map((source) => (
            <option key={source} value={source}>
              {ui.showcaseSources[source]}
            </option>
          ))}
        </select>
      </label>
      {settings.source === 'manual' && (
        <p className="text-xs leading-relaxed text-muted-foreground">{ui.showcaseManualHint}</p>
      )}

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        {ui.showcaseLimit}
        <select
          className={selectClass}
          value={settings.limit}
          onChange={(e) =>
            onDispatch({
              op: 'updateProductsShowcase',
              index,
              limit: Number(e.target.value) as (typeof SHOWCASE_LIMITS)[number],
            })
          }
        >
          {SHOWCASE_LIMITS.map((limit) => (
            <option key={limit} value={limit}>
              {limit}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        {ui.showcaseViewAll}
        <input
          type="text"
          className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
          value={
            typeof section.viewAllLabel === 'string'
              ? section.viewAllLabel
              : VIEW_ALL_DEFAULT[viewAllLang]
          }
          onChange={(e) =>
            onDispatch({ op: 'updateProductsShowcase', index, viewAllLabel: e.target.value })
          }
        />
        <span className="font-normal">{ui.showcaseViewAllHint}</span>
      </label>

      {projectId && (
        <Link
          href={`/ecommerce/${projectId}`}
          className="inline-flex h-9 items-center justify-center rounded-md border border-brand/40 px-3 text-sm font-medium text-brand hover:bg-brand/10"
        >
          {ui.manageProducts}
        </Link>
      )}
    </div>
  )
}

function ItemCard({
  item,
  index,
  itemIndex,
  total,
  sectionType,
  hasImages,
  gallery,
  working,
  onDispatch,
  onRegenerateItemImage,
}: {
  item: Record<string, unknown>
  index: number
  itemIndex: number
  total: number
  sectionType: string
  hasImages: boolean
  /** Gallery items get an album picker and a required alt text instead of the generic alt field. */
  gallery?: { site: WebsiteSchema; section: Extract<WebsiteSchema['sections'][number], { type: 'gallery' }> }
  working: boolean
  onDispatch: (op: EditOperation) => void
  onRegenerateItemImage?: (index: number, itemIndex: number, request: string) => void
}) {
  const { t } = useLanguage()
  const ui = t.editor.ui
  const label = (field: string) => ui.fieldLabels[field] ?? field
  const fields = ITEM_FIELDS.filter((f) => typeof item[f] === 'string')
  const features = Array.isArray(item.features) ? (item.features as string[]) : null
  const links = Array.isArray(item.links)
    ? (item.links as { label: string; href: string }[])
    : null
  const src = typeof item.src === 'string' ? item.src : ''
  const imagePrompt = typeof item.imagePrompt === 'string' ? item.imagePrompt : ''

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-background/60 p-2">
      <div className="flex items-center gap-1">
        <span className="flex-1 truncate text-xs font-semibold text-muted-foreground">
          {itemIndex + 1}. {String(item.title ?? item.name ?? item.label ?? item.question ?? '')}
        </span>
        <IconBtn
          label={ui.moveUp}
          small
          disabled={itemIndex === 0}
          onClick={() => onDispatch({ op: 'moveItem', index, itemIndex, direction: 'up' })}
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn
          label={ui.moveDown}
          small
          disabled={itemIndex === total - 1}
          onClick={() => onDispatch({ op: 'moveItem', index, itemIndex, direction: 'down' })}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn
          label={ui.remove}
          small
          disabled={!canRemoveEntry(sectionType, total)}
          onClick={() => onDispatch({ op: 'removeItem', index, itemIndex })}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </IconBtn>
      </div>

      {fields.map((field) => (
        <TextField
          key={field}
          label={label(field)}
          multiline={LONG_FIELDS.has(field)}
          rows={2}
          value={String(item[field] ?? '')}
          onCommit={(v) => onDispatch({ op: 'updateItemField', index, itemIndex, field: field, value: v })}
        />
      ))}

      {gallery && (
        <GalleryItemExtras
          site={gallery.site}
          index={index}
          itemIndex={itemIndex}
          section={gallery.section}
          onDispatch={onDispatch}
        />
      )}

      {features && (
        <TextField
          label={ui.fieldLabels.features}
          multiline
          value={features.join('\n')}
          onCommit={(v) =>
            onDispatch({
              op: 'updateItemList',
              index,
              itemIndex,
              field: 'features',
              values: v
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean),
            })
          }
        />
      )}

      {links && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">{ui.fieldLabels.links}</span>
          {links.map((link, linkIndex) => (
            <div key={linkIndex} className="flex items-end gap-1">
              <div className="grid flex-1 grid-cols-2 gap-1.5">
                <TextField
                  label={ui.fieldLabels.label}
                  value={link.label}
                  onCommit={(v) =>
                    onDispatch({ op: 'updateItemLink', index, itemIndex, linkIndex, field: 'label', value: v })
                  }
                />
                <TextField
                  label={ui.linkTarget}
                  value={link.href}
                  onCommit={(v) =>
                    onDispatch({ op: 'updateItemLink', index, itemIndex, linkIndex, field: 'href', value: v })
                  }
                />
              </div>
              <IconBtn
                label={ui.remove}
                small
                onClick={() =>
                  onDispatch({ op: 'updateItemLink', index, itemIndex, linkIndex, field: 'label', value: null })
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
              </IconBtn>
            </div>
          ))}
          <GhostButton onClick={() => onDispatch({ op: 'addItemLink', index, itemIndex, label: '' })}>
            <Plus className="h-3.5 w-3.5" />
            {ui.addEntry}
          </GhostButton>
        </div>
      )}

      {hasImages && (
        <div className="flex flex-col gap-2">
          <TextField
            label={ui.imageDescription}
            multiline
            rows={2}
            value={imagePrompt}
            placeholder={ui.heroImageHint}
            onCommit={(v) => onDispatch({ op: 'updateItemImage', index, itemIndex, imagePrompt: v })}
          />
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary remote/data URI preview
            <img
              src={src || '/placeholder.svg'}
              alt=""
              className="h-20 w-full rounded-lg border border-border object-cover"
            />
          ) : null}
          {onRegenerateItemImage && (
            <GhostButton
              disabled={working}
              onClick={() => onRegenerateItemImage(index, itemIndex, imagePrompt)}
            >
              {working ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ImageIcon className="h-3.5 w-3.5" />
              )}
              {working ? ui.heroImageWorking : ui.heroImageRegenerate}
            </GhostButton>
          )}
          <UploadButton
            label={ui.heroImageUpload}
            icon={<Upload className="h-3.5 w-3.5" />}
            onFile={(dataUri) =>
              onDispatch({ op: 'updateItemImage', index, itemIndex, src: dataUri })
            }
          />
        </div>
      )}
    </div>
  )
}
