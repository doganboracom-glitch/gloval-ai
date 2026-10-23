'use client'

import { useState } from 'react'
import { Plus, Sparkles, Trash2, Upload } from 'lucide-react'
import type { WebsiteSchema } from '@/lib/website-schema'
import type { EditOperation } from '@/lib/website-edit-operations'
import { isUsableImageSrc } from '@/lib/about-media'
import { SERVICE_ITEM_LIMITS } from '@/lib/service-item-limits'
import { PRODUCT_HOME_DEFAULT_LIMIT, PRODUCT_IMAGES_MAX, PRODUCT_SPECS_MAX } from '@/lib/list-limits'
import { parseVideoUrl } from '@/lib/catalog-public'
import { homeProductIndexes, isPlaceholderProduct, withProductSlugs } from '@/lib/product-items'
import { GhostButton, IconBtn, TextField, UploadButton } from '@/components/editor/editor-fields'
import { useEditorProjectId } from '@/components/editor/published-context'
import { AiImagePreviewPanel } from '@/components/editor/ai-image-preview-panel'

type ProductsData = Extract<WebsiteSchema['sections'][number], { type: 'products' }>

const COPY = {
  tr: {
    heading: 'Ürün sayfaları',
    toggle: 'Her ürün için ayrı sayfa oluştur',
    off: 'Kapalıyken ürünler yalnızca ana sayfada kart olarak görünür; ürün adresleri 404 döner.',
    itemPage: 'Ana sayfada göster',
    homeFull: 'Ana sayfa vitrini dolu. Yeni bir ürün göstermek için önce başka birini kapatın ya da vitrin sayısını artırın.',
    sample: 'Bu metin platform tarafından örnek olarak hazırlandı. İşletmenize uygunsa onaylayın ya da düzenleyin.',
    approve: 'İçeriği onayla',
    slug: 'Sayfa adresi',
    slugAuto: 'Adres ürün adından otomatik oluşur. Adı değiştirirseniz eski adres yeni adrese yönlenir.',
    draft: 'Taslak: ad, görsel veya fiyat girilene kadar yayınlanmaz.',
    sku: 'Ürün kodu (SKU)',
    priceMode: 'Fiyat gösterimi',
    priceShow: 'Fiyatı göster',
    priceAsk: 'Fiyat için iletişime geçin',
    seoTitle: 'SEO başlığı',
    seoDescription: 'SEO açıklaması',
    gallery: 'Ürün görselleri',
    alt: 'Görsel açıklaması (alt metin)',
    upload: 'Görsel yükle',
    specs: 'Teknik özellikler',
    specName: 'Özellik',
    specValue: 'Değer',
    addSpec: 'Özellik ekle',
    video: 'Ürün videosu (YouTube veya Vimeo bağlantısı)',
    videoInvalid: 'Bu bağlantı tanınmadı; yalnızca YouTube veya Vimeo bağlantıları kabul edilir.',
    blocks: 'İçerik blokları',
    blockHeading: 'Alt başlık',
    blockBody: 'Metin (madde için satır başına "- " kullanın)',
    addBlock: 'Blok ekle',
    remove: 'Kaldır',
    aiWrite: 'AI ile metin yaz',
    aiWriting: 'Yazılıyor…',
    aiThin: 'Sitenizde bu ürün için yeterli bilgi yok; kısa bir başlangıç metni hazırlandı. Bilgi ekleyip yeniden deneyin.',
    aiFailed: 'Metin yazılamadı. Lütfen tekrar deneyin.',
    aiNoCredits: 'AI krediniz yetersiz.',
    aiDaily: 'Günlük ücretsiz işlem limitine ulaştınız.',
  },
  en: {
    heading: 'Product pages',
    toggle: 'Create a separate page for each product',
    off: 'While off, products only appear as cards on the home page; product addresses return 404.',
    itemPage: 'Show on the home page',
    homeFull: 'The home showcase is full. Turn another product off or raise the showcase count to show this one.',
    sample: 'This text was drafted by the platform as a sample. Approve or edit it if it fits your business.',
    approve: 'Approve content',
    slug: 'Page address',
    slugAuto: 'The address is built from the product name. If you rename it, the old address redirects to the new one.',
    draft: 'Draft: not published until a name, image or price is added.',
    sku: 'Product code (SKU)',
    priceMode: 'Price display',
    priceShow: 'Show the price',
    priceAsk: 'Contact us for pricing',
    seoTitle: 'SEO title',
    seoDescription: 'SEO description',
    gallery: 'Product images',
    alt: 'Image description (alt text)',
    upload: 'Upload image',
    specs: 'Specifications',
    specName: 'Name',
    specValue: 'Value',
    addSpec: 'Add specification',
    video: 'Product video (YouTube or Vimeo link)',
    videoInvalid: 'This link was not recognized; only YouTube or Vimeo links are accepted.',
    blocks: 'Content blocks',
    blockHeading: 'Subheading',
    blockBody: 'Text (use "- " per line for a list)',
    addBlock: 'Add block',
    remove: 'Remove',
    aiWrite: 'Write text with AI',
    aiWriting: 'Writing…',
    aiThin: 'Your site has too little information about this product, so a short starter text was prepared. Add details and try again.',
    aiFailed: 'Could not write the text. Please try again.',
    aiNoCredits: 'Not enough AI credits.',
    aiDaily: 'You reached the free daily action limit.',
  },
} as const

export function ProductItemFields({
  site,
  index,
  section,
  onDispatch,
}: {
  site: WebsiteSchema
  index: number
  section: ProductsData
  onDispatch: (op: EditOperation) => void
}) {
  const lang = site.meta.language === 'en' ? 'en' : 'tr'
  const c = COPY[lang]
  const projectId = useEditorProjectId()
  const inline = section.inline === true
  const items = withProductSlugs(section).items
  const onHome = new Set(homeProductIndexes(section))
  const homeLimit = section.limit ?? PRODUCT_HOME_DEFAULT_LIMIT
  const [writing, setWriting] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const patchItem = (item: number, patch: Extract<EditOperation, { op: 'updateProductItem' }>['patch']) =>
    onDispatch({ op: 'updateProductItem', index, item, patch })

  const writeWithAi = async (item: number) => {
    if (writing !== null) return
    setWriting(item)
    setNotice(null)
    try {
      const res = await fetch('/api/product-detail', {
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
      patchItem(item, { blocks: data.blocks })
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

      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--color-brand)]"
          checked={inline}
          onChange={(e) => onDispatch({ op: 'updateProductsCatalog', index, inline: e.target.checked })}
        />
        {c.toggle}
      </label>
      {!inline ? <p className="text-xs text-muted-foreground">{c.off}</p> : null}

      {inline && (
        <>
          {notice ? (
            <p role="status" className="text-xs text-muted-foreground">
              {notice}
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            {items.map((item, i) => {
              const blocks = item.detail ?? []
              const specs = item.specs ?? []
              const gallery = item.images ?? (isUsableImageSrc(item.src) ? [{ src: item.src, alt: item.alt }] : [])
              const shownOnHome = onHome.has(i)
              const homeLocked = !shownOnHome && onHome.size >= homeLimit
              const videoValue = item.videoUrl ?? ''
              const updateBlock = (b: number, next: Partial<(typeof blocks)[number]>) =>
                patchItem(i, { blocks: blocks.map((x, k) => (k === b ? { ...x, ...next } : x)) })
              const updateSpec = (s: number, next: Partial<(typeof specs)[number]>) =>
                patchItem(i, { specs: specs.map((x, k) => (k === s ? { ...x, ...next } : x)) })
              return (
                <details key={i} className="rounded-md border border-border">
                  <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium">
                    {item.name || `#${i + 1}`}
                    {isPlaceholderProduct(item) ? <span className="ml-2 text-xs font-normal text-muted-foreground">{c.draft}</span> : null}
                  </summary>
                  <div className="flex flex-col gap-3 border-t border-border p-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--color-brand)]"
                        checked={shownOnHome}
                        disabled={homeLocked}
                        onChange={(e) => patchItem(i, { showOnHome: e.target.checked })}
                      />
                      {c.itemPage}
                    </label>
                    {homeLocked ? <p className="text-xs text-muted-foreground">{c.homeFull}</p> : null}

                    {(
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

                        <div className="flex flex-col gap-1 text-xs">
                          <span className="font-medium text-muted-foreground">{c.slug}</span>
                          <code className="rounded-md bg-muted px-2 py-1.5 font-mono text-foreground">
                            {item.slug ? `/urunlerimiz/…/${item.slug}` : '—'}
                          </code>
                          <span className="text-muted-foreground">{c.slugAuto}</span>
                        </div>
                        <TextField label={c.sku} value={item.sku ?? ''} mono maxLength={60} onCommit={(v) => patchItem(i, { sku: v })} />

                        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                          {c.priceMode}
                          <select
                            className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                            value={item.priceMode ?? 'show'}
                            onChange={(e) => patchItem(i, { priceMode: e.target.value === 'ask' ? 'ask' : 'show' })}
                          >
                            <option value="show">{c.priceShow}</option>
                            <option value="ask">{c.priceAsk}</option>
                          </select>
                        </label>

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
                          <span className="text-xs font-medium text-muted-foreground">{c.gallery}</span>
                          {gallery.map((image, g) => (
                            <div key={g} className="flex items-start gap-2">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={image.src}
                                alt=""
                                className="h-14 w-14 shrink-0 rounded-md border border-border object-cover"
                              />
                              <div className="flex-1">
                                <TextField
                                  label={c.alt}
                                  value={image.alt ?? ''}
                                  onCommit={(v) =>
                                    patchItem(i, { images: gallery.map((x, k) => (k === g ? { ...x, alt: v } : x)) })
                                  }
                                />
                              </div>
                              <IconBtn
                                label={c.remove}
                                small
                                onClick={() => patchItem(i, { images: gallery.filter((_, k) => k !== g) })}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </IconBtn>
                            </div>
                          ))}
                          {gallery.length < PRODUCT_IMAGES_MAX && (
                            <>
                              <UploadButton
                                label={c.upload}
                                icon={<Upload className="h-3.5 w-3.5" />}
                                onFile={(dataUri) =>
                                  patchItem(i, { images: [...gallery, { src: dataUri, alt: item.name }] })
                                }
                              />
                              <AiImagePreviewPanel
                                site={site}
                                sectionKey={`products:${index}.${i}`}
                                projectId={projectId}
                                canAdd
                                disabled={writing !== null}
                                onUse={(image) => {
                                  if (isUsableImageSrc(image.src)) {
                                    patchItem(i, { images: [...gallery, { src: image.src, alt: image.alt || item.name }] })
                                  }
                                }}
                              />
                            </>
                          )}
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <span className="text-xs font-medium text-muted-foreground">{c.specs}</span>
                          {specs.map((spec, s) => (
                            <div key={s} className="flex items-end gap-2">
                              <div className="flex-1">
                                <TextField label={c.specName} value={spec.name} onCommit={(v) => updateSpec(s, { name: v })} />
                              </div>
                              <div className="flex-1">
                                <TextField label={c.specValue} value={spec.value} onCommit={(v) => updateSpec(s, { value: v })} />
                              </div>
                              <IconBtn
                                label={c.remove}
                                small
                                onClick={() => patchItem(i, { specs: specs.filter((_, k) => k !== s) })}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </IconBtn>
                            </div>
                          ))}
                          {specs.length < PRODUCT_SPECS_MAX && (
                            <GhostButton onClick={() => patchItem(i, { specs: [...specs, { name: '', value: '' }] })}>
                              <Plus className="h-3.5 w-3.5" />
                              {c.addSpec}
                            </GhostButton>
                          )}
                        </div>

                        <TextField
                          label={c.video}
                          value={videoValue}
                          maxLength={300}
                          hint={videoValue && !parseVideoUrl(videoValue) ? c.videoInvalid : undefined}
                          onCommit={(v) => patchItem(i, { videoUrl: v })}
                        />

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
