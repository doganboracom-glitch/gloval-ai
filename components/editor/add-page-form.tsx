'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { CANONICAL_KINDS, CANONICAL_TITLES, suggestPageSlug, type CanonicalKind } from '@/lib/canonical-pages'
import { slugifyPageSlug, uniquePageSlug } from '@/lib/page-slugs'
import type { EditOperation } from '@/lib/website-edit-operations'

type Choice = CanonicalKind | 'custom'

const COPY = {
  tr: {
    add: 'Sayfa ekle',
    type: 'Sayfa türü',
    custom: 'Boş sayfa',
    name: 'Sayfa adı',
    slug: 'Adres (URL)',
    slugHint: 'Başka bir sayfa aynı adresi kullanıyorsa sonuna -2 eklenir.',
    create: 'Oluştur',
    cancel: 'Vazgeç',
    newPage: 'Yeni sayfa',
  },
  en: {
    add: 'Add page',
    type: 'Page type',
    custom: 'Blank page',
    name: 'Page name',
    slug: 'Address (URL)',
    slugHint: 'If another page already uses this address, -2 is added.',
    create: 'Create',
    cancel: 'Cancel',
    newPage: 'New page',
  },
} as const

const inputClass =
  'w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary'

export function AddPageForm({
  takenSlugs,
  canAdd,
  onDispatch,
}: {
  takenSlugs: string[]
  canAdd: boolean
  onDispatch: (op: EditOperation) => void
}) {
  const { lang } = useLanguage()
  const siteLang = lang === 'en' ? 'en' : 'tr'
  const c = COPY[siteLang]
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState<Choice>('about')
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')

  const suggestion = (next: Choice) =>
    next === 'custom' ? '' : suggestPageSlug(next, siteLang, takenSlugs)
  const titleFor = (next: Choice) => (next === 'custom' ? '' : CANONICAL_TITLES[next][siteLang])

  const start = () => {
    setChoice('about')
    setTitle(titleFor('about'))
    setSlug(suggestion('about'))
    setOpen(true)
  }

  const pick = (next: Choice) => {
    setChoice(next)
    setTitle(titleFor(next))
    setSlug(suggestion(next))
  }

  const submit = () => {
    const name = title.trim() || c.newPage
    const wanted = slug.trim() ? slugifyPageSlug(slug) : slugifyPageSlug(name)
    onDispatch({
      op: 'addPage',
      title: name,
      slug: uniquePageSlug(wanted, takenSlugs),
      kind: choice === 'custom' ? undefined : choice,
    })
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        disabled={!canAdd}
        onClick={start}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:text-muted-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
        {c.add}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card/40 p-3">
      <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
        {c.type}
        <select className={inputClass} value={choice} onChange={(e) => pick(e.target.value as Choice)}>
          {CANONICAL_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {CANONICAL_TITLES[kind][siteLang]}
            </option>
          ))}
          <option value="custom">{c.custom}</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
        {c.name}
        <input className={inputClass} value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
        {c.slug}
        <input
          className={`${inputClass} font-mono`}
          value={slug}
          maxLength={60}
          onChange={(e) => setSlug(e.target.value)}
        />
        <span className="leading-snug">{c.slugHint}</span>
      </label>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          {c.cancel}
        </button>
        <button
          type="button"
          onClick={submit}
          className="rounded-md bg-brand px-2.5 py-1 text-[11px] font-medium text-brand-foreground"
        >
          {c.create}
        </button>
      </div>
    </div>
  )
}
