'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { WebsiteSchema } from '@/lib/website-schema'
import type { EditOperation } from '@/lib/website-edit-operations'
import { canAddEntry, canRemoveEntry, limitReason } from '@/lib/list-limits'
import {
  defaultServicesLinkLabel,
  findServicesPage,
  serviceDetailHint,
  withServiceSlugs,
} from '@/lib/service-pages'
import { GhostButton, TextField } from '@/components/editor/editor-fields'
import { ServiceCardEditor } from '@/components/editor/service-card-editor'
import { useEditorProjectId, useSitePublished } from '@/components/editor/published-context'
import { SERVICE_DETAIL_REQUEST_TIMEOUT_MS } from '@/lib/ai-action-costs'

type ServicesData = Extract<WebsiteSchema['sections'][number], { type: 'services' }>
const COPY = {
  tr: {
    heading: 'Hizmetler',
    addService: 'Hizmet ekle',
    pageToggle: 'Her hizmet için ayrı sayfa oluştur',
    linkToggle: 'Ana sayfada "Tüm hizmetlerimiz" bağlantısını göster',
    linkLabel: 'Bağlantı metni',
    listTitle: 'Liste sayfası başlığı',
    ctaTitle: 'Alt çağrı başlığı',
    ctaText: 'Alt çağrı metni',
    ctaLabel: 'Alt çağrı buton metni',
    advancedCta: 'Gelişmiş: Alt çağrı bandı',
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
    aiTimeout: 'İstek zaman aşımına uğradı. Lütfen yeniden deneyin.',
    aiNoCredits: 'AI krediniz yetersiz.',
    aiDaily: 'Günlük ücretsiz işlem limitine ulaştınız.',
  },
  en: {
    heading: 'Services',
    addService: 'Add service',
    pageToggle: 'Create a separate page for each service',
    linkToggle: 'Show the "All our services" link on the home page',
    linkLabel: 'Link label',
    listTitle: 'List page title',
    ctaTitle: 'Bottom CTA title',
    ctaText: 'Bottom CTA text',
    ctaLabel: 'Bottom CTA button text',
    advancedCta: 'Advanced: Bottom CTA band',
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
    aiTimeout: 'The request timed out. Please try again.',
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
  const hasCustomCta = Boolean(detail?.ctaTitle?.trim() || detail?.ctaText?.trim() || detail?.ctaLabel?.trim())
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
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), SERVICE_DETAIL_REQUEST_TIMEOUT_MS)
    try {
      const res = await fetch('/api/service-detail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schema: site, item }),
        signal: controller.signal,
      })
      if (res.status === 402) throw new Error(c.aiNoCredits)
      if (res.status === 429) throw new Error(c.aiDaily)
      if (!res.ok) throw new Error(c.aiFailed)
      const data = (await res.json()) as {
        blocks?: { heading?: string; level?: 'h2' | 'h3'; body: string }[]
        description?: string
        icon?: string
        thinFacts?: boolean
      }
      if (!Array.isArray(data.blocks) || data.blocks.length === 0) throw new Error(c.aiFailed)
      patchItem(item, {
        blocks: data.blocks,
        ...(data.description ? { description: data.description } : {}),
        ...(data.icon ? { icon: data.icon } : {}),
        pageEnabled: true,
      })
      if (data.thinFacts) setNotice(c.aiThin)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') setNotice(c.aiTimeout)
      else if (err instanceof Error && (err.message === c.aiNoCredits || err.message === c.aiDaily)) setNotice(err.message)
      else setNotice(c.aiFailed)
    } finally {
      clearTimeout(timeoutId)
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

      {hasCustomCta && (
        <details className="rounded-md border border-border">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium">{c.advancedCta}</summary>
          <div className="flex flex-col gap-3 border-t border-border p-3">
            <TextField
              label={c.ctaTitle}
              value={detail?.ctaTitle ?? ''}
              onCommit={(value) => patchList({ ctaTitle: value })}
            />
            <TextField
              label={c.ctaText}
              value={detail?.ctaText ?? ''}
              multiline
              rows={2}
              onCommit={(value) => patchList({ ctaText: value })}
            />
            <TextField
              label={c.ctaLabel}
              value={detail?.ctaLabel ?? ''}
              onCommit={(value) => patchList({ ctaLabel: value })}
            />
          </div>
        </details>
      )}

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


          {notice ? (
            <p role="status" className="text-xs text-muted-foreground">
              {notice}
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            {items.map((item, i) => (
              <ServiceCardEditor
                key={i}
                site={site}
                index={index}
                item={item}
                itemIndex={i}
                total={items.length}
                lang={lang}
                pageOn={pageOn}
                listSlug={listSlug}
                busy={writing !== null}
                writing={writing === i}
                onWriteWithAi={() => void writeWithAi(i)}
                onDispatch={onDispatch}
                projectId={projectId}
              />
            ))}
            <GhostButton
              disabled={!canAddEntry('services', items.length)}
              onClick={() => onDispatch({ op: 'addItem', index })}
            >
              <Plus className="h-3.5 w-3.5" />
              {c.addService}
            </GhostButton>
            {!canAddEntry('services', items.length) && (
              <p className="text-xs text-muted-foreground" data-testid="list-limit-add-reason">
                {limitReason('services', 'add', lang)}
              </p>
            )}
            {!canRemoveEntry('services', items.length) && (
              <p className="text-xs text-muted-foreground" data-testid="list-limit-remove-reason">
                {limitReason('services', 'remove', lang)}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
