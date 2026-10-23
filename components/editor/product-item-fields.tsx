'use client'

import { useState } from 'react'
import { Plus, Sparkles, Trash2, Upload } from 'lucide-react'
import type { WebsiteSchema } from '@/lib/website-schema'
import type { EditOperation } from '@/lib/website-edit-operations'
import { SERVICE_ITEM_LIMITS } from '@/lib/service-item-limits'
import { PRODUCT_HOME_DEFAULT_LIMIT, PRODUCT_SPECS_MAX } from '@/lib/list-limits'
import { parseVideoUrl } from '@/lib/catalog-public'
import {
  PRODUCT_DESCRIPTION_MAX,
  PRODUCT_SHORT_NOTE_MAX,
  homeProductIndexes,
  isPlaceholderProduct,
  mergedProductDescription,
  withProductSlugs,
} from '@/lib/product-items'
import { effectiveCategories, selectedCategory } from '@/lib/product-categories'
import { isUsableImageSrc } from '@/lib/about-media'
import { GhostButton, IconBtn, TextField, UploadButton } from '@/components/editor/editor-fields'
import { useEditorProjectId } from '@/components/editor/published-context'
import { AiImagePreviewPanel } from '@/components/editor/ai-image-preview-panel'
import { ProductImagesEditor } from '@/components/editor/product-images-editor'

type ProductsData = Extract<WebsiteSchema['sections'][number], { type: 'products' }>

const COPY = {
  tr: {
    heading: 'Ürün sayfaları',
    banner: 'Katalog sayfa görseli',
    bannerHint: 'Ürün sayfalarının üstündeki geniş başlık görseli. Boşsa ana görseliniz kullanılır.',
    bannerAlt: 'Görsel açıklaması (alt metin)',
    bannerUpload: 'Görsel yükle',
    bannerReplace: 'Görseli değiştir',
    shortNotePlaceholder: 'Örn. Aynı gün kargo',
    descriptionPlaceholder: 'Ürünü kısaca anlatın: özellikleri, kullanım alanı, kimler için uygun olduğu…',
    itemPage: 'Ana sayfada göster',
    homeFull: 'Ana sayfa vitrini dolu. Yeni bir ürün göstermek için önce başka birini kapatın ya da vitrin sayısını artırın.',
    sample: 'Bu metin platform tarafından örnek olarak hazırlandı. İşletmenize uygunsa onaylayın ya da düzenleyin.',
    approve: 'İçeriği onayla',
    draft: 'Taslak: ad, görsel veya fiyat girilene kadar yayınlanmaz.',
    sku: 'Ürün kodu (SKU)',
    priceMode: 'Fiyat gösterimi',
    priceShow: 'Fiyatı göster',
    priceAsk: 'Fiyat için iletişime geçin',
    seoTitle: 'SEO başlığı',
    seoDescription: 'SEO açıklaması',
    specs: 'Teknik özellikler',
    specName: 'Özellik',
    specValue: 'Değer',
    addSpec: 'Özellik ekle',
    video: 'Ürün videosu (YouTube veya Vimeo bağlantısı)',
    videoInvalid: 'Bu bağlantı tanınmadı; yalnızca YouTube veya Vimeo bağlantıları kabul edilir.',
    description: 'Açıklama',
    descriptionHint: 'İlk paragraf ürün sayfasında fiyatın altında özet olarak görünür.',
    shortNote: 'Kısa not (fiyatın altında, en çok 80 karakter)',
    category: 'Kategori',
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
    banner: 'Catalog page banner',
    bannerHint: 'The wide header image above the product pages. Your main site image is used when empty.',
    bannerAlt: 'Image description (alt text)',
    bannerUpload: 'Upload image',
    bannerReplace: 'Replace image',
    shortNotePlaceholder: 'e.g. Same-day shipping',
    descriptionPlaceholder: 'Describe the product briefly: features, how it is used, who it is for…',
    itemPage: 'Show on the home page',
    homeFull: 'The home showcase is full. Turn another product off or raise the showcase count to show this one.',
    sample: 'This text was drafted by the platform as a sample. Approve or edit it if it fits your business.',
    approve: 'Approve content',
    draft: 'Draft: not published until a name, image or price is added.',
    sku: 'Product code (SKU)',
    priceMode: 'Price display',
    priceShow: 'Show the price',
    priceAsk: 'Contact us for pricing',
    seoTitle: 'SEO title',
    seoDescription: 'SEO description',
    specs: 'Specifications',
    specName: 'Name',
    specValue: 'Value',
    addSpec: 'Add specification',
    video: 'Product video (YouTube or Vimeo link)',
    videoInvalid: 'This link was not recognized; only YouTube or Vimeo links are accepted.',
    description: 'Description',
    descriptionHint: 'The first paragraph appears as the summary under the price on the product page.',
    shortNote: 'Short note (under the price, up to 80 characters)',
    category: 'Category',
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
  const items = withProductSlugs(section).items
  const onHome = new Set(homeProductIndexes(section))
  const homeLimit = section.limit ?? PRODUCT_HOME_DEFAULT_LIMIT
  const [writing, setWriting] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const bannerSrc = section.pageImage?.src && isUsableImageSrc(section.pageImage.src) ? section.pageImage.src : ''
  const setBanner = (src: string, alt: string) => onDispatch({ op: 'updateProductsPageImage', index, src, alt })

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
      const written = data.blocks
        .flatMap((block) => [block.heading?.trim(), block.body.trim()])
        .filter(Boolean)
        .join('\n\n')
      patchItem(item, { description: written })
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

      {(
        <>
          {notice ? (
            <p role="status" className="text-xs text-muted-foreground">
              {notice}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 rounded-md border border-border p-3">
            <span className="text-xs font-medium text-muted-foreground">{c.banner}</span>
            <p className="text-[11px] leading-snug text-muted-foreground/80">{c.bannerHint}</p>
            {bannerSrc ? (
              <div className="flex items-start gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={bannerSrc} alt="" className="h-14 w-24 shrink-0 rounded-md border border-border object-cover" />
                <div className="flex-1">
                  <TextField
                    label={c.bannerAlt}
                    value={section.pageImage?.alt ?? ''}
                    maxLength={SERVICE_ITEM_LIMITS.alt}
                    onCommit={(v) => setBanner(bannerSrc, v)}
                  />
                </div>
                <IconBtn label={c.remove} small onClick={() => onDispatch({ op: 'updateProductsPageImage', index, src: '' })}>
                  <Trash2 className="h-3.5 w-3.5" />
                </IconBtn>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <UploadButton
                label={bannerSrc ? c.bannerReplace : c.bannerUpload}
                icon={<Upload className="h-3.5 w-3.5" />}
                onFile={(dataUri) => setBanner(dataUri, section.pageImage?.alt ?? '')}
              />
            </div>
            <AiImagePreviewPanel
              site={site}
              sectionKey={`productsbanner:${index}`}
              projectId={projectId}
              canAdd
              disabled={writing !== null}
              onUse={(image) => setBanner(image.src, image.alt)}
            />
          </div>

          <div className="flex flex-col gap-2">
            {items.map((item, i) => {
              const specs = item.specs ?? []
              const categories = effectiveCategories(section)
              const shownOnHome = onHome.has(i)
              const homeLocked = !shownOnHome && onHome.size >= homeLimit
              const videoValue = item.videoUrl ?? ''
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

                        <ProductImagesEditor
                          site={site}
                          sectionIndex={index}
                          productIndex={i}
                          product={item}
                          projectId={projectId}
                          disabled={writing !== null}
                          onChange={(images) => patchItem(i, { images })}
                        />

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

                        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                          {c.category}
                          <select
                            className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                            value={selectedCategory(section, item.category)}
                            onChange={(e) => patchItem(i, { category: e.target.value })}
                          >
                            {categories.map((name) => (
                              <option key={name} value={name}>
                                {name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <TextField
                          label={c.shortNote}
                          value={item.shortNote ?? ''}
                          placeholder={c.shortNotePlaceholder}
                          maxLength={PRODUCT_SHORT_NOTE_MAX}
                          onCommit={(v) => patchItem(i, { shortNote: v })}
                        />

                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            disabled={writing !== null}
                            onClick={() => void writeWithAi(i)}
                            className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-brand hover:underline disabled:opacity-50"
                          >
                            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                            {writing === i ? c.aiWriting : c.aiWrite}
                          </button>
                          <TextField
                            label={c.description}
                            hint={c.descriptionHint}
                            placeholder={c.descriptionPlaceholder}
                            value={mergedProductDescription(item)}
                            multiline
                            rows={6}
                            maxLength={PRODUCT_DESCRIPTION_MAX}
                            onCommit={(v) => patchItem(i, { description: v })}
                          />
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
