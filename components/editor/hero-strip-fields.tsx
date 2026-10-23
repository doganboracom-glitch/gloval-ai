'use client'

import { TextField } from '@/components/editor/editor-fields'
import {
  HERO_STRIP_ICONS,
  HERO_STRIP_ICON_LABELS,
  HERO_STRIP_WARNING,
  isHeroStripIcon,
  isUnverifiableHeroStripClaim,
} from '@/lib/hero-strip'
import { HERO_STRIP_TEXT_MAX, HERO_STRIP_TITLE_MAX } from '@/lib/list-limits'
import type { EditOperation } from '@/lib/website-edit-operations'
import type { WebsiteSchema } from '@/lib/website-schema'

type HeroStripSectionData = Extract<WebsiteSchema['sections'][number], { type: 'heroStrip' }>

/** Fixed set of four boxes: icon from a preset list, a short title and a short text. */
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
  const labelIndex = tr ? 0 : 1
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
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">{tr ? 'Simge' : 'Icon'}</span>
              <select
                value={isHeroStripIcon(item.icon) ? item.icon : 'sparkles'}
                onChange={(e) => set(itemIndex, 'icon', e.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs"
              >
                {HERO_STRIP_ICONS.map((key) => (
                  <option key={key} value={key}>
                    {HERO_STRIP_ICON_LABELS[key][labelIndex]}
                  </option>
                ))}
              </select>
            </label>
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
