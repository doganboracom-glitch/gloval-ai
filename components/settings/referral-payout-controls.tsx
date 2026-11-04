'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Banknote, Coins, Loader2, WalletCards } from 'lucide-react'
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
    hold: 'Komisyonlar ödeme tarihinden 14 gün sonra kullanılabilir bakiyeye geçer.',
    request: 'Ödeme iste',
    requestTitle: 'Ödeme yöntemi ve özeti',
    requestDescription: 'Onaylamadan önce tutarı kontrol edin. İstek sunucu tarafında tekrar doğrulanır.',
    credit: 'AI kredisi',
    cash: 'Nakit ödeme',
    commissionValue: 'Kullanılacak komisyon bakiyesi',
    bankAmount: 'Ödenecek tutar',
    credits: 'Eklenecek AI kredisi',
    topup: 'GLOVAL AI katkısı',
    invoice: 'Bu vergi statüsü için fatura gerekir; ödeme fatura onayından sonra işlenir.',
    noInvoice: 'Bireysel statüsü bu program akışında fatura gerektirmez.',
    confirm: 'İsteği onayla',
    cancel: 'Vazgeç',
    submitting: 'İşleniyor…',
    successCash: 'Ödeme isteğiniz alındı. Yönetici incelemesinden sonra durum burada güncellenir.',
    successCredit: 'AI kredileriniz bakiyenize eklendi.',
    cashUnavailable: 'Nakit ödeme şu anda kullanılamıyor.',
    noIban: 'Nakit ödeme için kayıtlı bir IBAN gerekir.',
    threshold: 'İstek için kullanılabilir bakiyenin en az 1.000 TL olması gerekir.',
    openCash: 'Açık bir nakit ödeme isteğiniz var. Yeni ödeme isteği, bu istek sonuçlanana kadar pasif kalır.',
    unavailable: 'Ödeme bilgileri şu anda yüklenemiyor. Lütfen daha sonra yeniden deneyin.',
    invalidTax: 'Nakit ödeme için vergi statünüzün doğrulanması gerekiyor.',
    errors: {
      not_authenticated: 'Oturum doğrulanamadı. Yeniden giriş yapın.',
      payout_disabled: 'Ödeme özelliği şu anda kullanılamıyor.',
      cash_disabled: 'Nakit ödeme şu anda kullanılamıyor.',
      not_found: 'Etkin bir satış ortaklığı bulunamadı.',
      partner_inactive: 'Kapalı bir ortaklık için ödeme isteği oluşturulamaz.',
      insufficient_balance: 'Kullanılabilir bakiye 1.000 TL eşiğinin altında.',
      open_cash_request: 'Önce açık nakit ödeme isteğinizin sonuçlanmasını bekleyin.',
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
    hold: 'Commissions become available 14 days after the payment date.',
    request: 'Request payout',
    requestTitle: 'Payout method and summary',
    requestDescription: 'Review the amount before confirming. The request is revalidated on the server.',
    credit: 'AI credits',
    cash: 'Cash payout',
    commissionValue: 'Commission balance used',
    bankAmount: 'Payout amount',
    credits: 'AI credits to add',
    topup: 'GLOVAL AI contribution',
    invoice: 'This tax status requires an invoice; payment is processed after invoice confirmation.',
    noInvoice: 'Individual status does not require an invoice in this program workflow.',
    confirm: 'Confirm request',
    cancel: 'Cancel',
    submitting: 'Processing…',
    successCash: 'Your payout request was received. Its status will update here after administrator review.',
    successCredit: 'Your AI credits have been added to your balance.',
    cashUnavailable: 'Cash payout is not available right now.',
    noIban: 'A saved IBAN is required for cash payout.',
    threshold: 'At least TRY 1,000 in available balance is required to request a payout.',
    openCash: 'You have an open cash payout request. New requests remain unavailable until it is resolved.',
    unavailable: 'Payout information is temporarily unavailable. Please try again later.',
    invalidTax: 'Your tax status must be complete before a cash payout.',
    errors: {
      not_authenticated: 'Your session could not be verified. Please sign in again.',
      payout_disabled: 'Payouts are currently unavailable.',
      cash_disabled: 'Cash payout is currently unavailable.',
      not_found: 'No active referral partnership was found.',
      partner_inactive: 'A closed partnership cannot request a payout.',
      insufficient_balance: 'Available balance is below the TRY 1,000 minimum.',
      open_cash_request: 'Wait for your open cash payout request to be resolved first.',
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
  const [method, setMethod] = useState<ReferralPayoutMethod>('credit')
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  if (!enabled || !data) return null

  const state = data.state
  const preview = state
    ? calculateReferralPayoutPreview(state.availableCents, method, state.taxStatus)
    : null
  const cashUnavailable = !cashEnabled || !state?.hasIban
  const hasOpenCashRequest = state?.hasOpenCashRequest ?? false
  const meetsMinimum = (state?.availableCents ?? 0) >= REFERRAL_PAYOUT_MIN_CENTS
  const canRequest = Boolean(state && state.partnerStatus !== 'closed' && meetsMinimum && !hasOpenCashRequest)

  function startRequest() {
    if (!canRequest || isSubmitting) return
    setMethod('credit')
    setIdempotencyKey(safeIdempotencyKey())
    setFeedback(null)
    setExpanded(true)
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
    <Card className={cn(variant === 'compact' && 'border-border/70 bg-muted/20 shadow-none')}>
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
            {!meetsMinimum && !hasOpenCashRequest && (
              <p className="text-xs text-muted-foreground">{copy.threshold}</p>
            )}
            {cashEnabled && !state.hasIban && (
              <p className="text-xs text-muted-foreground">{copy.noIban}</p>
            )}
            {feedback && (
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

            {expanded && (
              <section aria-labelledby="referral-payout-request-title" className="flex flex-col gap-4 rounded-xl border border-border bg-background p-4">
                <div>
                  <h3 id="referral-payout-request-title" className="text-sm font-semibold text-foreground">{copy.requestTitle}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{copy.requestDescription}</p>
                </div>

                <div className="flex flex-wrap gap-2" role="group" aria-label={copy.requestTitle}>
                  <Button
                    type="button"
                    variant={method === 'credit' ? 'default' : 'outline'}
                    aria-pressed={method === 'credit'}
                    onClick={() => {
                      setMethod('credit')
                      setFeedback(null)
                    }}
                    disabled={isSubmitting}
                  >
                    <Coins data-icon="inline-start" />
                    {copy.credit}
                  </Button>
                  {cashEnabled && (
                    <Button
                      type="button"
                      variant={method === 'cash' ? 'default' : 'outline'}
                      aria-pressed={method === 'cash'}
                      onClick={() => {
                        setMethod('cash')
                        setFeedback(null)
                      }}
                      disabled={cashUnavailable || isSubmitting}
                    >
                      <Banknote data-icon="inline-start" />
                      {copy.cash}
                    </Button>
                  )}
                </div>

                {cashEnabled && method === 'cash' && cashUnavailable && (
                  <Alert><AlertDescription>{copy.noIban}</AlertDescription></Alert>
                )}
                {!preview && method === 'cash' && !cashUnavailable && (
                  <Alert variant="destructive"><AlertDescription>{copy.invalidTax}</AlertDescription></Alert>
                )}
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

                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setExpanded(false)} disabled={isSubmitting}>
                    {copy.cancel}
                  </Button>
                  <Button type="button" onClick={submitRequest} disabled={!preview || isSubmitting} className="gap-2">
                    {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                    {isSubmitting ? copy.submitting : copy.confirm}
                  </Button>
                </div>
              </section>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
