'use client'

import { useId, useState } from 'react'
import { TextField } from '@/components/editor/editor-fields'
import { DynamicIcon } from '@/components/website-renderer/icon'
import {
  HERO_STRIP_ICON_LABELS,
  HERO_STRIP_WARNING,
  filterHeroStripIcons,
  isUnverifiableHeroStripClaim,
  resolveHeroStripIcon,
} from '@/lib/hero-strip'
import { HERO_STRIP_TEXT_MAX, HERO_STRIP_TITLE_MAX } from '@/lib/list-limits'
import type { EditOperation } from '@/lib/website-edit-operations'
import type { WebsiteSchema } from '@/lib/website-schema'

type HeroStripSectionData = Extract<WebsiteSchema['sections'][number], { type: 'heroStrip' }>

/** Searchable grid of the preset icons. An unknown stored key shows (and saves) as the default icon. */
export function HeroStripIconPicker({
  value,
  lang,
  onChange,
}: {
  value: string
  lang: 'tr' | 'en'
  onChange: (key: string) => void
}) {
  const tr = lang === 'tr'
  const [query, setQuery] = useState('')
  const inputId = useId()
  const selected = resolveHeroStripIcon(value)
  const labelIndex = tr ? 0 : 1
  const matches = filterHeroStripIcons(query)

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-xs font-medium text-muted-foreground">
        {tr ? 'Simge' : 'Icon'}
      </label>
      <input
        id={inputId}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={tr ? 'Simge ara…' : 'Search icons…'}
        className="h-8 rounded-md border border-border bg-background px-2 text-xs"
      />
      <div
        role="group"
        aria-label={tr ? 'Simge seç' : 'Choose icon'}
        className="grid max-h-32 grid-cols-6 gap-1 overflow-y-auto rounded-md border border-border bg-background p-1"
      >
        {matches.map((key) => {
          const active = key === selected
          const label = HERO_STRIP_ICON_LABELS[key][labelIndex]
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
        {matches.length === 0 && (
          <p className="col-span-6 px-1 py-2 text-center text-[11px] text-muted-foreground">
            {tr ? 'Eşleşen simge yok.' : 'No matching icon.'}
          </p>
        )}
      </div>
    </div>
  )
}

/** Fixed set of four boxes: icon from a searchable preset grid, a short title and a short text. */
export function HeroStripFields({
  index,
  section,
  lang,
  onDispatch,
}: {
  index: number
  section: HeroStripSectionData
  lang: 'tr' | 'en'
  onDispatch: (op: EditOperation) => void
}) {
  const tr = lang === 'tr'
  const set = (itemIndex: number, field: 'icon' | 'title' | 'text', value: string) =>
    onDispatch({ op: 'updateItemField', index, itemIndex, field, value })

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">{tr ? 'Kutular' : 'Boxes'}</span>
      <p className="text-[11px] leading-snug text-muted-foreground">
        {tr
          ? 'Yalnızca düzenlediğiniz kutular yayında görünür.'
          : 'Only boxes you have edited appear on the published site.'}
      </p>
      {section.items.map((item, itemIndex) => {
        const warn = isUnverifiableHeroStripClaim(item.title) || isUnverifiableHeroStripClaim(item.text)
        return (
          <div key={itemIndex} className="flex flex-col gap-2 rounded-lg border border-border bg-background/60 p-2">
            <span className="text-xs font-semibold text-muted-foreground">
              {itemIndex + 1}. {item.title || (tr ? 'Boş kutu' : 'Empty box')}
            </span>
            <HeroStripIconPicker value={item.icon} lang={lang} onChange={(key) => set(itemIndex, 'icon', key)} />
            <TextField
              label={tr ? 'Başlık' : 'Title'}
              value={item.title}
              maxLength={HERO_STRIP_TITLE_MAX}
              onCommit={(v) => set(itemIndex, 'title', v)}
            />
            <TextField
              label={tr ? 'Açıklama' : 'Description'}
              value={item.text}
              maxLength={HERO_STRIP_TEXT_MAX}
              onCommit={(v) => set(itemIndex, 'text', v)}
            />
            {warn && <p className="text-[11px] leading-snug text-amber-600">{HERO_STRIP_WARNING[lang]}</p>}
          </div>
        )
      })}
    </div>
  )
}
