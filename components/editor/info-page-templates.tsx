'use client'

import { useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { loadStoreFactsAction } from '@/lib/info-pages-actions'
import {
  buildInfoPage,
  INFO_TEMPLATE_IDS,
  STORE_FED_TEMPLATES,
  type InfoTemplateId,
  type StoreFacts,
} from '@/lib/info-pages'
import { starterSectorFor } from '@/lib/starter-blog'
import { isStorefront, type WebsiteSchema } from '@/lib/website-schema'
import type { EditOperation } from '@/lib/website-edit-operations'

const COPY = {
  tr: {
    heading: 'Hazır bilgi sayfaları',
    hint: 'Taslaklar yalnızca genel ifadeler içerir; rakam ve süreler sizden gelir.',
    labels: {
      faq: 'Sık Sorulan Sorular',
      about: 'Hakkımızda',
      shipping: 'Kargo ve Teslimat',
      payment: 'Ödeme Seçenekleri',
      returns: 'İade ve Değişim',
    } as Record<InfoTemplateId, string>,
    storeOnly: 'Mağaza ayarlarından beslenir',
    added: (title: string, n: number) =>
      n > 0
        ? `"${title}" eklendi. ${n} madde sizin bilginizi bekliyor; doldurana kadar yayında görünmez.`
        : `"${title}" eklendi.`,
    failed: 'Sayfa eklenemedi. Tekrar deneyin.',
    limit: 'Sayfa sınırına ulaştınız.',
  },
  en: {
    heading: 'Ready-made info pages',
    hint: 'Drafts only contain general wording; numbers and timings come from you.',
    labels: {
      faq: 'Frequently Asked Questions',
      about: 'About Us',
      shipping: 'Shipping and Delivery',
      payment: 'Payment Options',
      returns: 'Returns and Exchanges',
    } as Record<InfoTemplateId, string>,
    storeOnly: 'Filled from your store settings',
    added: (title: string, n: number) =>
      n > 0
        ? `"${title}" added. ${n} item(s) await your input and stay hidden until you fill them in.`
        : `"${title}" added.`,
    failed: 'Could not add the page. Try again.',
    limit: 'You reached the page limit.',
  },
} as const

export function InfoPageTemplates({
  site,
  projectId,
  canAdd,
  onDispatch,
}: {
  site: WebsiteSchema
  /** Owner/admin only: enables the store-fed Shipping and Payment drafts. */
  projectId?: string | null
  canAdd: boolean
  onDispatch: (op: EditOperation) => void
}) {
  const { lang } = useLanguage()
  const l = lang === 'tr' ? 'tr' : 'en'
  const c = COPY[l]
  const [busy, setBusy] = useState<InfoTemplateId | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const storefront = isStorefront(site)

  const templates = INFO_TEMPLATE_IDS.filter((id) => storefront || !STORE_FED_TEMPLATES.includes(id))

  async function add(template: InfoTemplateId) {
    if (!canAdd || busy) return
    setBusy(template)
    setNote(null)
    try {
      let store: StoreFacts | null = null
      if (storefront && projectId && STORE_FED_TEMPLATES.includes(template)) {
        store = await loadStoreFactsAction(projectId)
      }
      const draft = buildInfoPage({
        template,
        lang: l,
        sector: starterSectorFor({
          name: site.navigation.logoText,
          description: site.meta?.tagline ?? '',
          storefront,
        }),
        siteName: site.navigation.logoText,
        store,
        existingSlugs: site.pages.map((p) => p.slug),
      })
      onDispatch({
        op: 'addInfoPage',
        page: { slug: draft.slug, title: draft.title, sections: draft.sections, seo: draft.seo },
      })
      setNote(c.added(draft.title, draft.placeholders))
    } catch {
      setNote(c.failed)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border p-2.5">
      <span className="text-xs font-medium text-foreground">{c.heading}</span>
      <p className="text-[11px] leading-snug text-muted-foreground">{c.hint}</p>
      <div className="flex flex-col gap-1">
        {templates.map((id) => (
          <button
            key={id}
            type="button"
            disabled={!canAdd || busy !== null}
            onClick={() => add(id)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <FileText className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            )}
            <span className="flex-1">{c.labels[id]}</span>
            {STORE_FED_TEMPLATES.includes(id) && (
              <span className="text-[10px] text-muted-foreground">{c.storeOnly}</span>
            )}
          </button>
        ))}
      </div>
      {!canAdd && <p className="text-[11px] text-muted-foreground">{c.limit}</p>}
      {note && (
        <p role="status" className="text-[11px] leading-snug text-muted-foreground">
          {note}
        </p>
      )}
    </div>
  )
}
