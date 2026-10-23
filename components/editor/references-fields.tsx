'use client'

import { useRef, useState } from 'react'
import { ChevronDown, ChevronUp, TriangleAlert, Trash2, Upload } from 'lucide-react'
import type { WebsiteSchema } from '@/lib/website-schema'
import type { EditOperation } from '@/lib/website-edit-operations'
import { LIST_LIMITS, canRemoveEntry } from '@/lib/list-limits'
import {
  REFERENCE_LOGO_MAX_BYTES,
  REFERENCE_LOGO_TYPES,
  sniffLogoType,
  REFERENCE_NAME_MAX,
  REFERENCE_SUBTITLE_MAX,
  REFERENCE_TITLE_MAX,
  realReferences,
  referencesPageTitle,
} from '@/lib/references'
import { GhostButton, IconBtn, TextField } from '@/components/editor/editor-fields'

type ReferencesSection = Extract<WebsiteSchema['sections'][number], { type: 'references' }>

const MAX = LIST_LIMITS.references.max

export const REFERENCES_COPY = {
  tr: {
    items: 'Logolar',
    real: (n: number) => `${n} logo sitede görünür.`,
    none: 'Henüz logo yok; bu bölüm sitenizde görünmez. Logo yükleyince otomatik görünür.',
    title: 'Bölüm başlığı',
    subtitle: 'Alt başlık / giriş metni',
    showOnHome: 'Ana sayfada göster',
    page: 'Referanslar sayfası oluştur',
    pageHint: 'En az 1 logo olduğunda /referanslar sayfası yayında olur.',
    upload: 'Logo yükle',
    uploadHint:
      'Önerilen: şeffaf arka planlı PNG veya WebP, yatay 600×300 px, en çok 2 MB. Logolar otomatik aynı boyuta sığdırılır.',
    limitReached: `En fazla ${MAX} logo eklenebilir; yeni logo yüklemek için önce birini silin.`,
    warning:
      'Yalnızca birlikte çalıştığınız ve logosunu kullanma iznine sahip olduğunuz firmaların logolarını ekleyin.',
    badType: (name: string) => `${name}: yalnızca PNG, JPG veya WebP yüklenebilir.`,
    tooBig: (name: string) => `${name}: dosya 2 MB'den büyük.`,
    overflow: (n: number) => `Sınıra ulaşıldığı için ${n} logo eklenmedi.`,
    namePlaceholder: 'İsim (isteğe bağlı)',
    nameLabel: 'İsim',
    up: 'Yukarı taşı',
    down: 'Aşağı taşı',
    remove: 'Sil',
    logoOf: (n: number) => `Logo ${n}`,
  },
  en: {
    items: 'Logos',
    real: (n: number) => `${n} logo(s) will show on the site.`,
    none: 'No logos yet; this section is hidden on your site. It appears automatically once you upload a logo.',
    title: 'Section title',
    subtitle: 'Subtitle / intro text',
    showOnHome: 'Show on the home page',
    page: 'Create a references page',
    pageHint: 'The /references page goes live once there is at least 1 logo.',
    upload: 'Upload logos',
    uploadHint:
      'Recommended: PNG or WebP with a transparent background, landscape 600×300 px, 2 MB at most. Logos are automatically fitted to the same size.',
    limitReached: `You can add up to ${MAX} logos; delete one to upload another.`,
    warning:
      'Only add logos of companies you actually work with and have permission to use the logo of.',
    badType: (name: string) => `${name}: only PNG, JPG or WebP files are allowed.`,
    tooBig: (name: string) => `${name}: the file is larger than 2 MB.`,
    overflow: (n: number) => `${n} logo(s) were not added because the limit was reached.`,
    namePlaceholder: 'Name (optional)',
    nameLabel: 'Name',
    up: 'Move up',
    down: 'Move down',
    remove: 'Delete',
    logoOf: (n: number) => `Logo ${n}`,
  },
} as const

function Check({
  label,
  hint,
  checked,
  onChange,
  testId,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (value: boolean) => void
  testId?: string
}) {
  return (
    <label className="flex items-start gap-2 text-xs text-foreground">
      <input
        type="checkbox"
        data-testid={testId}
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

function readAsDataUri(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => resolve('')
    reader.readAsDataURL(file)
  })
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
  const c = REFERENCES_COPY[lang]
  const total = section.items.length
  const realCount = realReferences(section).length
  const full = total >= MAX
  const fileRef = useRef<HTMLInputElement>(null)
  const [messages, setMessages] = useState<string[]>([])

  const patchSettings = (patch: Extract<EditOperation, { op: 'updateReferencesSettings' }>['patch']) =>
    onDispatch({ op: 'updateReferencesSettings', index, patch })

  const handleFiles = async (files: File[]) => {
    const problems: string[] = []
    const accepted: File[] = []
    for (const file of files) {
      const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
      const realType = sniffLogoType(head)
      if (!(REFERENCE_LOGO_TYPES as readonly string[]).includes(file.type) || !realType) problems.push(c.badType(file.name))
      else if (file.size > REFERENCE_LOGO_MAX_BYTES) problems.push(c.tooBig(file.name))
      else accepted.push(file)
    }
    const room = Math.max(0, MAX - total)
    const taken = accepted.slice(0, room)
    if (accepted.length > taken.length) problems.push(c.overflow(accepted.length - taken.length))
    setMessages(problems)
    if (taken.length === 0) return
    const logos = (await Promise.all(taken.map(readAsDataUri))).filter(Boolean)
    if (logos.length > 0) onDispatch({ op: 'addReferenceLogos', index, logos })
  }

  return (
    <div className="flex flex-col gap-3" data-testid="references-fields">
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-background/60 p-2">
        <Check
          label={c.showOnHome}
          checked={section.showOnHome !== false}
          onChange={(value) => patchSettings({ showOnHome: value })}
          testId="references-show-on-home"
        />
        <Check
          label={c.page}
          hint={c.pageHint}
          checked={section.pageEnabled === true}
          onChange={(value) => patchSettings({ pageEnabled: value })}
          testId="references-page-enabled"
        />
        <TextField
          label={c.title}
          placeholder={referencesPageTitle(lang)}
          maxLength={REFERENCE_TITLE_MAX}
          value={section.title ?? ''}
          onCommit={(v) => patchSettings({ title: v })}
        />
        <TextField
          label={c.subtitle}
          multiline
          rows={2}
          maxLength={REFERENCE_SUBTITLE_MAX}
          value={section.subtitle ?? ''}
          onCommit={(v) => patchSettings({ subtitle: v })}
        />
      </div>

      <div
        role="note"
        data-testid="references-warning"
        className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-foreground"
      >
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
        <span>{c.warning}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">{c.items}</span>
          <span className="text-xs text-muted-foreground" data-testid="references-counter">{`${total} / ${MAX}`}</span>
        </div>
        <div className="flex items-center">
          <GhostButton disabled={full} onClick={() => fileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            {c.upload}
          </GhostButton>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            data-testid="references-upload-input"
            className="sr-only"
            tabIndex={-1}
            disabled={full}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              e.target.value = ''
              void handleFiles(files)
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground/70" data-testid="references-upload-hint">
          {c.uploadHint}
        </p>
        {full && (
          <p className="text-xs text-foreground" data-testid="references-limit-note">
            {c.limitReached}
          </p>
        )}
        {messages.length > 0 && (
          <ul className="flex flex-col gap-0.5 text-xs text-destructive" role="alert" data-testid="references-upload-errors">
            {messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-muted-foreground" data-testid="references-visibility-note">
        {realCount > 0 ? c.real(realCount) : c.none}
      </p>

      {section.items.map((item, itemIndex) => (
        <div
          key={itemIndex}
          className="flex flex-col gap-2 rounded-lg border border-border bg-background/60 p-2"
          data-testid="reference-item"
        >
          <div className="flex items-center gap-2">
            {item.logo?.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.logo.src}
                alt={item.logo.alt || item.name || c.logoOf(itemIndex + 1)}
                className="h-10 w-16 shrink-0 rounded-md border border-border bg-background object-contain p-1"
              />
            ) : (
              <span className="flex h-10 w-16 shrink-0 items-center justify-center rounded-md border border-border text-xs text-muted-foreground">
                {itemIndex + 1}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <TextField
                label={c.nameLabel}
                placeholder={c.namePlaceholder}
                hidePlaceholderOnFocus
                maxLength={REFERENCE_NAME_MAX}
                value={item.name}
                onCommit={(v) =>
                  onDispatch({ op: 'updateReference', index, item: itemIndex, patch: { name: v.slice(0, REFERENCE_NAME_MAX) } })
                }
              />
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
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
          </div>
        </div>
      ))}
    </div>
  )
}
