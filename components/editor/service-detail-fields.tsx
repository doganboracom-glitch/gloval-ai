'use client'

import { useState } from 'react'
import { Plus, Sparkles, Trash2, Upload } from 'lucide-react'
import type { WebsiteSchema } from '@/lib/website-schema'
import type { EditOperation } from '@/lib/website-edit-operations'
import { isUsableImageSrc } from '@/lib/about-media'
import { SERVICE_ITEM_LIMITS } from '@/lib/service-item-limits'
import {
  defaultServicesLinkLabel,
  findServicesPage,
  serviceDetailHint,
  servicePath,
  withServiceSlugs,
} from '@/lib/service-pages'
import { suggestServiceAlt } from '@/lib/service-image'
import { GhostButton, IconBtn, TextField, UploadButton } from '@/components/editor/editor-fields'
import { useEditorProjectId, useSitePublished } from '@/components/editor/published-context'
import { AiImagePreviewPanel } from '@/components/editor/ai-image-preview-panel'

type ServicesData = Extract<WebsiteSchema['sections'][number], { type: 'services' }>

const COPY = {
  tr: {
    heading: 'Hizmet sayfaları',
    pageToggle: 'Her hizmet için ayrı sayfa oluştur',
    linkToggle: 'Ana sayfada "Tüm hizmetlerimiz" bağlantısını göster',
    linkLabel: 'Bağlantı metni',
    listTitle: 'Liste sayfası başlığı',
    ctaTitle: 'Alt çağrı başlığı',
    ctaText: 'Alt çağrı metni',
    ctaLabel: 'Alt çağrı buton metni',
    off: 'Sayfalar kapalıyken bağlantılar gizlenir ve adresler 404 döner.',
    suggestTitle: 'Hizmetleriniz için ayrı sayfalar oluşturabilirsiniz',
    suggestBody: 'Yayındaki siteniz değişmez; açtığınızda yeniden yayınlayınca görünür. Metinler siz onaylayana kadar örnek olarak işaretlenir.',
    suggestCta: 'Hizmet sayfalarını aç',
    suggestClose: 'Önerileri kapat',
    itemPage: 'Bu hizmetin sayfası açık',
    slug: 'Sayfa adresi',
    seoTitle: 'SEO başlığı',
    seoDescription: 'SEO açıklaması',
    blocks: 'İçerik blokları',
    blockHeading: 'Alt başlık',
    blockBody: 'Metin (madde için satır başına "- " kullanın)',
    addBlock: 'Blok ekle',
    remove: 'Kaldır',
    image: 'Hizmet görseli',
    alt: 'Görsel açıklaması (alt metin)',
    upload: 'Görsel yükle',
    sample: 'Bu metin platform tarafından örnek olarak hazırlandı. İşletmenize uygunsa onaylayın ya da düzenleyin.',
    approve: 'İçeriği onayla',
    aiWrite: 'AI ile metin yaz',
    aiWriting: 'Yazılıyor…',
    aiThin: 'Sitenizde bu hizmet için yeterli bilgi yok; kısa bir başlangıç metni hazırlandı. Bilgi ekleyip yeniden deneyin.',
    aiFailed: 'Metin yazılamadı. Lütfen tekrar deneyin.',
    aiNoCredits: 'AI krediniz yetersiz.',
    aiDaily: 'Günlük ücretsiz işlem limitine ulaştınız.',
  },
  en: {
    heading: 'Service pages',
    pageToggle: 'Create a separate page for each service',
    linkToggle: 'Show the "All our services" link on the home page',
    linkLabel: 'Link label',
    listTitle: 'List page title',
    ctaTitle: 'Closing call-to-action title',
    ctaText: 'Closing call-to-action text',
    ctaLabel: 'Closing call-to-action button label',
    off: 'While the pages are off, links are hidden and the addresses return 404.',
    suggestTitle: 'You can create a page for each of your services',
    suggestBody: 'Your live site does not change; the pages show up once you publish again. The text stays marked as a sample until you approve it.',
    suggestCta: 'Turn on service pages',
    suggestClose: 'Dismiss suggestion',
    itemPage: 'This service has its own page',
    slug: 'Page address',
    seoTitle: 'SEO title',
    seoDescription: 'SEO description',
    blocks: 'Content blocks',
    blockHeading: 'Subheading',
    blockBody: 'Text (use "- " per line for a list)',
    addBlock: 'Add block',
    remove: 'Remove',
    image: 'Service image',
    alt: 'Image description (alt text)',
    upload: 'Upload image',
    sample: 'This text was drafted by the platform as a sample. Approve or edit it if it fits your business.',
    approve: 'Approve content',
    aiWrite: 'Write text with AI',
    aiWriting: 'Writing…',
    aiThin: 'Your site has too little information about this service, so a short starter text was prepared. Add details and try again.',
    aiFailed: 'Could not write the text. Please try again.',
    aiNoCredits: 'Not enough AI credits.',
    aiDaily: 'You reached the free daily action limit.',
  },
} as const

export function ServiceDetailFields({
  site,
  index,
  section,
  onDispatch,
}: {
  site: WebsiteSchema
  index: number
  section: ServicesData
  onDispatch: (op: EditOperation) => void
}) {
  const lang = site.meta.language === 'en' ? 'en' : 'tr'
  const c = COPY[lang]
  const detail = section.detail
  const pageOn = !!detail && detail.pageEnabled !== false
  const published = useSitePublished()
  const projectId = useEditorProjectId()
  const listPage = findServicesPage(site)
  const listSlug = listPage?.slug ?? ''
  const items = withServiceSlugs(section.items)
  const hint = serviceDetailHint(site, published)
  const [writing, setWriting] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const patchList = (p: Extract<EditOperation, { op: 'updateServicesDetail' }>['patch']) =>
    onDispatch({ op: 'updateServicesDetail', index, patch: p })
  const patchItem = (item: number, p: Extract<EditOperation, { op: 'updateServiceItem' }>['patch']) =>
    onDispatch({ op: 'updateServiceItem', index, item, patch: p })

  const writeWithAi = async (item: number) => {
    if (writing !== null) return
    setWriting(item)
    setNotice(null)
    try {
      const res = await fetch('/api/service-detail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schema: site, item }),
      })
      if (res.status === 402) throw new Error(c.aiNoCredits)
      if (res.status === 429) throw new Error(c.aiDaily)
      if (!res.ok) throw new Error(c.aiFailed)
      const data = (await res.json()) as {
        blocks?: { heading?: string; level?: 'h2' | 'h3'; body: string }[]
        thinFacts?: boolean
      }
      if (!Array.isArray(data.blocks) || data.blocks.length === 0) throw new Error(c.aiFailed)
      patchItem(item, { blocks: data.blocks, pageEnabled: true })
      if (data.thinFacts) setNotice(c.aiThin)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : c.aiFailed)
    } finally {
      setWriting(null)
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c.heading}</span>

      {hint === 'published' && (
        <div role="note" className="flex flex-col gap-2 rounded-md border border-brand/40 bg-brand/10 p-3 text-xs">
          <p className="font-medium text-foreground">{c.suggestTitle}</p>
          <p className="text-muted-foreground">{c.suggestBody}</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => patchList({ pageEnabled: true })}
              className="font-medium text-brand hover:underline"
            >
              {c.suggestCta}
            </button>
            <button
              type="button"
              onClick={() => onDispatch({ op: 'dismissHint', hint: 'serviceDetail' })}
              className="text-muted-foreground hover:underline"
            >
              {c.suggestClose}
            </button>
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--color-brand)]"
          checked={pageOn}
          onChange={(e) => patchList({ pageEnabled: e.target.checked })}
        />
        {c.pageToggle}
      </label>
      {!pageOn ? <p className="text-xs text-muted-foreground">{c.off}</p> : null}

      {pageOn && (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--color-brand)]"
              checked={detail?.linkEnabled !== false}
              onChange={(e) => patchList({ linkEnabled: e.target.checked })}
            />
            {c.linkToggle}
          </label>
          {detail?.linkEnabled !== false && (
            <TextField
              label={c.linkLabel}
              value={detail?.linkLabel ?? defaultServicesLinkLabel(lang)}
              onCommit={(v) => patchList({ linkLabel: v })}
            />
          )}
          <TextField
            label={c.listTitle}
            value={detail?.heading ?? section.title}
            onCommit={(v) => patchList({ heading: v })}
          />
          <TextField label={c.ctaTitle} value={detail?.ctaTitle ?? ''} onCommit={(v) => patchList({ ctaTitle: v })} />
          <TextField
            label={c.ctaText}
            value={detail?.ctaText ?? ''}
            multiline
            rows={2}
            onCommit={(v) => patchList({ ctaText: v })}
          />
          <TextField label={c.ctaLabel} value={detail?.ctaLabel ?? ''} onCommit={(v) => patchList({ ctaLabel: v })} />

          {notice ? (
            <p role="status" className="text-xs text-muted-foreground">
              {notice}
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            {items.map((item, i) => {
              const blocks = item.detail ?? []
              const itemOn = item.pageEnabled !== false
              const hasImage = isUsableImageSrc(item.src)
              const fallbackAlt = suggestServiceAlt(site, item.title, lang)
              const updateBlock = (b: number, next: Partial<(typeof blocks)[number]>) =>
                patchItem(i, { blocks: blocks.map((x, k) => (k === b ? { ...x, ...next } : x)) })
              return (
                <details key={i} className="rounded-md border border-border">
                  <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium">
                    {item.title || `#${i + 1}`}
                  </summary>
                  <div className="flex flex-col gap-3 border-t border-border p-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--color-brand)]"
                        checked={itemOn}
                        onChange={(e) => patchItem(i, { pageEnabled: e.target.checked })}
                      />
                      {c.itemPage}
                    </label>

                    {itemOn && (
                      <>
                        {item.sample ? (
                          <div role="note" className="flex flex-col gap-2 rounded-md border border-brand/40 bg-brand/10 p-3 text-xs">
                            <p className="text-muted-foreground">{c.sample}</p>
                            <button
                              type="button"
                              onClick={() => patchItem(i, { approve: true })}
                              className="self-start font-medium text-brand hover:underline"
                            >
                              {c.approve}
                            </button>
                          </div>
                        ) : null}

                        <TextField
                          label={c.slug}
                          value={item.slug ?? ''}
                          mono
                          hint={listSlug && item.slug ? servicePath(listSlug, item.slug) : undefined}
                          onCommit={(v) => patchItem(i, { slug: v })}
                        />
                        <TextField
                          label={c.seoTitle}
                          value={item.seoTitle ?? ''}
                          maxLength={SERVICE_ITEM_LIMITS.seoTitle}
                          onCommit={(v) => patchItem(i, { seoTitle: v })}
                        />
                        <TextField
                          label={c.seoDescription}
                          value={item.seoDescription ?? ''}
                          multiline
                          rows={2}
                          maxLength={SERVICE_ITEM_LIMITS.seoDescription}
                          onCommit={(v) => patchItem(i, { seoDescription: v })}
                        />

                        <div className="flex flex-col gap-1.5">
                          <span className="text-xs font-medium text-muted-foreground">{c.image}</span>
                          {hasImage && (
                            <div className="flex items-start gap-2">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={item.src}
                                alt=""
                                className="h-14 w-14 shrink-0 rounded-md border border-border object-cover"
                              />
                              <div className="flex-1">
                                <TextField
                                  label={c.alt}
                                  value={item.alt ?? ''}
                                  onCommit={(v) => patchItem(i, { alt: v.trim() || fallbackAlt })}
                                />
                              </div>
                              <IconBtn label={c.remove} small onClick={() => patchItem(i, { src: '', alt: '' })}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </IconBtn>
                            </div>
                          )}
                          <UploadButton
                            label={c.upload}
                            icon={<Upload className="h-3.5 w-3.5" />}
                            onFile={(dataUri) => patchItem(i, { src: dataUri, alt: item.alt || fallbackAlt })}
                          />
                          <AiImagePreviewPanel
                            site={site}
                            sectionKey={`services:${index}.${i}`}
                            projectId={projectId}
                            canAdd
                            disabled={writing !== null}
                            onUse={(image) => {
                              if (isUsableImageSrc(image.src)) patchItem(i, { src: image.src, alt: image.alt || fallbackAlt })
                            }}
                          />
                        </div>

                        <div className="flex flex-col gap-2">
                          <span className="text-xs font-medium text-muted-foreground">{c.blocks}</span>
                          <button
                            type="button"
                            disabled={writing !== null}
                            onClick={() => void writeWithAi(i)}
                            className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-brand hover:underline disabled:opacity-50"
                          >
                            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                            {writing === i ? c.aiWriting : c.aiWrite}
                          </button>
                          {blocks.map((block, b) => (
                            <div key={b} className="flex flex-col gap-2 rounded-md border border-border p-2">
                              <div className="flex items-end gap-2">
                                <div className="flex-1">
                                  <TextField
                                    label={c.blockHeading}
                                    value={block.heading ?? ''}
                                    onCommit={(v) => updateBlock(b, { heading: v })}
                                  />
                                </div>
                                <IconBtn
                                  label={c.remove}
                                  small
                                  onClick={() => patchItem(i, { blocks: blocks.filter((_, k) => k !== b) })}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </IconBtn>
                              </div>
                              <TextField
                                label={c.blockBody}
                                value={block.body}
                                multiline
                                rows={4}
                                onCommit={(v) => updateBlock(b, { body: v })}
                              />
                            </div>
                          ))}
                          {blocks.length < SERVICE_ITEM_LIMITS.blocks && (
                            <GhostButton onClick={() => patchItem(i, { blocks: [...blocks, { level: 'h2', body: '' }] })}>
                              <Plus className="h-3.5 w-3.5" />
                              {c.addBlock}
                            </GhostButton>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </details>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
