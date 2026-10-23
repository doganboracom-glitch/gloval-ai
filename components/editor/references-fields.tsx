'use client'

import { ChevronDown, ChevronUp, Plus, Trash2, Upload } from 'lucide-react'
import type { WebsiteSchema } from '@/lib/website-schema'
import type { EditOperation } from '@/lib/website-edit-operations'
import { canAddEntry, canRemoveEntry } from '@/lib/list-limits'
import {
  REFERENCE_NAME_MAX,
  REFERENCE_URL_MAX,
  realReferences,
  referencesLinkDefaultLabel,
} from '@/lib/references'
import { GhostButton, IconBtn, TextField, UploadButton } from '@/components/editor/editor-fields'

type ReferencesSection = Extract<WebsiteSchema['sections'][number], { type: 'references' }>

const COPY = {
  tr: {
    items: 'Referanslar',
    real: (n: number) => `${n} referans sitede görünür.`,
    none: 'Henüz referans yok; bu bölüm sitenizde görünmez. Yalnızca gerçek müşterilerinizi ekleyin.',
    name: 'Firma adı',
    url: 'Web sitesi (isteğe bağlı)',
    logo: 'Logo',
    logoHint: 'İsteğe bağlı. Logo yoksa firma adı yazı olarak gösterilir.',
    upload: 'Logo yükle',
    removeLogo: 'Logoyu kaldır',
    logoAlt: 'Logo açıklaması',
    add: 'Referans ekle',
    up: 'Yukarı taşı',
    down: 'Aşağı taşı',
    remove: 'Sil',
    page: '/referanslar sayfasını oluştur',
    pageHint: 'En az 1 gerçek referans olduğunda sayfa otomatik yayında olur.',
    autoplay: 'Logoları otomatik kaydır',
    link: '“Tüm referanslar” bağlantısını göster',
    linkLabel: '“Tüm referanslar” bağlantı metni',
    subtitle: 'Alt başlık',
  },
  en: {
    items: 'References',
    real: (n: number) => `${n} reference(s) will show on the site.`,
    none: 'No references yet; this section is hidden on your site. Only add real clients.',
    name: 'Company name',
    url: 'Website (optional)',
    logo: 'Logo',
    logoHint: 'Optional. Without a logo the company name is shown as text.',
    upload: 'Upload logo',
    removeLogo: 'Remove logo',
    logoAlt: 'Logo description',
    add: 'Add reference',
    up: 'Move up',
    down: 'Move down',
    remove: 'Delete',
    page: 'Create the /references page',
    pageHint: 'The page goes live automatically once there is at least 1 real reference.',
    autoplay: 'Auto-scroll the logos',
    link: 'Show the "all references" link',
    linkLabel: '"All references" link text',
    subtitle: 'Subtitle',
  },
} as const

function Check({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex items-start gap-2 text-xs text-foreground">
      <input
        type="checkbox"
        className="mt-0.5 h-3.5 w-3.5 accent-[var(--color-brand)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="flex flex-col gap-0.5">
        <span>{label}</span>
        {hint && <span className="text-muted-foreground">{hint}</span>}
      </span>
    </label>
  )
}

export function ReferencesFields({
  site,
  index,
  section,
  onDispatch,
}: {
  site: WebsiteSchema
  index: number
  section: ReferencesSection
  onDispatch: (op: EditOperation) => void
}) {
  const lang = site.meta.language === 'en' ? 'en' : 'tr'
  const c = COPY[lang]
  const total = section.items.length
  const realCount = realReferences(section).length

  const patchSettings = (patch: Extract<EditOperation, { op: 'updateReferencesSettings' }>['patch']) =>
    onDispatch({ op: 'updateReferencesSettings', index, patch })
  const patchItem = (item: number, patch: Extract<EditOperation, { op: 'updateReference' }>['patch']) =>
    onDispatch({ op: 'updateReference', index, item, patch })

  return (
    <div className="flex flex-col gap-3" data-testid="references-fields">
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-background/60 p-2">
        <TextField
          label={c.subtitle}
          value={section.subtitle ?? ''}
          onCommit={(v) => patchSettings({ subtitle: v })}
        />
        <Check
          label={c.autoplay}
          checked={section.autoplay !== false}
          onChange={(value) => patchSettings({ autoplay: value })}
        />
        <Check
          label={c.page}
          hint={c.pageHint}
          checked={section.pageEnabled === true}
          onChange={(value) => patchSettings({ pageEnabled: value })}
        />
        <Check
          label={c.link}
          checked={section.linkEnabled !== false}
          onChange={(value) => patchSettings({ linkEnabled: value })}
        />
        <TextField
          label={c.linkLabel}
          placeholder={referencesLinkDefaultLabel(lang)}
          value={section.linkLabel ?? ''}
          onCommit={(v) => patchSettings({ linkLabel: v })}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{c.items}</span>
        <span className="text-xs text-muted-foreground">{`${total} / 40`}</span>
      </div>
      <p className="text-xs text-muted-foreground">{realCount > 0 ? c.real(realCount) : c.none}</p>

      {section.items.map((item, itemIndex) => (
        <div
          key={itemIndex}
          className="flex flex-col gap-2 rounded-lg border border-border bg-background/60 p-2"
          data-testid="reference-item"
        >
          <div className="flex items-center gap-1">
            <span className="flex-1 truncate text-xs font-semibold text-muted-foreground">
              {itemIndex + 1}. {item.name || '—'}
            </span>
            <IconBtn
              label={c.up}
              small
              disabled={itemIndex === 0}
              onClick={() => onDispatch({ op: 'moveItem', index, itemIndex, direction: 'up' })}
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn
              label={c.down}
              small
              disabled={itemIndex === total - 1}
              onClick={() => onDispatch({ op: 'moveItem', index, itemIndex, direction: 'down' })}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn
              label={c.remove}
              small
              disabled={!canRemoveEntry('references', total)}
              onClick={() => onDispatch({ op: 'removeItem', index, itemIndex })}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </IconBtn>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <TextField
              label={c.name}
              value={item.name}
              onCommit={(v) => patchItem(itemIndex, { name: v.slice(0, REFERENCE_NAME_MAX) })}
            />
            <TextField
              label={c.url}
              placeholder="https://"
              value={item.url ?? ''}
              onCommit={(v) => patchItem(itemIndex, { url: v.slice(0, REFERENCE_URL_MAX) })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{c.logo}</span>
            <div className="flex items-center gap-2">
              {item.logo?.src && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.logo.src}
                  alt={item.logo.alt || item.name}
                  className="h-10 w-16 rounded-md border border-border bg-background object-contain p-1"
                />
              )}
              <UploadButton
                label={c.upload}
                icon={<Upload className="h-3.5 w-3.5" />}
                onFile={(dataUri) => patchItem(itemIndex, { logo: dataUri })}
              />
              {item.logo?.src && (
                <GhostButton onClick={() => patchItem(itemIndex, { logo: '' })}>{c.removeLogo}</GhostButton>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{c.logoHint}</p>
            {item.logo?.src && (
              <TextField
                label={c.logoAlt}
                value={item.logo.alt ?? ''}
                onCommit={(v) => patchItem(itemIndex, { logoAlt: v })}
              />
            )}
          </div>
        </div>
      ))}

      <GhostButton
        disabled={!canAddEntry('references', total)}
        onClick={() => onDispatch({ op: 'addItem', index })}
      >
        <Plus className="h-3.5 w-3.5" />
        {c.add}
      </GhostButton>
    </div>
  )
}
