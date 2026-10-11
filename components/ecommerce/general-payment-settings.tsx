'use client'

import { useState, useTransition } from 'react'
import { Check, CreditCard, Landmark, Loader2, Truck, UserRound } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import {
  saveGeneralPaymentSettings,
  type GeneralPaymentView,
} from '@/lib/store-payments/general-settings'
import { COD_FEE_MAX_CENTS, formatCodFeeInput } from '@/lib/store-checkout-rules'
import {
  PaymentModuleBadges,
  closedReasonText,
} from '@/components/ecommerce/payment-summary-parts'

const copy = {
  tr: {
    status: 'Genel durum',
    ordersOpen: 'Siparişler açık',
    ordersClosed: 'Siparişler kapalı',
    guest: 'Misafir alışverişi',
    guestHint:
      'Açıkken müşteriler üye olmadan sipariş verebilir. Kapalıyken ödeme için mağaza hesabıyla giriş yapmaları gerekir.',
    bank: 'Havale / EFT',
    bankHint: 'Müşteri havale yapar, siz onaylarsınız.',
    bankDetails: 'Havale ayrıntıları (IBAN, banka, süre)',
    cod: 'Kapıda ödeme',
    codHint: 'Ödeme teslimatta alınır.',
    codFee: 'Kapıda ödeme ek ücreti (TL)',
    codFeeHint: `0 ile 1.000 TL arası, en fazla iki ondalık. Yalnızca kapıda ödeme seçilince siparişe eklenir. Boş bırakırsanız 0.`,
    card: 'Kredi kartı',
    cardHint: 'Alıcıya tek bir "Kredi/Banka kartı" seçeneği gösterilir.',
    activeProvider: 'Aktif sanal pos',
    soon: 'Yakında',
    cardNotReady:
      'Seçili sanal posun bağlantı testi geçmedi, bu yüzden kart seçeneği alıcıya gösterilmez. PayTR sekmesinden bilgileri girip testi geçin.',
    cardUnreadable:
      'Kayıtlı kimlik bilgisi okunamadı, kart seçeneği alıcıya gösterilmez. PayTR sekmesinden bilgileri yeniden girin.',
    goPaytr: 'PayTR sekmesine git',
    update: 'Güncelle',
    saving: 'Kaydediliyor...',
    saved: 'Güncellendi',
    migration:
      'Veritabanı güncellemesi (scripts/036) henüz uygulanmadığı için bu değerler kaydedilemiyor. Misafir alışverişi açık ve ücret 0 kalmalıdır.',
    errors: {
      invalid_fee: 'Ek ücret 0 ile 1.000 TL arasında, en fazla iki ondalıklı olmalı.',
      provider_unavailable: 'Seçilen sanal pos henüz kullanılamıyor.',
      card_not_ready:
        'Kart modülü açılamadı: PayTR bağlantı testi geçmeli. PayTR sekmesini kullanın.',
      iban_required: 'Havale açılamadı: önce geçerli bir IBAN girip havale ayrıntılarını kaydedin.',
      migration_pending: 'Bu ayar için veritabanı güncellemesi gerekli (scripts/036).',
      save_failed: 'Ayarlar kaydedilemedi. Lütfen tekrar deneyin.',
    } as Record<string, string>,
  },
  en: {
    status: 'Overview',
    ordersOpen: 'Orders are open',
    ordersClosed: 'Orders are closed',
    guest: 'Guest checkout',
    guestHint:
      'When on, customers can order without an account. When off, they must sign in with a store account to pay.',
    bank: 'Bank transfer',
    bankHint: 'The customer transfers money and you confirm.',
    bankDetails: 'Bank transfer details (IBAN, bank, term)',
    cod: 'Cash on delivery',
    codHint: 'Payment is collected on delivery.',
    codFee: 'Cash on delivery fee (TRY)',
    codFeeHint:
      'Between 0 and 1,000 TRY, up to two decimals. Added to the order only when cash on delivery is chosen. Blank means 0.',
    card: 'Credit card',
    cardHint: 'Buyers see a single "Credit/debit card" option.',
    activeProvider: 'Active card provider',
    soon: 'Coming soon',
    cardNotReady:
      "The selected provider's connection test has not passed, so the card option is hidden from buyers. Enter credentials in the PayTR tab and pass the test.",
    cardUnreadable:
      'Stored credentials could not be read, so the card option is hidden from buyers. Re-enter them in the PayTR tab.',
    goPaytr: 'Go to PayTR tab',
    update: 'Update',
    saving: 'Saving...',
    saved: 'Updated',
    migration:
      'The database update (scripts/036) has not been applied, so these values cannot be saved. Keep guest checkout on and the fee at 0.',
    errors: {
      invalid_fee: 'The fee must be between 0 and 1,000 TRY with at most two decimals.',
      provider_unavailable: 'The selected provider is not available yet.',
      card_not_ready: 'Could not enable cards: the PayTR connection test must pass first.',
      iban_required: 'Could not enable bank transfer: save a valid IBAN in the details first.',
      migration_pending: 'This setting needs the database update (scripts/036).',
      save_failed: 'Settings could not be saved. Please try again.',
    } as Record<string, string>,
  },
}

export function GeneralPaymentSettings({
  projectId,
  initial,
  onSaved,
  onOpenBank,
  onOpenPaytr,
}: {
  projectId: string
  initial: GeneralPaymentView
  onSaved: (view: GeneralPaymentView) => void
  onOpenBank: () => void
  onOpenPaytr: () => void
}) {
  const { lang } = useLanguage()
  const l = lang === 'en' ? 'en' : 'tr'
  const c = copy[l]

  const [guest, setGuest] = useState(initial.guestCheckout)
  const [bank, setBank] = useState(initial.bankEnabled)
  const [cod, setCod] = useState(initial.codEnabled)
  const [card, setCard] = useState(initial.cardEnabled)
  const [fee, setFee] = useState(formatCodFeeInput(initial.codFeeCents))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      try {
        const res = await saveGeneralPaymentSettings(projectId, {
          guestCheckout: guest,
          cardEnabled: card,
          bankEnabled: bank,
          codEnabled: cod,
          activeCardProvider: initial.activeCardProvider,
          codFee: fee,
        })
        if (res.ok) {
          setSaved(true)
          setGuest(res.view.guestCheckout)
          setBank(res.view.bankEnabled)
          setCod(res.view.codEnabled)
          setCard(res.view.cardEnabled)
          setFee(formatCodFeeInput(res.view.codFeeCents))
          onSaved(res.view)
          window.setTimeout(() => setSaved(false), 2500)
        } else {
          setError(c.errors[res.error] ?? c.errors.save_failed)
        }
      } catch {
        setError(c.errors.save_failed)
      }
    })
  }

  const { summary } = initial
  const cardProblem = initial.cardEnabled && !initial.cardReady

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-xl border border-border bg-muted/30 p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium">{c.status}</h3>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              summary.ordersOpen
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'bg-destructive/15 text-destructive'
            }`}
          >
            {summary.ordersOpen ? c.ordersOpen : c.ordersClosed}
          </span>
        </div>
        {summary.closedReason && (
          <p className="mt-2 text-sm text-destructive">{closedReasonText(summary.closedReason, l)}</p>
        )}
        <div className="mt-3">
          <PaymentModuleBadges summary={summary} lang={l} />
        </div>
      </section>

      {!initial.migrationApplied && (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {c.migration}
        </p>
      )}

      <Row
        icon={<UserRound className="size-4" />}
        title={c.guest}
        hint={c.guestHint}
        checked={guest}
        onChange={setGuest}
      />

      <Row
        icon={<Landmark className="size-4" />}
        title={c.bank}
        hint={c.bankHint}
        checked={bank}
        onChange={setBank}
      >
        <button
          type="button"
          onClick={onOpenBank}
          className="text-sm font-medium text-brand underline-offset-4 hover:underline"
        >
          {c.bankDetails}
        </button>
      </Row>

      <Row
        icon={<Truck className="size-4" />}
        title={c.cod}
        hint={c.codHint}
        checked={cod}
        onChange={setCod}
      >
        {cod && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{c.codFee}</span>
            <input
              inputMode="decimal"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              placeholder="0"
              aria-describedby="cod-fee-hint"
              className="h-10 w-40 rounded-lg border border-input bg-background/60 px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
            <span id="cod-fee-hint" className="text-xs text-muted-foreground">
              {c.codFeeHint.replace('1.000', (COD_FEE_MAX_CENTS / 100).toLocaleString('tr-TR'))}
            </span>
          </label>
        )}
      </Row>

      <Row
        icon={<CreditCard className="size-4" />}
        title={c.card}
        hint={c.cardHint}
        checked={card}
        onChange={setCard}
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">{c.activeProvider}</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="card-provider" checked readOnly className="accent-primary" />
            PayTR
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="radio" name="card-provider" disabled />
            iyzico
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{c.soon}</span>
          </label>
        </fieldset>
        {cardProblem && (
          <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {initial.cardUnreadable ? c.cardUnreadable : c.cardNotReady}{' '}
            <button type="button" onClick={onOpenPaytr} className="font-medium underline">
              {c.goPaytr}
            </button>
          </p>
        )}
      </Row>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div>
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {c.saving}
            </>
          ) : saved ? (
            <>
              <Check className="size-4" />
              {c.saved}
            </>
          ) : (
            c.update
          )}
        </button>
      </div>
    </div>
  )
}

function Row({
  icon,
  title,
  hint,
  checked,
  onChange,
  children,
}: {
  icon: React.ReactNode
  title: string
  hint: string
  checked: boolean
  onChange: (v: boolean) => void
  children?: React.ReactNode
}) {
  return (
    <section className={`rounded-xl border p-4 ${checked ? 'border-primary/40 bg-card' : 'border-border bg-card/60'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 items-center justify-center rounded-lg bg-muted">{icon}</span>
          <div>
            <h3 className="text-sm font-medium">{title}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>
          </div>
        </div>
        <label className="inline-flex shrink-0 cursor-pointer items-center">
          <input
            type="checkbox"
            className="peer sr-only"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className="relative h-6 w-11 rounded-full bg-muted transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-background after:shadow after:transition-transform peer-checked:after:translate-x-5" />
          <span className="sr-only">{title}</span>
        </label>
      </div>
      {children && <div className="mt-4 border-t border-border pt-4">{children}</div>}
    </section>
  )
}
