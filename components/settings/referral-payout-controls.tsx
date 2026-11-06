'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Banknote, Coins, WalletCards } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { createReferralPayoutRequest } from '@/lib/referrals/payout-actions'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { REFERRAL_HOLD_DAYS, REFERRAL_PAYOUT_MIN_TRY } from '@/lib/referrals/commission-config'
import {
  calculateReferralPayoutPreview,
  type ReferralPayoutAmountError,
  formatReferralTry,
  formatReferralTryInput,
  parseReferralPayoutAmount,
  REFERRAL_PAYOUT_MIN_CENTS,
  TRY_PER_CREDIT_CENTS,
  validateReferralPayoutAmount,
} from '@/lib/referrals/payout-core'
import type {
  ReferralPayoutMethod,
  ReferralPayoutPanelData,
  ReferralVatMode,
} from '@/lib/referrals/partner-types'

type Language = 'tr' | 'en'
type PayoutAmountMode = 'all' | 'specific'

const minimumPayoutTr = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(REFERRAL_PAYOUT_MIN_TRY)
const minimumPayoutEn = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(REFERRAL_PAYOUT_MIN_TRY)
const minimumCreditTr = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(TRY_PER_CREDIT_CENTS / 100)
const minimumCreditEn = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(TRY_PER_CREDIT_CENTS / 100)

const COPY = {
  tr: {
    title: 'Ödeme bakiyesi',
    description: 'Yönlendirme komisyonlarınızı ve ödeme durumunuzu takip edin.',
    total: 'Hesapta görünen',
    pending: 'Beklemede',
    available: 'IBAN\'a ödenebilir',
    requested: 'İşlemde',
    converted: 'Krediye çevrildi',
    paid: 'Ödendi',
    hold: `Komisyonlar ${REFERRAL_HOLD_DAYS} gün beklemede kalır; bekleyen tutarlar da AI kredisine hemen çevrilebilir. Kısmi dönüşümler ${minimumCreditTr} TL'nin katlarıyla yapılır; bakiyenin tamamı her zaman seçilebilir.`,
    partialCreditMultipleHint: `Kısmi AI kredi dönüşümü yalnızca ${minimumCreditTr} TL'nin katlarıyla yapılabilir. Bakiyenin tamamı, 3 TL'nin altındaki tutarlar dahil, seçilebilir.`,

    request: 'Ödeme İste',
    requestTitle: 'Bakiyenizi nasıl almak istersiniz?',
    requestDescription: 'Önce ödeme yöntemini seçin; sonraki adımda tutarı ve varsa fatura KDV seçeneğini inceleyin.',
    reviewTitle: 'Talep özeti',
    reviewDescription: 'Tutarı, ödeme ve fatura bilgilerini kontrol edin.',
    continue: 'Devam et',
    changeMethod: 'Yöntemi değiştir',
    credit: 'AI kredisi olarak al',
    cash: 'IBAN\'a ödeme iste',
    creditImmediate: 'Bu tutar, 14 günlük bekleme tamamlanmadan da AI kredisi olarak hemen eklenir.',
    commissionValue: 'Kullanılacak komisyon bakiyesi',
    bankAmount: 'Ödenecek tutar',
    amountMode: 'Tutar seçimi',
    amountAll: 'Bakiyenin tamamı',
    amountSpecific: 'Belirli tutar',
    amountLabel: 'Talep edilecek tutar (TL)',
    amountDescription: 'En fazla {maximum}. Kuruş hassasiyetinde girin; 1.234,50 ve 1234.50 biçimleri desteklenir.',
    useMaximum: 'Üst sınırı kullan',
    full: 'Tam tutar',
    partial: 'Kısmi tutar',
    vatModeTitle: 'KDV uygulaması',
    vatIncluded: 'KDV tutara dahil',
    vatAdded: 'Tutar üzerine %20 KDV eklensin',
    vatIncludedHint: 'Brüt tutar; net ve KDV bu tutardan ayrılır.',
    vatAddedHint: 'Net tutara %20 KDV eklenir.',
    invoiceNet: 'Fatura neti',
    invoiceVat: 'KDV',
    invoiceGross: 'Fatura brütü',
    partialUnavailable: 'Kısmi tutar ve şirket KDV seçenekleri yeni SQL taslağı uygulandıktan sonra kullanılabilir.',
    legacyVat: 'Yeni SQL taslağı uygulanana kadar tam şirket ödemesi mevcut %20 KDV hesaplamasını kullanır.',
    partialDebt: 'Negatif vade dilimi bulunduğundan kısmi kredi dönüşümü kapalıdır; bakiyenin tamamını dönüştürebilirsiniz.',
    credits: 'Eklenecek AI kredisi',
    topup: 'GLOVAL AI katkısı',
    invoice: 'Bu vergi statüsü için fatura gerekir; ödeme fatura onayından sonra işlenir.',
    noInvoice: 'Bireysel statüsü bu program akışında fatura gerektirmez.',
    confirm: 'Onayla',
    cancel: 'Vazgeç',
    submitting: 'İşleniyor…',
    successCash: 'Talebiniz işleme alındı. Yönetici incelemesinden sonra durum burada güncellenir.',
    successCredit: 'Talebiniz işleme alındı. AI kredileriniz bakiyenize eklendi.',
    cashUnavailable: 'Nakit ödeme şu anda kullanılamıyor.',
    noIban: 'Nakit ödeme için kayıtlı bir IBAN gerekir.',
    creditBalanceEmpty: 'AI kredisine çevrilebilir pozitif bir bakiye bulunmuyor.',
    cashWaiting: `14 günlük bekleme tamamlandığında ve kullanılabilir bakiye ${minimumPayoutTr} TL'ye ulaştığında IBAN ödemesi aktif olur.`,
    cashMinimum: `Kullanılabilir bakiye ${minimumPayoutTr} TL'ye ulaştığında IBAN ödemesi aktif olur.`,
    openCash: 'Açık bir nakit ödeme isteğiniz var; bu istek sonuçlanana kadar yeni IBAN isteği oluşturamazsınız. AI kredisine dönüşüm kullanılabilir.',
    unavailable: 'Ödeme bilgileri şu anda yüklenemiyor. Lütfen daha sonra yeniden deneyin.',
    invalidTax: 'Nakit ödeme için vergi statünüzün doğrulanması gerekiyor.',
    taxVerificationRequired: 'Bir sonraki nakit ödeme için vergi bilgilerinizin doğrulanması gerekiyor. Destek ekibimizle iletişime geçin.',
    errors: {
      not_authenticated: 'Oturum doğrulanamadı. Yeniden giriş yapın.',
      payout_disabled: 'Ödeme özelliği şu anda kullanılamıyor.',
      cash_disabled: 'Nakit ödeme şu anda kullanılamıyor.',
      not_found: 'Etkin bir satış ortaklığı bulunamadı.',
      partner_inactive: 'Kapalı bir ortaklık için ödeme isteği oluşturulamaz.',
      insufficient_balance: `IBAN'a ödenebilir bakiye ${minimumPayoutTr} TL eşiğinin altında.`,
      minimum_not_met: `Nakit ödeme tutarı en az ${minimumPayoutTr} TL olmalıdır.`,
      credit_balance_empty: 'AI kredisine çevrilebilir pozitif bir bakiye bulunmuyor.',
      terms_required: 'Ödeme isteği oluşturmadan önce güncel ortaklık şartlarını kabul edin.',
      amount_exceeds_balance: 'Girilen tutar kullanılabilir bakiyeyi aşamaz.',
      partial_credit_must_be_multiple: 'Kısmi AI kredi dönüşümü tutarı 3 TL’nin katı olmalıdır. Tam bakiyeyi seçebilir veya tutarı düzeltebilirsiniz.',
      partial_unavailable_debt: 'Negatif vade dilimi varken kısmi kredi dönüşümü yapılamaz; tam tutarı seçin.',
      vat_mode_required: 'Şirket ödemesi için bir KDV seçeneği belirleyin.',
      vat_mode_not_allowed: 'KDV seçeneği yalnızca şirket statüsündeki nakit ödemelerde kullanılabilir.',
      feature_unavailable: 'Kısmi tutar veya şirket KDV seçenekleri henüz kullanılamıyor. Tam tutar seçeneğini kullanın ya da daha sonra yeniden deneyin.',
      invalid_amount: 'Tutarı kuruş hassasiyetinde girin.',
      open_cash_request: 'Önce açık nakit ödeme isteğinizin sonuçlanmasını bekleyin.',
      tax_verification_required: 'Bir sonraki nakit ödeme için vergi bilgilerinizin doğrulanması gerekiyor.',
      missing_iban: 'Nakit ödeme için kayıtlı IBAN bulunamadı.',
      invalid_tax_status: 'Nakit ödeme için vergi bilgileriniz tamamlanmalı.',
      idempotency_conflict: 'İstek doğrulanamadı. Sayfayı yenileyip yeniden deneyin.',
      invalid_input: 'İstek bilgilerini kontrol edip yeniden deneyin.',
      credit_unavailable: 'AI kredisi eklenemedi. Bakiye değiştirilmedi; lütfen destek ekibiyle iletişime geçin.',
      unavailable: 'İstek şu anda tamamlanamıyor. Lütfen daha sonra yeniden deneyin.',
    } as Record<string, string>,
  },
  en: {
    title: 'Payout balance',
    description: 'Track your referral commissions and payout status.',
    total: 'Balance shown in account',
    pending: 'Pending',
    available: 'Available for IBAN payout',
    requested: 'In progress',
    converted: 'Converted to credits',
    paid: 'Paid',
    hold: `Commissions stay on hold for ${REFERRAL_HOLD_DAYS} days; pending amounts can also be converted to AI credits immediately. Partial conversions must be in multiples of TRY ${minimumCreditEn}; the full balance is always selectable.`,
    partialCreditMultipleHint: `Partial AI credit conversions must be in multiples of TRY ${minimumCreditEn}. The full balance, including amounts below TRY 3, can be selected.`,

    request: 'Request payout',
    requestTitle: 'How would you like to receive your balance?',
    requestDescription: 'Choose a payout method first; the next step lets you review the amount and, when required, the invoice VAT option.',
    reviewTitle: 'Request summary',
    reviewDescription: 'Review the amount, payout, and invoice details.',
    continue: 'Continue',
    changeMethod: 'Change method',
    credit: 'Receive as AI credits',
    cash: 'Request IBAN payout',
    creditImmediate: 'AI credits are added immediately, without waiting for the 14-day hold to end.',
    commissionValue: 'Commission balance used',
    bankAmount: 'Payout amount',
    amountMode: 'Amount selection',
    amountAll: 'Entire balance',
    amountSpecific: 'Specific amount',
    amountLabel: 'Requested amount (TRY)',
    amountDescription: 'Up to {maximum}. Enter kuruş precision; both 1.234,50 and 1234.50 formats are supported.',
    useMaximum: 'Use maximum',
    full: 'Full amount',
    partial: 'Partial amount',
    vatModeTitle: 'VAT treatment',
    vatIncluded: 'VAT included in amount',
    vatAdded: 'Add 20% VAT to amount',
    vatIncludedHint: 'Gross amount; net and VAT are split from it.',
    vatAddedHint: '20% VAT is added to the net amount.',
    invoiceNet: 'Invoice net',
    invoiceVat: 'VAT',
    invoiceGross: 'Invoice gross',
    partialUnavailable: 'Partial amounts and company VAT options are available after the new SQL draft is applied.',
    legacyVat: 'Until the new SQL draft is applied, full company payouts use the existing 20% VAT calculation.',
    partialDebt: 'A negative maturity bucket prevents partial credit conversion; you can still convert the full balance.',
    credits: 'AI credits to add',
    topup: 'GLOVAL AI contribution',
    invoice: 'This tax status requires an invoice; payment is processed after invoice confirmation.',
    noInvoice: 'Individual status does not require an invoice in this program workflow.',
    confirm: 'Confirm request',
    cancel: 'Cancel',
    submitting: 'Processing…',
    successCash: 'Your request is being processed. Its status will update here after administrator review.',
    successCredit: 'Your request is being processed, and the AI credits have been added to your balance.',
    cashUnavailable: 'Cash payout is not available right now.',
    noIban: 'A saved IBAN is required for cash payout.',
    creditBalanceEmpty: 'No positive balance is currently eligible for AI credit conversion.',
    cashWaiting: `IBAN payout becomes available when the ${REFERRAL_HOLD_DAYS}-day hold ends and available balance reaches TRY ${minimumPayoutEn}.`,
    cashMinimum: `IBAN payout becomes available when available balance reaches TRY ${minimumPayoutEn}.`,
    openCash: 'You have an open cash payout request; a new IBAN request is unavailable until it is resolved. AI credit conversion remains available.',
    unavailable: 'Payout information is temporarily unavailable. Please try again later.',
    invalidTax: 'Your tax status must be complete before a cash payout.',
    taxVerificationRequired: 'Your tax information must be verified before your next cash payout. Please contact support.',
    errors: {
      not_authenticated: 'Your session could not be verified. Please sign in again.',
      payout_disabled: 'Payouts are currently unavailable.',
      cash_disabled: 'Cash payout is currently unavailable.',
      not_found: 'No active referral partnership was found.',
      partner_inactive: 'A closed partnership cannot request a payout.',
      insufficient_balance: `Available balance for IBAN payout is below the TRY ${minimumPayoutEn} minimum.`,
      minimum_not_met: `A cash payout must be at least TRY ${minimumPayoutEn}.`,
      credit_balance_empty: 'No positive balance is currently eligible for AI credit conversion.',
      terms_required: 'Accept the current partner terms before requesting a payout.',
      amount_exceeds_balance: 'The amount cannot exceed the available balance.',
      partial_credit_must_be_multiple: 'Partial AI credit conversion amounts must be multiples of TRY 3. Select the full balance or adjust the amount.',
      partial_unavailable_debt: 'Partial credit conversion is unavailable while a maturity bucket is negative. Select the full amount.',
      vat_mode_required: 'Choose a VAT option for a company payout.',
      vat_mode_not_allowed: 'VAT options are only available for company cash payouts.',
      feature_unavailable: 'Partial amounts or company VAT options are not available yet. Use the full amount option or try again later.',
      invalid_amount: 'Enter an amount with kuruş precision.',
      open_cash_request: 'Wait for your open cash payout request to be resolved first.',
      tax_verification_required: 'Tax verification is required before another cash payout.',
      missing_iban: 'No saved IBAN was found for cash payout.',
      invalid_tax_status: 'Complete your tax information before requesting cash payout.',
      idempotency_conflict: 'The request could not be verified. Refresh the page and try again.',
      invalid_input: 'Check the request details and try again.',
      credit_unavailable: 'AI credits could not be added. Your balance was not changed; contact support.',
      unavailable: 'The request could not be completed right now. Please try again later.',
    } as Record<string, string>,
  },
} as const

function safeIdempotencyKey(): string {
  return crypto.randomUUID()
}

export function ReferralPayoutControls({
  enabled,
  cashEnabled,
  data,
  variant = 'dashboard',
}: {
  enabled: boolean
  cashEnabled: boolean
  data: ReferralPayoutPanelData | null
  variant?: 'compact' | 'dashboard'
}) {
  const { lang } = useLanguage()
  const language: Language = lang === 'tr' ? 'tr' : 'en'
  const copy = COPY[language]
  const locale = language === 'tr' ? 'tr-TR' : 'en-US'
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [dialogStep, setDialogStep] = useState<'method' | 'review'>('method')
  const [method, setMethod] = useState<ReferralPayoutMethod>('credit')
  const [amountMode, setAmountMode] = useState<PayoutAmountMode>('all')
  const [amountText, setAmountText] = useState('')
  const [vatMode, setVatMode] = useState<ReferralVatMode | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  if (!enabled || !data) return null

  const state = data.state
  const maxCreditCents = state?.maxCreditCents ?? state?.convertibleCents ?? 0
  const maxCashCents = state?.maxCashCents ?? Math.max(0, state?.availableCents ?? 0)
  const taxVerificationRequired = Boolean(state && state.partnerStatus === 'suspended' && !state.taxVerified)
  const validCashTaxStatus = state?.taxStatus === 'individual' || state?.taxStatus === 'company'
  const cashUnavailable = !cashEnabled || !state?.hasIban || taxVerificationRequired || !validCashTaxStatus
  const hasOpenCashRequest = state?.hasOpenCashRequest ?? false
  const hasPendingBalance = (state?.pendingCents ?? 0) > 0
  const hasConvertibleBalance = maxCreditCents > 0
  const meetsCashMinimum = maxCashCents >= REFERRAL_PAYOUT_MIN_CENTS
  const cashBalanceHeld = !meetsCashMinimum || hasPendingBalance
  const cashOptionDisabled = cashUnavailable || hasOpenCashRequest || cashBalanceHeld
  const canRequest = Boolean(
    state &&
    state.partnerStatus !== 'closed' &&
    (hasConvertibleBalance || (cashEnabled && !cashOptionDisabled && meetsCashMinimum)),
  )
  const maximumCents = method === 'credit' ? maxCreditCents : maxCashCents
  const parsedAmountCents = amountMode === 'specific' ? parseReferralPayoutAmount(amountText) : null
  const selectedAmountCents = amountMode === 'all' ? maximumCents : parsedAmountCents
  const isPartial = selectedAmountCents !== null && selectedAmountCents < maximumCents
  const amountInputError: ReferralPayoutAmountError | null = amountMode === 'specific' && parsedAmountCents === null
    ? 'invalid_amount'
    : validateReferralPayoutAmount(
        amountMode === 'all' ? undefined : parsedAmountCents,
        maximumCents,
        method,
        method === 'credit' && state?.hasDebtBucket,
      )
  const isCompanyCash = method === 'cash' && state?.taxStatus === 'company'
  const legacyCompanyCash = Boolean(isCompanyCash && !state?.partialPayoutsAvailable)
  const companyVatRequired = Boolean(isCompanyCash && state?.partialPayoutsAvailable)
  const requiresExtendedSql = Boolean(
    state && ((amountMode === 'specific' && isPartial) || companyVatRequired),
  )
  const featureUnavailable = Boolean(requiresExtendedSql && !state?.partialPayoutsAvailable)
  const vatModeError = companyVatRequired && !vatMode && !featureUnavailable ? 'vat_mode_required' : null
  const payoutError = amountInputError ?? (featureUnavailable ? 'feature_unavailable' : vatModeError)
  const preview = state && selectedAmountCents !== null && !payoutError
    ? calculateReferralPayoutPreview(maximumCents, method, state.taxStatus, {
        amountCents: selectedAmountCents,
        vatMode: legacyCompanyCash ? 'added' : vatMode,
        hasDebtBucket: state.hasDebtBucket,
      })
    : null
  const canContinue = method === 'credit'
    ? hasConvertibleBalance
    : meetsCashMinimum && !cashOptionDisabled
  const canSubmit = Boolean(
    preview &&
    !payoutError &&
    !(method === 'cash' && cashOptionDisabled),
  )

  function startRequest() {
    if (!canRequest || isSubmitting) return
    setMethod(hasConvertibleBalance ? 'credit' : 'cash')
    setAmountMode('all')
    setAmountText('')
    setVatMode(null)
    setDialogStep('method')
    setIdempotencyKey(safeIdempotencyKey())
    setFeedback(null)
    setExpanded(true)
  }

  function continueToReview() {
    if (!canContinue || isSubmitting) return
    setAmountMode('all')
    setAmountText('')
    setVatMode(null)
    setFeedback(null)
    setDialogStep('review')
  }

  function closeRequestDialog() {
    setExpanded(false)
    setIdempotencyKey(null)
    setAmountMode('all')
    setAmountText('')
    setVatMode(null)
  }

  async function submitRequest() {
    if (!canSubmit || !preview || !idempotencyKey || isSubmitting) return

    setIsSubmitting(true)
    setFeedback(null)
    try {
      const result = await createReferralPayoutRequest({
        method,
        idempotencyKey,
        amountCents: preview.partial ? preview.balanceCents : undefined,
        vatMode: companyVatRequired ? vatMode ?? undefined : undefined,
        lang: language,
      })
      if (!result.ok) {
        const message = copy.errors[result.error] ?? copy.errors.unavailable
        setFeedback({ kind: 'error', text: message })
        return
      }

      const requestMode = result.partial ? copy.partial : copy.full
      const summary = result.method === 'cash'
        ? [
            copy.successCash,
            `${requestMode}: ${copy.bankAmount} ${formatReferralTry(result.payoutCents, language)}`,
            result.vatMode && result.invoiceNetCents !== null && result.invoiceVatCents !== null && result.invoiceGrossCents !== null
              ? `${copy.invoiceNet} ${formatReferralTry(result.invoiceNetCents, language)} · ${copy.invoiceVat} ${formatReferralTry(result.invoiceVatCents, language)} · ${copy.invoiceGross} ${formatReferralTry(result.invoiceGrossCents, language)}`
              : null,
          ].filter(Boolean).join(' ')
        : [
            copy.successCredit,
            `${requestMode}: ${copy.commissionValue} ${formatReferralTry(result.balanceCents, language)}`,
            `${copy.credits} ${new Intl.NumberFormat(locale).format(result.creditAmount ?? 0)}`,
            `${copy.topup} ${formatReferralTry(result.systemTopupCents, language)}`,
          ].join(' ')
      setFeedback({ kind: 'success', text: summary })
      setExpanded(false)
      setIdempotencyKey(null)
      router.refresh()
    } catch {
      setFeedback({ kind: 'error', text: copy.errors.unavailable })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <Card className={cn(variant === 'compact' && 'w-full min-w-0 border-0 bg-transparent p-0 shadow-none')}>
      <CardHeader className={cn('gap-1', variant === 'compact' && 'sr-only')}>
        <div className="flex items-center gap-2">
          <WalletCards className="size-4 text-primary" aria-hidden="true" />
          <CardTitle className="text-base">{copy.title}</CardTitle>
        </div>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent className={cn('flex flex-col gap-4', variant === 'compact' && 'gap-2 p-3')}>
        {data.unavailable ? (
          <Alert variant="destructive"><AlertDescription>{copy.unavailable}</AlertDescription></Alert>
        ) : state ? (
          <>
            <dl className={cn('grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3', variant === 'compact' && 'flex flex-wrap items-center gap-x-4 gap-y-1')}>
              <div className={cn('flex flex-col gap-1', variant !== 'compact' && 'col-span-2 sm:col-span-1')}>
                <dt className="text-xs text-muted-foreground">{copy.total}</dt>
                <dd className="text-xl font-semibold tabular-nums text-foreground">{formatReferralTry(state.totalCents, language)}</dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-xs text-muted-foreground">{copy.pending}</dt>
                <dd className="text-sm font-medium tabular-nums text-foreground">{formatReferralTry(state.pendingCents, language)}</dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-xs text-muted-foreground">{copy.available}</dt>
                <dd className="text-sm font-medium tabular-nums text-foreground">{formatReferralTry(state.availableCents, language)}</dd>
              </div>
              {variant === 'dashboard' && state.requestedCents > 0 && (
                <div className="flex flex-col gap-1">
                  <dt className="text-xs text-muted-foreground">{copy.requested}</dt>
                  <dd className="text-sm font-medium tabular-nums text-foreground">{formatReferralTry(state.requestedCents, language)}</dd>
                </div>
              )}
              {variant === 'dashboard' && state.convertedCents > 0 && (
                <div className="flex flex-col gap-1">
                  <dt className="text-xs text-muted-foreground">{copy.converted}</dt>
                  <dd className="text-sm font-medium tabular-nums text-foreground">{formatReferralTry(state.convertedCents, language)}</dd>
                </div>
              )}
              {variant === 'dashboard' && state.paidCents > 0 && (
                <div className="flex flex-col gap-1">
                  <dt className="text-xs text-muted-foreground">{copy.paid}</dt>
                  <dd className="text-sm font-medium tabular-nums text-foreground">{formatReferralTry(state.paidCents, language)}</dd>
                </div>
              )}
            </dl>

            <p className="text-xs leading-relaxed text-muted-foreground">{copy.hold}</p>
            {hasOpenCashRequest && (
              <Alert><AlertDescription>{copy.openCash}</AlertDescription></Alert>
            )}
            {!hasConvertibleBalance && variant === 'dashboard' && (
              <p className="text-xs text-muted-foreground">{copy.creditBalanceEmpty}</p>
            )}
            {cashEnabled && cashBalanceHeld && (
              <Alert><AlertDescription>{hasPendingBalance ? copy.cashWaiting : copy.cashMinimum}</AlertDescription></Alert>
            )}
            {cashEnabled && !state.hasIban && (
              <p className="text-xs text-muted-foreground">{copy.noIban}</p>
            )}
            {taxVerificationRequired && cashEnabled && (
              <Alert><AlertDescription>{copy.taxVerificationRequired}</AlertDescription></Alert>
            )}
            {feedback && !expanded && (
              <Alert variant={feedback.kind === 'error' ? 'destructive' : 'default'}>
                <AlertDescription role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.text}</AlertDescription>
              </Alert>
            )}

            <Button
              type="button"
              onClick={startRequest}
              disabled={!canRequest || isSubmitting}
              size={variant === 'compact' ? 'sm' : undefined}
              className={cn('w-fit gap-2', variant === 'compact' && 'shrink-0')}
            >
              <WalletCards data-icon="inline-start" />
              {copy.request}
            </Button>


          </>
        ) : null}
      </CardContent>
      </Card>
      <ConfirmDialog
        open={expanded}
        title={dialogStep === 'method' ? copy.requestTitle : copy.reviewTitle}
        description={dialogStep === 'method' ? copy.requestDescription : copy.reviewDescription}
        confirmLabel={isSubmitting ? copy.submitting : dialogStep === 'method' ? copy.continue : copy.confirm}
        cancelLabel={copy.cancel}
        confirmDisabled={dialogStep === 'method' ? !canContinue || isSubmitting : !canSubmit || isSubmitting}
      stickyActions
        onConfirm={dialogStep === 'method' ? continueToReview : submitRequest}
        onCancel={closeRequestDialog}
      >
        {dialogStep === 'method' ? (
          <div className="mt-4 flex flex-col gap-3">
            <ToggleGroup
              value={[method]}
              onValueChange={(value) => {
                const selectedMethod = value[0]
                if (selectedMethod === 'credit' && hasConvertibleBalance) {
                  setMethod(selectedMethod)
                  setAmountMode('all')
                  setAmountText('')
                  setVatMode(null)
                  setFeedback(null)
                }
                if (selectedMethod === 'cash' && !cashOptionDisabled) {
                  setMethod(selectedMethod)
                  setAmountMode('all')
                  setAmountText('')
                  setVatMode(null)
                  setFeedback(null)
                }
              }}
              variant="outline"
              aria-label={copy.requestTitle}
              className="w-full min-w-0 flex-col sm:flex-row"
            >
              <ToggleGroupItem value="credit" disabled={!hasConvertibleBalance || isSubmitting} className="w-full min-w-0 flex-1 justify-start">
                <Coins data-icon="inline-start" />
                {copy.credit}
              </ToggleGroupItem>
              {cashEnabled && (
                <ToggleGroupItem value="cash" disabled={cashOptionDisabled || isSubmitting} className="w-full min-w-0 flex-1 justify-start">
                  <Banknote data-icon="inline-start" />
                  {copy.cash}
                </ToggleGroupItem>
              )}
            </ToggleGroup>
            {method === 'credit' && !hasConvertibleBalance && (
              <Alert><AlertDescription>{copy.creditBalanceEmpty}</AlertDescription></Alert>
            )}
            {cashEnabled && cashOptionDisabled && (
              <Alert variant={cashUnavailable ? 'destructive' : 'default'}>
                <AlertDescription>
                  {!state?.hasIban
                    ? copy.noIban
                    : taxVerificationRequired
                      ? copy.taxVerificationRequired
                      : !validCashTaxStatus
                        ? copy.invalidTax
                        : hasOpenCashRequest
                          ? copy.openCash
                          : hasPendingBalance
                            ? copy.cashWaiting
                            : cashBalanceHeld
                              ? copy.cashMinimum
                              : copy.cashUnavailable}
                </AlertDescription>
              </Alert>
            )}
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            <Button
              type="button"
              variant="link"
              size="sm"
              className="self-start px-0"
              onClick={() => {
                setDialogStep('method')
                setFeedback(null)
              }}
              disabled={isSubmitting}
            >
              {copy.changeMethod}
            </Button>
            <FieldSet>
              <FieldLegend>{copy.amountMode}</FieldLegend>
              <ToggleGroup
                value={[amountMode]}
                onValueChange={(value) => {
                  const selectedMode = value[0]
                  if (selectedMode === 'all' || selectedMode === 'specific') {
                    setAmountMode(selectedMode)
                    setAmountText('')
                    setFeedback(null)
                  }
                }}
                variant="outline"
                aria-label={copy.amountMode}
                className="w-full min-w-0 flex-col sm:flex-row"
              >
                <ToggleGroupItem value="all" className="w-full min-w-0 flex-1 justify-start">
                  {copy.amountAll}
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="specific"
                  disabled={!state?.partialPayoutsAvailable || (method === 'credit' && state.hasDebtBucket) || isSubmitting}
                  className="w-full min-w-0 flex-1 justify-start"
                >
                  {copy.amountSpecific}
                </ToggleGroupItem>
              </ToggleGroup>
              {!state?.partialPayoutsAvailable && (
                <p className="text-sm leading-relaxed text-muted-foreground">{copy.partialUnavailable}</p>
              )}
              {method === 'credit' && state?.hasDebtBucket && (
                <p className="text-sm leading-relaxed text-muted-foreground">{copy.partialDebt}</p>
              )}
            </FieldSet>

            {amountMode === 'specific' && (
              <FieldGroup>
                <Field data-invalid={Boolean(amountInputError)}>
                  <div className="flex items-center justify-between gap-3">
                    <FieldLabel htmlFor="referral-payout-amount">{copy.amountLabel}</FieldLabel>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      onClick={() => setAmountText(formatReferralTryInput(maximumCents, language))}
                    >
                      {copy.useMaximum}
                    </Button>
                  </div>
                  <Input
                    id="referral-payout-amount"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={amountText}
                    onChange={(event) => {
                      setAmountText(event.target.value)
                      setFeedback(null)
                    }}
                    aria-invalid={Boolean(amountInputError)}
                    aria-describedby="referral-payout-amount-description"
                    placeholder={formatReferralTryInput(maximumCents, language)}
                  />
                  <FieldDescription id="referral-payout-amount-description">
                    {copy.amountDescription.replace('{maximum}', formatReferralTry(maximumCents, language))}
                    {method === 'credit' ? ` ${copy.partialCreditMultipleHint}` : ''}
                  </FieldDescription>
                </Field>
              </FieldGroup>
            )}

            {legacyCompanyCash && (
              <Alert><AlertDescription>{copy.legacyVat}</AlertDescription></Alert>
            )}
            {companyVatRequired && (
              <FieldSet>
                <FieldLegend>{copy.vatModeTitle}</FieldLegend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={cn('flex cursor-pointer items-start gap-3 rounded-md border p-3', vatMode === 'included' && 'border-primary bg-muted/40', !state?.partialPayoutsAvailable && 'cursor-not-allowed opacity-60')}>
                    <input
                      type="radio"
                      name="referral-payout-vat-mode"
                      value="included"
                      checked={vatMode === 'included'}
                      disabled={!state?.partialPayoutsAvailable || isSubmitting}
                      onChange={() => setVatMode('included')}
                      className="mt-1 accent-primary"
                    />
                    <span className="flex flex-col gap-1">
                      <span className="text-sm font-medium">{copy.vatIncluded}</span>
                      <span className="text-sm leading-relaxed text-muted-foreground">{copy.vatIncludedHint}</span>
                    </span>
                  </label>
                  <label className={cn('flex cursor-pointer items-start gap-3 rounded-md border p-3', vatMode === 'added' && 'border-primary bg-muted/40', !state?.partialPayoutsAvailable && 'cursor-not-allowed opacity-60')}>
                    <input
                      type="radio"
                      name="referral-payout-vat-mode"
                      value="added"
                      checked={vatMode === 'added'}
                      disabled={!state?.partialPayoutsAvailable || isSubmitting}
                      onChange={() => setVatMode('added')}
                      className="mt-1 accent-primary"
                    />
                    <span className="flex flex-col gap-1">
                      <span className="text-sm font-medium">{copy.vatAdded}</span>
                      <span className="text-sm leading-relaxed text-muted-foreground">{copy.vatAddedHint}</span>
                    </span>
                  </label>
                </div>
              </FieldSet>
            )}

            {payoutError && (
              <Alert variant="destructive"><AlertDescription role="alert">{copy.errors[payoutError]}</AlertDescription></Alert>
            )}
            {preview && (
              <dl className="grid gap-2 rounded-lg bg-muted/30 p-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">{copy.commissionValue}</dt>
                  <dd className="font-medium tabular-nums whitespace-nowrap text-foreground">{formatReferralTry(preview.balanceCents, language)}</dd>
                </div>
                {method === 'cash' ? (
                  <>
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-muted-foreground">{copy.bankAmount}</dt>
                      <dd className="font-medium tabular-nums whitespace-nowrap text-foreground">{formatReferralTry(preview.payoutCents, language)}</dd>
                    </div>
                    {preview.vatMode && preview.invoiceNetCents !== null && preview.invoiceVatCents !== null && preview.invoiceGrossCents !== null && (
                      <>
                        <div className="flex items-center justify-between gap-4">
                          <dt className="text-muted-foreground">{copy.vatModeTitle}</dt>
                          <dd className="font-medium text-foreground">{preview.vatMode === 'included' ? copy.vatIncluded : copy.vatAdded}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <dt className="text-muted-foreground">{copy.invoiceNet}</dt>
                          <dd className="font-medium tabular-nums whitespace-nowrap text-foreground">{formatReferralTry(preview.invoiceNetCents, language)}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <dt className="text-muted-foreground">{copy.invoiceVat}</dt>
                          <dd className="font-medium tabular-nums whitespace-nowrap text-foreground">{formatReferralTry(preview.invoiceVatCents, language)}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <dt className="text-muted-foreground">{copy.invoiceGross}</dt>
                          <dd className="font-medium tabular-nums whitespace-nowrap text-foreground">{formatReferralTry(preview.invoiceGrossCents, language)}</dd>
                        </div>
                      </>
                    )}
                    <p className="text-xs leading-relaxed text-muted-foreground">{preview.invoiceRequired ? copy.invoice : copy.noInvoice}</p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-muted-foreground">{copy.credits}</dt>
                      <dd className="font-medium tabular-nums whitespace-nowrap text-foreground">{new Intl.NumberFormat(locale).format(preview.creditAmount ?? 0)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-muted-foreground">{copy.topup}</dt>
                      <dd className="font-medium tabular-nums whitespace-nowrap text-foreground">{formatReferralTry(preview.systemTopupCents, language)}</dd>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">{copy.creditImmediate}</p>
                  </>
                )}
                <div className="flex items-center justify-between gap-4 border-t pt-2">
                  <dt className="text-muted-foreground">{preview.partial ? copy.partial : copy.full}</dt>
                  <dd className="font-medium text-foreground">{preview.partial ? copy.partial : copy.full}</dd>
                </div>
              </dl>
            )}
            {feedback?.kind === 'error' && (
              <Alert variant="destructive"><AlertDescription role="alert">{feedback.text}</AlertDescription></Alert>
            )}
          </div>
        )}
      </ConfirmDialog>
    </>
  )
}
