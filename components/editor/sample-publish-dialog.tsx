'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, EyeOff, Loader2, Pencil, Trash2 } from 'lucide-react'
import { collectSampleFindings, type SampleKind } from '@/lib/sample-content'
import { useDialogFocusTrap } from '@/components/editor/use-dialog-focus-trap'
import type { WebsiteSchema } from '@/lib/website-schema'

type Lang = 'tr' | 'en'

const COPY = {
  tr: {
    title: 'Yayınlamadan önce örnek içerikleri kontrol edin',
    body: 'Yapay zekanın hazırladığı aşağıdaki içerikler örnektir; gerçek müşteri yorumu, rakam, indirim veya fiyat olmayabilir. Gerçek değillerse yayınlamayın. Her bölüm için gizleyebilir, düzenleyebilir veya gerçek olduğunu onaylayabilirsiniz.',
    productsNote:
      'Örnek ürünler gerçek ürün değildir. Adını ve fiyatını düzenleyerek kendi ürününüz haline getirin ya da gizleyin; onaylarsanız satışa açık ürün olarak yayınlanır.',
    attestationFailed:
      'Onayınız şu an kaydedilemedi, bu yüzden hiçbir şey yayınlanmadı. Tekrar deneyebilir ya da bu içerikleri gizleyerek yayınlayabilirsiniz.',
    deleteItem: 'Sil',
    hide: 'Gizle',
    edit: 'Düzenle',
    approve: 'Gerçek, onaylıyorum',
    approved: 'Onaylandı',
    cancel: 'Vazgeç',
    publish: 'Yayınla',
    approveAndPublish: 'Onayla ve yayınla',
    hideAllAndPublish: 'Tümünü gizle ve yayınla',
    contactNote:
      'İletişim bölümündeki telefon, e-posta, adres veya harita örnek değerdir. Gerçek bilgilerinizi girmediğiniz sürece sitede GÖRÜNMEZ; arama, WhatsApp ve harita düğmeleri de gösterilmez. Form mesajları hesap e-postanıza düşer.',
    contactEdit: 'İletişim bölümüne git',
    contactAck: 'Boş bırakarak yayınla',
    statement:
      'Onayladığım içeriklerin gerçek olduğunu ve yayınlanmasından sorumlu olduğumu beyan ederim.',
    remaining: 'onay bekliyor',
    sections: {
      hero: 'Ana görsel güven satırı',
      testimonials: 'Müşteri yorumları',
      stats: 'Rakamlar',
      pricing: 'Fiyat planları',
      products: 'Ürünler',
      contact: 'İletişim bilgileri',
    } as Record<string, string>,
    kinds: {
      contact: 'İletişim',
      testimonials: 'Yorum',
      stats: 'Rakam',
      pricing: 'Plan',
      discount: 'İndirim',
      badge: 'Rozet',
      trust: 'Güven satırı',
      product: 'Ürün',
    } as Record<SampleKind, string>,
  },
  en: {
    title: 'Review sample content before publishing',
    body: 'The content below was drafted by AI as a sample; it may not be a real customer review, figure, discount or price. Do not publish it unless it is true. For each section you can hide it, edit it, or confirm it is real.',
    productsNote:
      'Sample products are not real products. Edit the name and price to make them yours, or hide them; if you approve them they go live as products for sale.',
    attestationFailed:
      'Your approval could not be saved, so nothing was published. You can try again or hide this content and publish.',
    deleteItem: 'Delete',
    hide: 'Hide',
    edit: 'Edit',
    approve: 'This is real, approve',
    approved: 'Approved',
    cancel: 'Cancel',
    publish: 'Publish',
    approveAndPublish: 'Approve and publish',
    hideAllAndPublish: 'Hide all and publish',
    contactNote:
      'The phone, email, address or map in the contact section are placeholders. They are NOT shown on your site until you enter real details; call, WhatsApp and map buttons are hidden too. Form messages go to your account email.',
    contactEdit: 'Go to contact section',
    contactAck: 'Publish without them',
    statement: 'I confirm the content I approve is true and I am responsible for publishing it.',
    remaining: 'awaiting approval',
    sections: {
      hero: 'Hero trust line',
      testimonials: 'Testimonials',
      stats: 'Statistics',
      pricing: 'Pricing plans',
      products: 'Products',
      contact: 'Contact details',
    } as Record<string, string>,
    kinds: {
      contact: 'Contact',
      testimonials: 'Testimonial',
      stats: 'Statistic',
      pricing: 'Plan',
      discount: 'Discount',
      badge: 'Badge',
      trust: 'Trust line',
      product: 'Product',
    } as Record<SampleKind, string>,
  },
} as const

export function SamplePublishDialog({
  lang,
  site,
  gateIds,
  publishing,
  attestationFailed = false,
  onHideSections,
  onDeleteItem,
  onEditSection,
  onPublish,
  onClose,
}: {
  lang: Lang
  site: WebsiteSchema
  /** Digests the server reported as unresolved when publishing was refused. */
  gateIds: ReadonlySet<string>
  publishing: boolean
  /** The server could not store the approval and published nothing. */
  attestationFailed?: boolean
  onHideSections: (sectionIndexes: number[]) => void
  /** Deletes one product item (hides the section if it was the last one). */
  onDeleteItem: (sectionIndex: number, itemIndex: number) => void
  onEditSection: (sectionIndex: number) => void
  /** Publishes with the approved digests; `hideAll` also hides the rest first. */
  onPublish: (approvals: string[], hideSectionIndexes: number[]) => void
  onClose: () => void
}) {
  const c = COPY[lang]
  const [approved, setApproved] = useState<ReadonlySet<string>>(new Set())
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogFocusTrap(dialogRef)

  useEffect(() => {
    if (publishing) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [publishing, onClose])

  // Live from the draft, so hiding or editing a section updates the list at once.
  const sections = useMemo(
    () =>
      collectSampleFindings(site)
        .map((section) => ({ ...section, items: section.items.filter((item) => gateIds.has(item.id)) }))
        .filter((section) => section.items.length > 0),
    [site, gateIds],
  )

  const allIds = sections.flatMap((section) => section.items.map((item) => item.id))
  const pending = allIds.filter((id) => !approved.has(id)).length
  const hasProducts = sections.some((section) => section.sectionType === 'products')
  const hasContact = sections.some((section) => section.sectionType === 'contact')

  function toggleSection(ids: string[]) {
    setApproved((prev) => {
      const next = new Set(prev)
      const every = ids.every((id) => next.has(id))
      for (const id of ids) {
        if (every) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm outline-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sample-publish-title"
      aria-describedby="sample-publish-body"
    >
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex flex-col gap-2 border-b border-border p-6 pb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" aria-hidden />
            <h2 id="sample-publish-title" className="text-base font-semibold text-foreground">
              {c.title}
            </h2>
          </div>
          <p id="sample-publish-body" className="text-sm leading-relaxed text-muted-foreground">
            {c.body}
          </p>
          {attestationFailed && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs leading-relaxed text-foreground"
            >
              {c.attestationFailed}
            </p>
          )}
          {hasContact && (
            <p className="rounded-lg border border-border bg-secondary/40 p-3 text-xs leading-relaxed text-muted-foreground">
              {c.contactNote}
            </p>
          )}
          {hasProducts && (
            <p className="rounded-lg border border-border bg-secondary/40 p-3 text-xs leading-relaxed text-muted-foreground">
              {c.productsNote}
            </p>
          )}
        </div>

        <ul className="flex flex-1 flex-col gap-3 overflow-y-auto p-6 py-4">
          {sections.map((section) => {
            const ids = section.items.map((item) => item.id)
            const isApproved = ids.every((id) => approved.has(id))
            const isContact = section.sectionType === 'contact'
            return (
              <li
                key={section.sectionIndex}
                className="flex flex-col gap-3 rounded-xl border border-border bg-background/40 p-4"
              >
                <p className="text-sm font-medium text-foreground">
                  {c.sections[section.sectionType] ?? section.sectionType}
                </p>
                <ul className="flex flex-col gap-1.5">
                  {section.items.map((item) => (
                    <li key={item.id} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="mt-0.5 shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-foreground">
                        {c.kinds[item.kind]}
                      </span>
                      <span className="min-w-0 flex-1 break-words">{item.label}</span>
                      {item.kind === 'product' && item.itemIndex !== null && (
                        <button
                          type="button"
                          onClick={() => onDeleteItem(section.sectionIndex, item.itemIndex as number)}
                          disabled={publishing}
                          aria-label={`${c.deleteItem}: ${item.label}`}
                          className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden />
                          {c.deleteItem}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => toggleSection(ids)}
                    aria-pressed={isApproved}
                    disabled={publishing}
                    className={
                      isApproved
                        ? 'inline-flex h-8 items-center gap-1.5 rounded-lg border border-brand/50 bg-brand/20 px-3 text-xs font-semibold text-brand disabled:opacity-60'
                        : 'inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-60'
                    }
                  >
                    {isApproved && <Check className="h-3.5 w-3.5" aria-hidden />}
                    {isContact ? c.contactAck : isApproved ? c.approved : c.approve}
                  </button>
                  <button
                    type="button"
                    onClick={() => onEditSection(section.sectionIndex)}
                    disabled={publishing}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    {isContact ? c.contactEdit : c.edit}
                  </button>
                  {!isContact && (
                  <button
                    type="button"
                    onClick={() => onHideSections([section.sectionIndex])}
                    disabled={publishing}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
                  >
                    <EyeOff className="h-3.5 w-3.5" aria-hidden />
                    {c.hide}
                  </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        <div className="flex flex-col gap-3 border-t border-border p-6 pt-4">
          {sections.length > 0 && (
            <p className="text-xs leading-relaxed text-muted-foreground">{c.statement}</p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={publishing}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-secondary/40 px-4 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-60"
            >
              {c.cancel}
            </button>
            {sections.some((s) => s.sectionType !== 'contact') && (
              <button
                type="button"
                onClick={() =>
                  onPublish(
                    sections.filter((s) => s.sectionType === 'contact').flatMap((s) => s.items.map((i) => i.id)),
                    sections.filter((s) => s.sectionType !== 'contact').map((s) => s.sectionIndex),
                  )
                }
                disabled={publishing}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-4 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-60"
              >
                {c.hideAllAndPublish}
              </button>
            )}
            <button
              type="button"
              onClick={() => onPublish([...approved], [])}
              disabled={publishing || pending > 0}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {publishing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {sections.length === 0 ? c.publish : pending > 0 ? `${pending} ${c.remaining}` : c.approveAndPublish}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
