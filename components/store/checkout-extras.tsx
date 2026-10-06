'use client'

/**
 * Shared checkout building blocks reused by BOTH the real published-store
 * checkout (`checkout-form.tsx`) and the demo-store checkout
 * (`demo-site/demo-checkout.tsx`), so invoice capture and legal consent stay
 * identical everywhere. These are pure presentational/controlled components —
 * no server imports — so the demo tree never pulls in store server actions.
 */

import { useState } from 'react'
import { FileText, ShieldCheck, X } from 'lucide-react'
import {
  buildDistanceSalesNotice,
  buildKvkkNotice,
  type StoreLegalDoc,
} from '@/lib/store-legal'

/** Structurally compatible with store-customer's InvoiceInfo. */
export type InvoiceInput = {
  type: 'individual' | 'corporate'
  tckn?: string
  companyName?: string
  taxOffice?: string
  taxNumber?: string
  address?: string
}

export type LegalConsentState = {
  sales: boolean
  kvkk: boolean
}

const inputClass =
  'h-11 w-full rounded-lg border border-input bg-background/60 px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30'

export function LabeledInput({
  label,
  value,
  onChange,
  type = 'text',
  inputMode,
  maxLength,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  inputMode?: 'numeric' | 'text'
  maxLength?: number
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        maxLength={maxLength}
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

/**
 * Invoice fieldset with a bireysel/kurumsal toggle. Individual collects an
 * optional TC kimlik no; corporate collects company title + tax office + tax
 * number — matching Turkish e-invoice practice.
 */
export function InvoiceFields({
  value,
  onChange,
}: {
  value: InvoiceInput
  onChange: (v: InvoiceInput) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {(['individual', 'corporate'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onChange({ ...value, type: t })}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              value.type === t
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'individual' ? 'Bireysel' : 'Kurumsal'}
          </button>
        ))}
      </div>

      {value.type === 'individual' ? (
        <LabeledInput
          label="TC Kimlik No (isteğe bağlı)"
          value={value.tckn ?? ''}
          onChange={(v) => onChange({ ...value, tckn: v })}
          inputMode="numeric"
          maxLength={11}
        />
      ) : (
        <>
          <LabeledInput
            label="Firma Unvanı"
            value={value.companyName ?? ''}
            onChange={(v) => onChange({ ...value, companyName: v })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <LabeledInput
              label="Vergi Dairesi"
              value={value.taxOffice ?? ''}
              onChange={(v) => onChange({ ...value, taxOffice: v })}
            />
            <LabeledInput
              label="Vergi No"
              value={value.taxNumber ?? ''}
              onChange={(v) => onChange({ ...value, taxNumber: v })}
              inputMode="numeric"
            />
          </div>
        </>
      )}
      <LabeledInput
        label="Fatura Adresi (isteğe bağlı)"
        value={value.address ?? ''}
        onChange={(v) => onChange({ ...value, address: v })}
      />
    </div>
  )
}

/**
 * Mandatory legal consent for distance-selling compliance. The buyer must
 * confirm they read the store's Mesafeli Satış Sözleşmesi + Ön Bilgilendirme
 * and the KVKK aydınlatma. The documents are STORE-scoped (generated from the
 * store name via `lib/store-legal`) and open in an inline modal — NOT the
 * platform's SaaS legal pages, which don't apply to retail purchases.
 */
export function LegalConsent({
  value,
  onChange,
  storeName = '',
}: {
  value: LegalConsentState
  onChange: (v: LegalConsentState) => void
  storeName?: string
}) {
  const [openDoc, setOpenDoc] = useState<StoreLegalDoc | null>(null)

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-4">
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={value.sales}
          onChange={(e) => onChange({ ...value, sales: e.target.checked })}
          className="mt-0.5 size-4 shrink-0 accent-[var(--site-primary,#7c3aed)]"
        />
        <span className="text-muted-foreground">
          <button
            type="button"
            onClick={() => setOpenDoc(buildDistanceSalesNotice(storeName))}
            className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
          >
            Ön Bilgilendirme ve Mesafeli Satış Sözleşmesi
          </button>
          &apos;ni okudum ve onaylıyorum.
        </span>
      </label>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={value.kvkk}
          onChange={(e) => onChange({ ...value, kvkk: e.target.checked })}
          className="mt-0.5 size-4 shrink-0 accent-[var(--site-primary,#7c3aed)]"
        />
        <span className="text-muted-foreground">
          Kişisel verilerimin işlenmesine ilişkin{' '}
          <button
            type="button"
            onClick={() => setOpenDoc(buildKvkkNotice(storeName))}
            className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
          >
            KVKK Aydınlatma Metni
          </button>
          &apos;ni okudum, onay veriyorum.
        </span>
      </label>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5" />
        Siparişi tamamlamak için her iki onay da gereklidir.
      </p>

      {openDoc && <LegalDocModal doc={openDoc} onClose={() => setOpenDoc(null)} />}
    </div>
  )
}

/** Inline reader for a store legal document. Themed to work on both surfaces. */
function LegalDocModal({ doc, onClose }: { doc: StoreLegalDoc; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={doc.title}
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <h3 className="font-display text-base font-bold">{doc.title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {doc.sections.map((s, i) => (
            <section key={i} className="mb-5 last:mb-0">
              <h4 className="mb-1.5 text-sm font-semibold">{s.heading}</h4>
              {s.paragraphs.map((p, j) => (
                <p key={j} className="mb-2 text-sm leading-relaxed text-muted-foreground">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
        <div className="border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Okudum, kapat
          </button>
        </div>
      </div>
    </div>
  )
}

/** Section heading helper used above the invoice block. */
export function InvoiceHeading() {
  return (
    <h2 className="flex items-center gap-2 font-display text-lg font-bold">
      <FileText className="size-5 text-primary" />
      Fatura bilgileri
    </h2>
  )
}
