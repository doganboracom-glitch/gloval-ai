'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Banknote, Coins, WalletCards } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
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
import { CREDIT_MIN_CENTS, REFERRAL_HOLD_DAYS, REFERRAL_PAYOUT_MIN_TRY } from '@/lib/referrals/commission-config'
import {
  calculateReferralPayoutPreview,
  formatReferralTry,
  REFERRAL_PAYOUT_MIN_CENTS,
} from '@/lib/referrals/payout-core'
import type {
  ReferralPayoutMethod,
  ReferralPayoutPanelData,
} from '@/lib/referrals/partner-types'

type Language = 'tr' | 'en'

const minimumPayoutTr = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(REFERRAL_PAYOUT_MIN_TRY)
const minimumPayoutEn = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(REFERRAL_PAYOUT_MIN_TRY)
const minimumCreditTr = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(CREDIT_MIN_CENTS / 100)
const minimumCreditEn = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(CREDIT_MIN_CENTS / 100)

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
    hold: `Komisyonlar ${REFERRAL_HOLD_DAYS} gün beklemede kalır; toplam bakiye en az ${minimumCreditTr} TL olduğunda tamamı beklemeden AI kredisine çevrilebilir.`,
    request: 'Ödeme İste',
    requestTitle: 'Bakiyenizi nasıl almak istersiniz?',
    requestDescription: 'AI kredisi bakiyesi ve GLOVAL AI katkısı burada görünür; IBAN ödemesi bekleme ve kullanılabilir bakiye şartlarına bağlıdır.',
    reviewTitle: 'Talep özeti',
    reviewDescription: 'Onaylamadan önce tutarı kontrol edin. İstek sunucu tarafında tekrar doğrulanır.',
    continue: 'Devam et',
    changeMethod: 'Yöntemi değiştir',
    credit: 'AI kredisi olarak al',
    cash: 'IBAN\'a ödeme iste',
    creditImmediate: 'Bu tutar, 14 günlük bekleme tamamlanmadan da AI kredisi olarak hemen eklenir.',
    commissionValue: 'Kullanılacak komisyon bakiyesi',
    bankAmount: 'Ödenecek tutar',
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
    creditThreshold: `AI kredisine dönüşüm için toplam bakiyenin en az ${minimumCreditTr} TL olması gerekir.`,
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
      credit_minimum_not_met: `AI kredisine dönüşüm için toplam bakiyenin en az ${minimumCreditTr} TL olması gerekir.`,
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
    hold: `Commissions stay on hold for ${REFERRAL_HOLD_DAYS} days; once the total balance reaches TRY ${minimumCreditEn}, the full amount can be converted to AI credits without waiting.`,
    request: 'Request payout',
    requestTitle: 'How would you like to receive your balance?',
    requestDescription: 'The AI credit amount and GLOVAL AI contribution appear here; IBAN payout requires the hold and available-balance conditions.',
    reviewTitle: 'Request summary',
    reviewDescription: 'Review the amount before confirming. The request is revalidated on the server.',
    continue: 'Continue',
    changeMethod: 'Change method',
    credit: 'Receive as AI credits',
    cash: 'Request IBAN payout',
    creditImmediate: 'AI credits are added immediately, without waiting for the 14-day hold to end.',
    commissionValue: 'Commission balance used',
    bankAmount: 'Payout amount',
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
    creditThreshold: `At least TRY ${minimumCreditEn} in total balance is required to convert to AI credits.`,
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
      credit_minimum_not_met: `At least TRY ${minimumCreditEn} in total balance is required to convert to AI credits.`,
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
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  if (!enabled || !data) return null

  const state = data.state
  const payoutBalanceCents = method === 'credit'
    ? state?.convertibleCents
    : state?.availableCents
  const preview = state && payoutBalanceCents !== undefined
    ? calculateReferralPayoutPreview(payoutBalanceCents, method, state.taxStatus)
    : null
  const taxVerificationRequired = Boolean(state && state.partnerStatus === 'suspended' && !state.taxVerified)
  const cashUnavailable = !cashEnabled || !state?.hasIban || taxVerificationRequired
  const hasOpenCashRequest = state?.hasOpenCashRequest ?? false
  const hasPendingBalance = (state?.pendingCents ?? 0) > 0
  const meetsCreditMinimum = (state?.convertibleCents ?? 0) >= CREDIT_MIN_CENTS
  const meetsCashMinimum = (state?.availableCents ?? 0) >= REFERRAL_PAYOUT_MIN_CENTS
  const cashBalanceHeld = !meetsCashMinimum || hasPendingBalance
  const cashOptionDisabled = cashUnavailable || hasOpenCashRequest || cashBalanceHeld
  const canRequest = Boolean(state && state.partnerStatus !== 'closed' && meetsCreditMinimum)

  function startRequest() {
    if (!canRequest || isSubmitting) return
    setMethod('credit')
    setDialogStep('method')
    setIdempotencyKey(safeIdempotencyKey())
    setFeedback(null)
    setExpanded(true)
  }

  function continueToReview() {
    if (!preview || (method === 'cash' && cashOptionDisabled)) return
    setFeedback(null)
    setDialogStep('review')
  }

  function closeRequestDialog() {
    setExpanded(false)
    setIdempotencyKey(null)
  }

  async function submitRequest() {
    if (!preview || (method === 'cash' && cashOptionDisabled) || !idempotencyKey || isSubmitting) return

    setIsSubmitting(true)
    setFeedback(null)
    try {
      const result = await createReferralPayoutRequest({
        method,
        idempotencyKey,
        lang: language,
      })
      if (!result.ok) {
        const message = copy.errors[result.error] ?? copy.errors.unavailable
        setFeedback({ kind: 'error', text: message })
        return
      }

      setFeedback({
        kind: 'success',
        text: method === 'cash' ? copy.successCash : copy.successCredit,
      })
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
            {!meetsCreditMinimum && variant === 'dashboard' && (
              <p className="text-xs text-muted-foreground">{copy.creditThreshold}</p>
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
        confirmDisabled={!preview || (method === 'cash' && cashOptionDisabled) || isSubmitting}
        onConfirm={dialogStep === 'method' ? continueToReview : submitRequest}
        onCancel={closeRequestDialog}
      >
        {dialogStep === 'method' ? (
          <div className="mt-4 flex flex-col gap-3">
            <ToggleGroup
              value={[method]}
              onValueChange={(value) => {
                const selectedMethod = value[0]
                if (selectedMethod === 'credit' || selectedMethod === 'cash') {
                  setMethod(selectedMethod)
                  setFeedback(null)
                }
              }}
              variant="outline"
              aria-label={copy.requestTitle}
              className="w-full min-w-0 flex-col sm:flex-row"
            >
              <ToggleGroupItem value="credit" className="w-full min-w-0 flex-1 justify-start">
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
            {cashEnabled && cashBalanceHeld && (
              <Alert><AlertDescription>{hasPendingBalance ? copy.cashWaiting : copy.cashMinimum}</AlertDescription></Alert>
            )}
            {cashEnabled && hasOpenCashRequest && (
              <Alert><AlertDescription>{copy.openCash}</AlertDescription></Alert>
            )}
            {cashEnabled && !state?.hasIban && (
              <Alert><AlertDescription>{copy.noIban}</AlertDescription></Alert>
            )}
            {taxVerificationRequired && cashEnabled && (
              <Alert><AlertDescription>{copy.taxVerificationRequired}</AlertDescription></Alert>
            )}
            {method === 'credit' && preview && (
              <>
                <Alert><AlertDescription>{copy.creditImmediate}</AlertDescription></Alert>
                <dl className="grid gap-2 rounded-lg bg-muted/30 p-3 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">{copy.commissionValue}</dt>
                    <dd className="font-medium tabular-nums text-foreground">{formatReferralTry(preview.balanceCents, language)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">{copy.credits}</dt>
                    <dd className="font-medium tabular-nums text-foreground">{new Intl.NumberFormat(locale).format(preview.creditAmount ?? 0)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">{copy.topup}</dt>
                    <dd className="font-medium tabular-nums text-foreground">{formatReferralTry(preview.systemTopupCents, language)}</dd>
                  </div>
                </dl>
              </>
            )}
            {!preview && method === 'cash' && !cashUnavailable && !cashBalanceHeld && (
              <Alert variant="destructive"><AlertDescription>{copy.invalidTax}</AlertDescription></Alert>
            )}
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            {preview && (
              <dl className="grid gap-2 rounded-lg bg-muted/30 p-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">{copy.commissionValue}</dt>
                  <dd className="font-medium tabular-nums text-foreground">{formatReferralTry(preview.balanceCents, language)}</dd>
                </div>
                {method === 'cash' ? (
                  <>
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-muted-foreground">{copy.bankAmount}</dt>
                      <dd className="font-medium tabular-nums text-foreground">{formatReferralTry(preview.payoutCents, language)}</dd>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">{preview.invoiceRequired ? copy.invoice : copy.noInvoice}</p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-muted-foreground">{copy.credits}</dt>
                      <dd className="font-medium tabular-nums text-foreground">{new Intl.NumberFormat(locale).format(preview.creditAmount ?? 0)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-muted-foreground">{copy.topup}</dt>
                      <dd className="font-medium tabular-nums text-foreground">{formatReferralTry(preview.systemTopupCents, language)}</dd>
                    </div>
                  </>
                )}
              </dl>
            )}
            {feedback?.kind === 'error' && (
              <Alert variant="destructive"><AlertDescription role="alert">{feedback.text}</AlertDescription></Alert>
            )}
            <Button type="button" variant="outline" onClick={() => setDialogStep('method')} disabled={isSubmitting}>
              {copy.changeMethod}
            </Button>
          </div>
        )}
      </ConfirmDialog>
    </>
  )
}
