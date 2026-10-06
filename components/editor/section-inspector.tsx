'use client'

import { ChevronDown, ChevronUp, ImageIcon, Loader2, Plus, Trash2, Upload } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import type { WebsiteSchema } from '@/lib/website-schema'
import {
  collectionOf,
  IMAGE_ITEM_SECTIONS,
  type EditOperation,
} from '@/lib/website-edit-operations'
import { GhostButton, IconBtn, TextField, UploadButton } from '@/components/editor/editor-fields'

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
  'period',
  'description',
  'bio',
  'answer',
  'caption',
  'buttonText',
  'icon',
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
  const scalars = SCALAR_FIELDS.filter((f) => typeof record[f] === 'string')
  const items = collectionOf(section) ?? []
  const hasImages = IMAGE_ITEM_SECTIONS.includes(section.type)
  const label = (field: string) => ui.fieldLabels[field] ?? field

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

      {items.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">{ui.itemsLabel}</span>
          {items.map((item, itemIndex) => (
            <ItemCard
              key={itemIndex}
              item={item}
              index={index}
              itemIndex={itemIndex}
              total={items.length}
              hasImages={hasImages}
              working={workingItem === `${index}:${itemIndex}`}
              onDispatch={onDispatch}
              onRegenerateItemImage={onRegenerateItemImage}
            />
          ))}
          <GhostButton onClick={() => onDispatch({ op: 'addItem', index })}>
            <Plus className="h-3.5 w-3.5" />
            {ui.addItem}
          </GhostButton>
        </div>
      )}
    </div>
  )
}

function ItemCard({
  item,
  index,
  itemIndex,
  total,
  hasImages,
  working,
  onDispatch,
  onRegenerateItemImage,
}: {
  item: Record<string, unknown>
  index: number
  itemIndex: number
  total: number
  hasImages: boolean
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
          disabled={total <= 1}
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
