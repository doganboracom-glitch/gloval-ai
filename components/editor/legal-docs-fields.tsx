'use client'

import { useRef, useState } from 'react'
import { Bold, ExternalLink, Eye, EyeOff, Heading2, Link2, List, Pencil, RotateCcw } from 'lucide-react'
import { EditorModal } from '@/components/editor/editor-modal'
import { LegalBlocks } from '@/components/legal/legal-blocks'
import { tenantUrl } from '@/lib/domains'
import {
  applyMarkupFormat,
  legalDocStatus,
  legalEditorStartText,
  LEGAL_DOC_ENTRIES,
  LEGAL_DRAFT_NOTES,
  LEGAL_RESPONSIBILITY_NOTE,
  LEGAL_STATUS_LABEL,
  resetLegalDocOperation,
  saveLegalDocOperation,
  toggleLegalDocHiddenOperation,
  type LegalDocSlug,
  type LegalDocStatus,
  type MarkupFormat,
} from '@/lib/legal-editor'
import { LEGAL_BODY_MAX, parseLegalMarkup, sanitizeLegalMarkup } from '@/lib/legal-markup'
import { canHideLegalDoc, formatLegalDate, resolveLegalDoc } from '@/lib/site-legal-docs'
import type { EditOperation } from '@/lib/website-edit-operations'
import type { WebsiteSchema } from '@/lib/website-schema'

const STATUS_STYLE: Record<LegalDocStatus, string> = {
  template: 'bg-secondary text-muted-foreground',
  custom: 'bg-primary/15 text-primary',
  hidden: 'bg-destructive/15 text-destructive',
}

const rowButton =
  'flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40'

/** "Resmi metinler": list of the generated legal pages with edit / hide / reset. */
export function LegalDocsFields({
  site,
  publicSlug,
  onDispatch,
}: {
  site: WebsiteSchema
  /** Live subdomain slug, or null before the first publish. */
  publicSlug: string | null
  onDispatch: (op: EditOperation) => void
}) {
  const [editing, setEditing] = useState<LegalDocSlug | null>(null)
  const siteName = site.meta.name

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[11px] leading-snug text-muted-foreground">
        Sitenizin altbilgisindeki yasal sayfalar firma bilgilerinizle otomatik doldurulur. İsterseniz kendi
        metninizi yazabilir, istediğiniz zaman şablona dönebilirsiniz. Değişiklikler yayınladıktan sonra canlı
        sitede görünür.
      </p>
      <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
        {LEGAL_RESPONSIBILITY_NOTE}
      </p>

      <ul className="flex flex-col gap-2">
        {LEGAL_DOC_ENTRIES.map(({ slug, title }) => {
          const status = legalDocStatus(site, slug)
          const hideOp = toggleLegalDocHiddenOperation(site, slug)
          const required = !canHideLegalDoc(site, slug)
          const updated = resolveLegalDoc(slug, site, siteName)?.updatedAt
          return (
            <li key={slug} className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-snug">{title}</p>
                  {updated ? (
                    <p className="text-[11px] text-muted-foreground">
                      Son güncelleme: {formatLegalDate(updated)}
                    </p>
                  ) : null}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[status]}`}
                >
                  {LEGAL_STATUS_LABEL[status]}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setEditing(slug)} className={rowButton}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  Düzenle
                </button>
                <button
                  type="button"
                  disabled={!hideOp}
                  onClick={() => hideOp && onDispatch(hideOp)}
                  title={required ? 'Mağaza için zorunlu, gizlenemez' : undefined}
                  className={rowButton}
                >
                  {status === 'hidden' ? (
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {status === 'hidden' ? 'Göster' : 'Gizle'}
                </button>
                {publicSlug && status !== 'hidden' ? (
                  <a
                    href={`${tenantUrl(publicSlug)}/yasal/${slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={rowButton}
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    Sayfayı aç
                  </a>
                ) : null}
              </div>
              {required ? (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Mağaza ödemesi için zorunlu; düzenleyebilirsiniz ama gizleyemezsiniz.
                </p>
              ) : null}
              {status === 'template' && LEGAL_DRAFT_NOTES[slug] ? (
                <p
                  role="note"
                  className="rounded-md border border-border bg-secondary/40 px-2 py-1.5 text-[11px] leading-snug text-muted-foreground"
                >
                  {LEGAL_DRAFT_NOTES[slug]}
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>

      {editing ? (
        <LegalDocEditorModal
          key={editing}
          site={site}
          slug={editing}
          onDispatch={onDispatch}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  )
}

const TOOLBAR: ReadonlyArray<{ format: MarkupFormat; label: string; Icon: typeof Bold }> = [
  { format: 'heading', label: 'Başlık', Icon: Heading2 },
  { format: 'bullet', label: 'Madde işareti', Icon: List },
  { format: 'bold', label: 'Kalın', Icon: Bold },
  { format: 'link', label: 'Bağlantı', Icon: Link2 },
]

function LegalDocEditorModal({
  site,
  slug,
  onDispatch,
  onClose,
}: {
  site: WebsiteSchema
  slug: LegalDocSlug
  onDispatch: (op: EditOperation) => void
  onClose: () => void
}) {
  const siteName = site.meta.name
  const title = LEGAL_DOC_ENTRIES.find((e) => e.slug === slug)?.title ?? slug
  const initial = useRef(legalEditorStartText(site, siteName, slug)).current
  const [text, setText] = useState(initial)
  const [preview, setPreview] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const saveOp = saveLegalDocOperation(site, siteName, slug, text)
  const resetOp = resetLegalDocOperation(site, slug)
  const dirty = sanitizeLegalMarkup(text) !== sanitizeLegalMarkup(initial)
  const empty = sanitizeLegalMarkup(text) === ''

  const format = (kind: MarkupFormat) => {
    const el = areaRef.current
    if (!el) return
    const next = applyMarkupFormat(text, el.selectionStart, el.selectionEnd, kind)
    setText(next.text)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(next.selStart, next.selEnd)
    })
  }

  const save = () => {
    if (saveOp) onDispatch(saveOp)
    onClose()
  }

  const reset = () => {
    if (resetOp) onDispatch(resetOp)
    onClose()
  }

  return (
    <EditorModal
      title={title}
      description="Başlık için ## , madde için - kullanın. Kalın için **metin**, bağlantı için [metin](https://adres)."
      onClose={onClose}
      dismissible={!dirty}
      footer={
        confirmReset ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-snug">
              Kendi metniniz silinecek ve güncel şablon geri gelecek. Emin misiniz?
            </p>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={() => setConfirmReset(false)} className={rowButton}>
                Vazgeç
              </button>
              <button
                type="button"
                onClick={reset}
                className="flex h-8 items-center rounded-lg bg-destructive px-3 text-xs font-semibold text-white"
              >
                Evet, şablona dön
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              disabled={!resetOp}
              onClick={() => setConfirmReset(true)}
              title={resetOp ? undefined : 'Bu sayfa zaten şablonu kullanıyor'}
              className={rowButton}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Şablona dön
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className={rowButton}>
                {dirty ? 'Değişiklikleri at' : 'Kapat'}
              </button>
              <button
                type="button"
                onClick={save}
                disabled={!saveOp || empty}
                className="flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-40"
              >
                Kaydet
              </button>
            </div>
          </div>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Biçimlendirme">
        {TOOLBAR.map(({ format: kind, label, Icon }) => (
          <button
            key={kind}
            type="button"
            onClick={() => format(kind)}
            disabled={preview}
            aria-label={label}
            title={label}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border transition-colors hover:bg-secondary disabled:opacity-40"
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPreview((p) => !p)}
          aria-pressed={preview}
          className={`${rowButton} ml-auto`}
        >
          {preview ? <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
          {preview ? 'Düzenle' : 'Önizleme'}
        </button>
      </div>

      {preview ? (
        <div className="min-h-[40vh] rounded-lg border border-border bg-background p-4">
          <LegalBlocks blocks={parseLegalMarkup(text)} />
        </div>
      ) : (
        <textarea
          ref={areaRef}
          value={text}
          maxLength={LEGAL_BODY_MAX}
          onChange={(e) => setText(e.target.value)}
          aria-label={`${title} metni`}
          spellCheck
          className="min-h-[40vh] w-full flex-1 resize-y rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed outline-none focus:border-primary"
        />
      )}
      {LEGAL_DRAFT_NOTES[slug] ? (
        <p role="note" className="text-[11px] leading-snug text-muted-foreground">
          {LEGAL_DRAFT_NOTES[slug]}
        </p>
      ) : null}
      <p className="text-[11px] leading-snug text-muted-foreground">{LEGAL_RESPONSIBILITY_NOTE}</p>
    </EditorModal>
  )
}
