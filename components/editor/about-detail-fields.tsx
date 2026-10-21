'use client'

import { Plus, Trash2, Upload } from 'lucide-react'
import type { WebsiteSchema } from '@/lib/website-schema'
import type { EditOperation } from '@/lib/website-edit-operations'
import { isUsableImageSrc } from '@/lib/about-media'
import {
  MAX_DETAIL_BLOCKS,
  MAX_DETAIL_IMAGES,
  defaultDetailLinkLabel,
  detailIsSample,
  findDetailPage,
} from '@/lib/section-detail'
import { GhostButton, IconBtn, TextField, UploadButton } from '@/components/editor/editor-fields'

type AboutSectionData = Extract<WebsiteSchema['sections'][number], { type: 'about' }>

const COPY = {
  tr: {
    heading: 'Detay sayfası',
    pageToggle: 'Ayrı Hakkımızda sayfası oluştur',
    linkToggle: 'Ana sayfada "Daha fazlası…" bağlantısını göster',
    linkLabel: 'Bağlantı metni',
    pageUrl: 'Sayfa adresi',
    pageTitle: 'Sayfa başlığı',
    blocks: 'İçerik blokları',
    blockHeading: 'Alt başlık',
    blockBody: 'Metin (madde için satır başına "- " kullanın)',
    level: 'Başlık düzeyi',
    addBlock: 'Blok ekle',
    remove: 'Kaldır',
    images: 'Sayfa görselleri',
    imagesHint: 'Boş bırakırsanız bölüm görselleri kullanılır.',
    upload: 'Görsel yükle',
    alt: 'Görsel açıklaması (alt metin)',
    sample: 'Bu içerik platform tarafından örnek olarak hazırlandı. İşletmenize uygunsa onaylayın ya da düzenleyin; onaylanana kadar yayınlamadan önce sorulur.',
    approve: 'İçeriği onayla',
    off: 'Sayfa kapalıyken bağlantı gizlenir ve adres 404 döner.',
  },
  en: {
    heading: 'Detail page',
    pageToggle: 'Create a separate About page',
    linkToggle: 'Show the "Learn more…" link on the home page',
    linkLabel: 'Link label',
    pageUrl: 'Page address',
    pageTitle: 'Page title',
    blocks: 'Content blocks',
    blockHeading: 'Subheading',
    blockBody: 'Text (use "- " per line for a list)',
    level: 'Heading level',
    addBlock: 'Add block',
    remove: 'Remove',
    images: 'Page images',
    imagesHint: 'Leave empty to use the section images.',
    upload: 'Upload image',
    alt: 'Image description (alt text)',
    sample: 'This content was drafted by the platform as a sample. Approve or edit it if it fits your business; you are asked before publishing until you do.',
    approve: 'Approve content',
    off: 'While the page is off, the link is hidden and the address returns 404.',
  },
} as const

export function AboutDetailFields({
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
  const lang = site.meta.language === 'en' ? 'en' : 'tr'
  const c = COPY[lang]
  const detail = section.detail
  const pageOn = !!detail && detail.pageEnabled !== false
  const blocks = detail?.blocks ?? []
  const images = detail?.images ?? []
  const page = findDetailPage(site)

  const patch = (p: Extract<EditOperation, { op: 'updateSectionDetail' }>['patch']) =>
    onDispatch({ op: 'updateSectionDetail', index, patch: p })

  const updateBlock = (i: number, next: Partial<(typeof blocks)[number]>) =>
    patch({ blocks: blocks.map((b, k) => (k === i ? { ...b, ...next } : b)) })

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c.heading}</span>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--color-brand)]"
          checked={pageOn}
          onChange={(e) => patch({ pageEnabled: e.target.checked })}
        />
        {c.pageToggle}
      </label>
      {!pageOn ? <p className="text-xs text-muted-foreground">{c.off}</p> : null}

      {pageOn && (
        <>
          {detailIsSample(detail) ? (
            <div role="note" className="flex flex-col gap-2 rounded-md border border-brand/40 bg-brand/10 p-3 text-xs">
              <p className="text-muted-foreground">{c.sample}</p>
              <button
                type="button"
                onClick={() => patch({ approve: true })}
                className="self-start font-medium text-brand hover:underline"
              >
                {c.approve}
              </button>
            </div>
          ) : null}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--color-brand)]"
              checked={detail?.linkEnabled !== false}
              onChange={(e) => patch({ linkEnabled: e.target.checked })}
            />
            {c.linkToggle}
          </label>
          {detail?.linkEnabled !== false && (
            <TextField
              label={c.linkLabel}
              value={detail?.linkLabel ?? defaultDetailLinkLabel(lang)}
              onCommit={(v) => patch({ linkLabel: v })}
            />
          )}
          {page ? (
            <p className="text-xs text-muted-foreground">
              {c.pageUrl}: <span className="font-mono text-foreground">/{page.slug}</span>
            </p>
          ) : null}

          <TextField
            label={c.pageTitle}
            value={detail?.heading ?? section.title}
            onCommit={(v) => patch({ heading: v })}
          />

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">{c.blocks}</span>
            {blocks.map((block, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-md border border-border p-2">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <TextField
                      label={c.blockHeading}
                      value={block.heading ?? ''}
                      onCommit={(v) => updateBlock(i, { heading: v })}
                    />
                  </div>
                  <select
                    aria-label={c.level}
                    value={block.level ?? 'h2'}
                    onChange={(e) => updateBlock(i, { level: e.target.value === 'h3' ? 'h3' : 'h2' })}
                    className="h-9 rounded-md border border-border bg-background px-2 text-xs"
                  >
                    <option value="h2">H2</option>
                    <option value="h3">H3</option>
                  </select>
                  <IconBtn
                    label={c.remove}
                    small
                    onClick={() => patch({ blocks: blocks.filter((_, k) => k !== i) })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconBtn>
                </div>
                <TextField
                  label={c.blockBody}
                  value={block.body}
                  multiline
                  rows={5}
                  onCommit={(v) => updateBlock(i, { body: v })}
                />
              </div>
            ))}
            {blocks.length < MAX_DETAIL_BLOCKS && (
              <GhostButton onClick={() => patch({ blocks: [...blocks, { level: 'h2', body: '' }] })}>
                <Plus className="h-3.5 w-3.5" />
                {c.addBlock}
              </GhostButton>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{c.images}</span>
            <p className="text-xs text-muted-foreground">{c.imagesHint}</p>
            {images.map((image, i) => (
              <div key={i} className="flex items-start gap-2">
                {isUsableImageSrc(image.src) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image.src}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-md border border-border object-cover"
                  />
                ) : null}
                <div className="flex-1">
                  <TextField
                    label={c.alt}
                    value={image.alt ?? ''}
                    onCommit={(v) => patch({ images: images.map((s, k) => (k === i ? { ...s, alt: v } : s)) })}
                  />
                </div>
                <IconBtn
                  label={c.remove}
                  small
                  onClick={() => patch({ images: images.filter((_, k) => k !== i) })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </IconBtn>
              </div>
            ))}
            {images.length < MAX_DETAIL_IMAGES && (
              <UploadButton
                label={c.upload}
                icon={<Upload className="h-3.5 w-3.5" />}
                onFile={(dataUri) => patch({ images: [...images, { src: dataUri, alt: '' }] })}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
