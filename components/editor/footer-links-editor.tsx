'use client'

import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { GhostButton, IconBtn, TextField } from '@/components/editor/editor-fields'
import {
  customKindOf,
  defaultLegalLinks,
  describeFooterIssue,
  footerTargetOptions,
  sanitizeFooterColumns,
  sanitizeFooterLegalLinks,
  validateFooterHref,
  type FooterColumnInput,
} from '@/lib/footer-links'
import { pageNavItems } from '@/lib/website-pages'
import { isStorefront, type NavLink, type WebsiteSchema } from '@/lib/website-schema'
import type { EditOperation } from '@/lib/website-edit-operations'

/**
 * Footer link editor: columns (title, links with label + target) and the
 * official-text bar. Edits live in a local draft so half-finished rows stay on
 * screen, while every change is dispatched as `updateFooterLinks`, whose
 * sanitizer drops rows without a label or with an invalid target - so nothing
 * dead is ever saved or shown in the footer.
 */

const CUSTOM = { external: '__external', mail: '__mail', tel: '__tel' } as const
const CUSTOM_SEED = { [CUSTOM.external]: 'https://', [CUSTOM.mail]: 'mailto:', [CUSTOM.tel]: 'tel:' }

const T = {
  tr: {
    columns: 'Bağlantı sütunları',
    columnTitle: 'Sütun başlığı',
    addColumn: 'Sütun ekle',
    addLink: 'Bağlantı ekle',
    label: 'Etiket',
    target: 'Hedef',
    choose: 'Hedef seçin…',
    external: 'Dış bağlantı (https://)',
    mail: 'E-posta (mailto:)',
    tel: 'Telefon (tel:)',
    custom: 'Özel hedef',
    invalid: 'Geçersiz hedef',
    emptyLabel: 'Etiket boş; bu bağlantı kaydedilmez.',
    moveUp: 'Yukarı taşı',
    moveDown: 'Aşağı taşı',
    remove: 'Sil',
    legalTitle: 'Resmi yazılar çubuğu',
    legalHide: 'Resmi yazılar çubuğunu gizle',
    legalReset: 'Varsayılanlara dön',
    maxColumns: 'En fazla 5 sütun',
  },
  en: {
    columns: 'Link columns',
    columnTitle: 'Column title',
    addColumn: 'Add column',
    addLink: 'Add link',
    label: 'Label',
    target: 'Target',
    choose: 'Choose a target…',
    external: 'External link (https://)',
    mail: 'Email (mailto:)',
    tel: 'Phone (tel:)',
    custom: 'Custom target',
    invalid: 'Invalid target',
    emptyLabel: 'Label is empty; this link is not saved.',
    moveUp: 'Move up',
    moveDown: 'Move down',
    remove: 'Remove',
    legalTitle: 'Official texts bar',
    legalHide: 'Hide the official texts bar',
    legalReset: 'Reset to defaults',
    maxColumns: 'At most 5 columns',
  },
} as const

type Strings = (typeof T)[keyof typeof T]

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list
  const next = list.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function FooterLinksEditor({
  site,
  index,
  onDispatch,
}: {
  site: WebsiteSchema
  index: number
  onDispatch: (op: EditOperation) => void
}) {
  const { lang } = useLanguage()
  const l = lang === 'en' ? 'en' : 'tr'
  const s = T[l]
  const section = site.sections[index]
  const footer = section?.type === 'footer' ? section : null

  const storedColumns: FooterColumnInput[] = footer?.columns ?? []
  const kind = isStorefront(site) ? 'ecommerce' : 'corporate'
  const storedLegal = footer?.legal
  const storedLegalLinks: NavLink[] = storedLegal?.links ?? defaultLegalLinks(kind, l)

  const [columns, setColumns] = useState<FooterColumnInput[]>(storedColumns)
  const [legalLinks, setLegalLinks] = useState<NavLink[]>(storedLegalLinks)
  const [syncedColumns, setSyncedColumns] = useState(JSON.stringify(storedColumns))
  const [syncedLegal, setSyncedLegal] = useState(JSON.stringify(storedLegalLinks))

  if (!footer) return null

  // Undo/redo or an AI edit changed the stored footer: adopt it. Our own saves
  // match the sanitized draft and keep the draft (with its unfinished rows).
  const columnsKey = JSON.stringify(storedColumns)
  if (columnsKey !== syncedColumns) {
    setSyncedColumns(columnsKey)
    if (columnsKey !== JSON.stringify(sanitizeFooterColumns(columns, site))) setColumns(storedColumns)
  }
  const legalKey = JSON.stringify(storedLegalLinks)
  if (legalKey !== syncedLegal) {
    setSyncedLegal(legalKey)
    if (legalKey !== JSON.stringify(sanitizeFooterLegalLinks(legalLinks, site))) {
      setLegalLinks(storedLegalLinks)
    }
  }

  const groups = footerTargetOptions(site, l, pageNavItems(site))

  function saveColumns(next: FooterColumnInput[]) {
    setColumns(next)
    onDispatch({ op: 'updateFooterLinks', index, columns: next })
  }

  function saveLegal(links: NavLink[], hidden: boolean) {
    setLegalLinks(links)
    onDispatch({ op: 'updateFooterLinks', index, legal: { hidden, links } })
  }

  const legalHidden = storedLegal?.hidden === true

  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-medium text-muted-foreground">{s.columns}</span>
      {columns.map((column, ci) => (
        <div key={ci} className="flex flex-col gap-2 rounded-lg border border-border bg-background/60 p-2">
          <div className="flex items-end gap-1">
            <div className="flex-1">
              <TextField
                label={s.columnTitle}
                value={column.title}
                onCommit={(v) =>
                  saveColumns(columns.map((c, i) => (i === ci ? { ...c, title: v } : c)))
                }
              />
            </div>
            <IconBtn
              label={s.moveUp}
              small
              disabled={ci === 0}
              onClick={() => saveColumns(move(columns, ci, ci - 1))}
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn
              label={s.moveDown}
              small
              disabled={ci === columns.length - 1}
              onClick={() => saveColumns(move(columns, ci, ci + 1))}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn
              label={s.remove}
              small
              onClick={() => saveColumns(columns.filter((_, i) => i !== ci))}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </IconBtn>
          </div>
          <LinkList
            links={column.links}
            site={site}
            groups={groups}
            s={s}
            lang={l}
            max={8}
            onChange={(links) =>
              saveColumns(columns.map((c, i) => (i === ci ? { ...c, links } : c)))
            }
          />
        </div>
      ))}
      <GhostButton
        disabled={columns.length >= 5}
        onClick={() =>
          saveColumns([...columns, { title: s.columnTitle, links: [{ label: '', href: '' }] }])
        }
      >
        <Plus className="h-3.5 w-3.5" />
        {columns.length >= 5 ? s.maxColumns : s.addColumn}
      </GhostButton>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <span className="text-xs font-medium text-muted-foreground">{s.legalTitle}</span>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--color-brand)]"
            checked={legalHidden}
            onChange={(e) => saveLegal(legalLinks, e.target.checked)}
          />
          {s.legalHide}
        </label>
        {!legalHidden && (
          <>
            <LinkList
              links={legalLinks}
              site={site}
              groups={groups}
              s={s}
              lang={l}
              max={8}
              onChange={(links) => saveLegal(links, false)}
            />
            <GhostButton onClick={() => saveLegal(defaultLegalLinks(kind, l), false)}>
              {s.legalReset}
            </GhostButton>
          </>
        )}
      </div>
    </div>
  )
}

function LinkList({
  links,
  site,
  groups,
  s,
  lang,
  max,
  onChange,
}: {
  links: NavLink[]
  site: WebsiteSchema
  groups: ReturnType<typeof footerTargetOptions>
  s: Strings
  lang: 'tr' | 'en'
  max: number
  onChange: (links: NavLink[]) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      {links.map((link, li) => (
        <LinkRow
          key={li}
          link={link}
          site={site}
          groups={groups}
          s={s}
          lang={lang}
          isFirst={li === 0}
          isLast={li === links.length - 1}
          onChange={(next) => onChange(links.map((x, i) => (i === li ? next : x)))}
          onMove={(dir) => onChange(move(links, li, li + dir))}
          onRemove={() => onChange(links.filter((_, i) => i !== li))}
        />
      ))}
      <GhostButton
        disabled={links.length >= max}
        onClick={() => onChange([...links, { label: '', href: '' }])}
      >
        <Plus className="h-3.5 w-3.5" />
        {s.addLink}
      </GhostButton>
    </div>
  )
}

function LinkRow({
  link,
  site,
  groups,
  s,
  lang,
  isFirst,
  isLast,
  onChange,
  onMove,
  onRemove,
}: {
  link: NavLink
  site: WebsiteSchema
  groups: ReturnType<typeof footerTargetOptions>
  s: Strings
  lang: 'tr' | 'en'
  isFirst: boolean
  isLast: boolean
  onChange: (link: NavLink) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
}) {
  const custom = customKindOf(link.href)
  const listed = groups.some((g) => g.options.some((o) => o.value === link.href))
  const selectValue = custom
    ? CUSTOM[custom]
    : listed
      ? link.href
      : link.href.trim() === ''
        ? ''
        : '__invalid'

  const check = validateFooterHref(link.href, site)
  const warning =
    link.label.trim() === '' && link.href.trim() !== ''
      ? s.emptyLabel
      : !check.ok
        ? describeFooterIssue(check.issue, lang)
        : null

  function pick(value: string) {
    if (value === '__invalid') return
    if (value in CUSTOM_SEED) {
      onChange({ ...link, href: CUSTOM_SEED[value as keyof typeof CUSTOM_SEED] })
      return
    }
    onChange({ ...link, href: value })
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border/70 p-1.5">
      <div className="flex items-end gap-1">
        <div className="flex-1">
          <TextField
            label={s.label}
            value={link.label}
            onCommit={(v) => onChange({ ...link, label: v })}
          />
        </div>
        <IconBtn label={s.moveUp} small disabled={isFirst} onClick={() => onMove(-1)}>
          <ChevronUp className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn label={s.moveDown} small disabled={isLast} onClick={() => onMove(1)}>
          <ChevronDown className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn label={s.remove} small onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
        </IconBtn>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{s.target}</span>
        <select
          value={selectValue}
          onChange={(e) => pick(e.target.value)}
          className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
        >
          <option value="">{s.choose}</option>
          {selectValue === '__invalid' && (
            <option value="__invalid">
              {s.invalid}: {link.href}
            </option>
          )}
          {groups.map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ))}
          <optgroup label={s.custom}>
            <option value={CUSTOM.external}>{s.external}</option>
            <option value={CUSTOM.mail}>{s.mail}</option>
            <option value={CUSTOM.tel}>{s.tel}</option>
          </optgroup>
        </select>
      </label>

      {custom && (
        <TextField
          label={s.target}
          value={link.href}
          placeholder={CUSTOM_SEED[CUSTOM[custom]]}
          onCommit={(v) => onChange({ ...link, href: v.trim() })}
        />
      )}

      {warning && (
        <p role="alert" className="flex items-start gap-1.5 text-xs text-amber-500">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {warning}
        </p>
      )}
    </div>
  )
}
