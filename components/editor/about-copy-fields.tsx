'use client'

import type { WebsiteSchema } from '@/lib/website-schema'
import type { EditOperation } from '@/lib/website-edit-operations'
import {
  CARD_TEXT_MAX_SENTENCES,
  LONG_TEXT_MAX_SENTENCES,
  SHORT_TEXT_MAX_SENTENCES,
  countSentences,
  type AboutCopyField,
} from '@/lib/about-copy'
import { TextField } from '@/components/editor/editor-fields'

type AboutSectionData = Extract<WebsiteSchema['sections'][number], { type: 'about' }>

const COPY = {
  tr: {
    heading: 'Hakkımızda metinleri',
    hint: 'Boş bıraktığınız alanlar için sitenin mevcut görünümü korunur. Yalnızca doğruladığınız bilgileri yazın.',
    shortText: 'Kısa metin (ana sayfa, en fazla 3 cümle)',
    longText: 'Uzun metin (Hakkımızda sayfası, ek paragraf)',
    vision: 'Vizyon',
    mission: 'Misyon',
    sentences: (n: number, max: number) => `${n}/${max} cümle`,
    tooLong: 'Ana sayfada yalnızca ilk 3 cümle gösterilir.',
  },
  en: {
    heading: 'About texts',
    hint: 'Fields left empty keep the current look of your site. Only write information you can verify.',
    shortText: 'Short text (home page, up to 3 sentences)',
    longText: 'Long text (About page, extra paragraph)',
    vision: 'Vision',
    mission: 'Mission',
    sentences: (n: number, max: number) => `${n}/${max} sentences`,
    tooLong: 'Only the first 3 sentences are shown on the home page.',
  },
} as const

const FIELDS: { key: AboutCopyField; rows: number; max: number }[] = [
  { key: 'shortText', rows: 3, max: SHORT_TEXT_MAX_SENTENCES },
  { key: 'longText', rows: 5, max: LONG_TEXT_MAX_SENTENCES },
  { key: 'vision', rows: 3, max: CARD_TEXT_MAX_SENTENCES },
  { key: 'mission', rows: 3, max: CARD_TEXT_MAX_SENTENCES },
]

export function AboutCopyFields({
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
  const c = COPY[site.meta.language === 'en' ? 'en' : 'tr']
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3" data-gv-about-copy-fields>
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c.heading}</span>
      <p className="text-xs text-muted-foreground">{c.hint}</p>
      {FIELDS.map(({ key, rows, max }) => {
        const value = section[key] ?? ''
        const count = countSentences(value)
        return (
          <div key={key} className="flex flex-col gap-1">
            <TextField
              label={c[key]}
              value={value}
              multiline
              rows={rows}
              onCommit={(v) => onDispatch({ op: 'updateAboutCopy', index, patch: { [key]: v } })}
            />
            {value ? (
              <span className="text-xs text-muted-foreground">
                {c.sentences(count, max)}
                {key === 'shortText' && count > max ? ` - ${c.tooLong}` : ''}
              </span>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
