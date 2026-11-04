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
import { REFERRAL_HOLD_DAYS, REFERRAL_PAYOUT_MIN_TRY } from '@/lib/referrals/commission-config'
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

const COPY = {
  tr: {
    title: 'Ödeme bakiyesi',
    description: 'Yönlendirme komisyonlarınızı ve ödeme durumunuzu takip edin.',
    total: 'Toplam bakiye',
    pending: 'Beklemede',
    available: 'Kullanılabilir',
    requested: 'İşlemde',
    converted: 'Krediye çevrildi',
    paid: 'Ödendi',
    hold: `Komisyonlar ödeme tarihinden ${REFERRAL_HOLD_DAYS} gün sonra kullanılabilir bakiyeye geçer.`, 
    request: 'Ödeme İste',
    requestTitle: 'Bakiyenizi nasıl almak istersiniz?',
    requestDescription: 'Bir ödeme yöntemi seçin. Tutar ve koşullar sonraki adımda gösterilir.',
    reviewTitle: 'Talep özeti',
    reviewDescription: 'Onaylamadan önce tutarı kontrol edin. İstek sunucu tarafında tekrar doğrulanır.',
    continue: 'Devam et',
    changeMethod: 'Yöntemi değiştir',
    credit: 'AI Kredisine Dönüşsün',
    cash: 'Nakit IBAN\'ına Yatsın',
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
    threshold: `İstek için kullanılabilir bakiyenin en az ${minimumPayoutTr} TL olması gerekir.`, 
    openCash: 'Açık bir nakit ödeme isteğiniz var. Yeni ödeme isteği, bu istek sonuçlanana kadar pasif kalır.',
    unavailable: 'Ödeme bilgileri şu anda yüklenemiyor. Lütfen daha sonra yeniden deneyin.',
    invalidTax: 'Nakit ödeme için vergi statünüzün doğrulanması gerekiyor.',
    taxVerificationRequired: 'Bir sonraki nakit ödeme için vergi bilgilerinizin doğrulanması gerekiyor. Destek ekibimizle iletişime geçin.',
    errors: {
      not_authenticated: 'Oturum doğrulanamadı. Yeniden giriş yapın.',
      payout_disabled: 'Ödeme özelliği şu anda kullanılamıyor.',
      cash_disabled: 'Nakit ödeme şu anda kullanılamıyor.',
      not_found: 'Etkin bir satış ortaklığı bulunamadı.',
      partner_inactive: 'Kapalı bir ortaklık için ödeme isteği oluşturulamaz.',
      insufficient_balance: `Kullanılabilir bakiye ${minimumPayoutTr} TL eşiğinin altında.`, 
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
    total: 'Total balance',
    pending: 'Pending',
    available: 'Available',
    requested: 'In progress',
    converted: 'Converted to credits',
    paid: 'Paid',
    hold: `Commissions become available ${REFERRAL_HOLD_DAYS} days after the payment date.`, 
    request: 'Request payout',
    requestTitle: 'How would you like to receive your balance?',
    requestDescription: 'Choose a payout method. The amount and terms appear in the next step.',
    reviewTitle: 'Request summary',
    reviewDescription: 'Review the amount before confirming. The request is revalidated on the server.',
    continue: 'Continue',
    changeMethod: 'Change method',
    credit: 'Convert to AI credits',
    cash: 'Pay to my IBAN',
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
    threshold: `At least TRY ${minimumPayoutEn} in available balance is required to request a payout.`, 
    openCash: 'You have an open cash payout request. New requests remain unavailable until it is resolved.',
    unavailable: 'Payout information is temporarily unavailable. Please try again later.',
    invalidTax: 'Your tax status must be complete before a cash payout.',
    taxVerificationRequired: 'Your tax information must be verified before your next cash payout. Please contact support.',
    errors: {
      not_authenticated: 'Your session could not be verified. Please sign in again.',
      payout_disabled: 'Payouts are currently unavailable.',
      cash_disabled: 'Cash payout is currently unavailable.',
      not_found: 'No active referral partnership was found.',
      partner_inactive: 'A closed partnership cannot request a payout.',
      insufficient_balance: `Available balance is below the TRY ${minimumPayoutEn} minimum.`, 
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
  const preview = state
    ? calculateReferralPayoutPreview(state.availableCents, method, state.taxStatus)
    : null
  const taxVerificationRequired = Boolean(state && state.partnerStatus === 'suspended' && !state.taxVerified)
  const cashUnavailable = !cashEnabled || !state?.hasIban || taxVerificationRequired
  const hasOpenCashRequest = state?.hasOpenCashRequest ?? false
  const meetsMinimum = (state?.availableCents ?? 0) >= REFERRAL_PAYOUT_MIN_CENTS
  const canRequest = Boolean(state && state.partnerStatus !== 'closed' && meetsMinimum && !hasOpenCashRequest)

  function startRequest() {
    if (!canRequest || isSubmitting) return
    setMethod('credit')
    setDialogStep('method')
    setIdempotencyKey(safeIdempotencyKey())
    setFeedback(null)
    setExpanded(true)
  }

  function continueToReview() {
    if (!preview) return
    setFeedback(null)
    setDialogStep('review')
  }

  function closeRequestDialog() {
    setExpanded(false)
    setIdempotencyKey(null)
  }

  async function submitRequest() {
    if (!preview || !idempotencyKey || isSubmitting) return

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
      <Card className={cn(variant === 'compact' && 'border-0 bg-transparent p-0 shadow-none')}>
      <CardHeader className={cn('gap-1', variant === 'compact' && 'sr-only')}>
        <div className="flex items-center gap-2">
          <WalletCards className="size-4 text-primary" aria-hidden="true" />
          <CardTitle className="text-base">{copy.title}</CardTitle>
        </div>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent className={cn('flex flex-col gap-4', variant === 'compact' && 'gap-2 p-0')}>
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
            {!meetsMinimum && !hasOpenCashRequest && variant === 'dashboard' && (
              <p className="text-xs text-muted-foreground">{copy.threshold}</p>
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
        confirmDisabled={!preview || isSubmitting}
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
              className="w-full flex-col sm:flex-row"
            >
              <ToggleGroupItem value="credit" className="w-full justify-start">
                <Coins data-icon="inline-start" />
                {copy.credit}
              </ToggleGroupItem>
              {cashEnabled && (
                <ToggleGroupItem value="cash" disabled={cashUnavailable || isSubmitting} className="w-full justify-start">
                  <Banknote data-icon="inline-start" />
                  {copy.cash}
                </ToggleGroupItem>
              )}
            </ToggleGroup>
            {cashEnabled && !state?.hasIban && (
              <Alert><AlertDescription>{copy.noIban}</AlertDescription></Alert>
            )}
            {taxVerificationRequired && cashEnabled && (
              <Alert><AlertDescription>{copy.taxVerificationRequired}</AlertDescription></Alert>
            )}
            {!preview && method === 'cash' && !cashUnavailable && (
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
                    {preview.systemTopupCents > 0 && (
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-muted-foreground">{copy.topup}</dt>
                        <dd className="font-medium tabular-nums text-foreground">{formatReferralTry(preview.systemTopupCents, language)}</dd>
                      </div>
                    )}
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
