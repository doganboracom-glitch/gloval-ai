'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/components/language-provider'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  processReferralCashPayout,
  recordReferralCashInvoice,
  rejectReferralCashPayout,
  revealReferralPayoutIban,
  verifyReferralPartnerTax,
} from '@/lib/referrals/admin-payout-actions'
import { formatReferralTry } from '@/lib/referrals/payout-core'
import type {
  ReferralPayoutAdminRequest,
  ReferralPayoutAdminSummary,
  ReferralPayoutStatus,
} from '@/lib/referrals/partner-types'

type Language = 'tr' | 'en'
type EditKind = 'invoice' | 'paid' | 'reject'
type PendingAction =
  | { kind: 'invoice'; requestId: string; value: string }
  | { kind: 'paid'; requestId: string; value: string }
  | { kind: 'reject'; requestId: string; value: string }
  | { kind: 'verifyTax'; requestId: string; partnerId: string; referralCode: string }

type Feedback = { requestId: string; ok: boolean; message: string }

const COPY = {
  tr: {
    title: 'Ödeme talepleri',
    description: 'Nakit ödeme taleplerini inceleyin, komisyon bakiyelerini ve kredi dönüşümlerini takip edin.',
    privacy: 'E-postalar sunucu tarafında maskelenir. Tam IBAN yalnızca yetkili yönetici tarafından talep bazında açılır ve her görüntüleme denetlenir.',
    openRequests: 'Bekleyen nakit talebi',
    pending: 'Bekleyen komisyon',
    available: 'Kullanılabilir komisyon',
    converted: 'Krediye dönüştürülen bakiye',
    topup: 'GLOVAL AI sistem katkısı',
    request: 'Ortak / talep',
    method: 'Yöntem',
    amount: 'Tutar',
    tax: 'Vergi / belge',
    requestedAt: 'Talep tarihi',
    status: 'Durum',
    actions: 'İşlemler',
    cash: 'Nakit',
    credit: 'AI kredisi',
    individual: 'Bireysel',
    company: 'Şirket',
    requested: 'İncelemede',
    paid: 'Ödendi',
    rejected: 'Reddedildi',
    convertedStatus: 'Dönüştürüldü',
    invoiceRequired: 'Komisyon faturası bekleniyor',
    invoiceReceived: 'Fatura alındı',
    expenseDocument: 'Gider belgesi GLOVAL tarafından düzenlenecek',
    creditAmount: 'Eklenen AI kredisi',
    payoutAmount: 'Banka ödeme tutarı',
    noRequests: 'Henüz ödeme talebi yok.',
    unavailable: 'Ödeme yönetim verileri yüklenemiyor. SQL taslaklarının uygulanmış ve ödeme bayraklarının açık olduğundan emin olun.',
    showIban: 'IBAN’ı göster',
    hideIban: 'IBAN’ı gizle',
    invoiceAction: 'Fatura alındı',
    paidAction: 'Ödendi olarak işaretle',
    rejectAction: 'Reddet',
    verifyTax: 'Vergi bilgisi doğrulandı',
    invoiceField: 'Fatura referansı',
    invoiceHint: 'Faturadaki numarayı veya muhasebe referansını girin.',
    paymentField: 'Ödeme referansı',
    paymentHint: 'Banka işlem numarası veya ödeme kaydı referansı.',
    rejectField: 'Red notu',
    rejectHint: 'Ortağa iletilecek kısa gerekçeyi yazın.',
    minimumReference: 'En az 2 karakter girin.',
    minimumNote: 'Red notu en az 3 karakter olmalı.',
    review: 'İncele',
    cancel: 'Vazgeç',
    confirming: 'İşleniyor…',
    confirm: 'Onayla',
    confirmInvoiceTitle: 'Fatura alındı olarak kaydedilsin mi?',
    confirmInvoiceBody: 'Fatura referansı kaydedilecek ve ödeme talebi daha sonra işlenebilir.',
    confirmPaidTitle: 'Nakit ödeme işlensin mi?',
    confirmPaidBody: 'Ödeme referansı kaydedilecek, komisyon talebi tamamlanacak ve gerekiyorsa vergi doğrulaması için ortak askıya alınacak.',
    confirmRejectTitle: 'Nakit ödeme talebi reddedilsin mi?',
    confirmRejectBody: 'Komisyon bakiyesi ortağın kullanılabilir bakiyesine geri eklenecek. Red notu denetim kaydına yazılacak.',
    confirmVerifyTitle: 'Vergi bilgisi doğrulansın mı?',
    confirmVerifyBody: 'Ortak askıdaysa yeniden etkinleştirilecek ve bu işlem denetim kaydına eklenecek.',
    actionSuccess: 'İşlem tamamlandı.',
    actionError: 'İşlem tamamlanamadı. Lütfen tekrar deneyin.',
    invoicePending: 'Ödeme için önce fatura referansını kaydedin.',
    invoiceConfirmRequired: 'Fatura kaydı tamamlanmadan ödeme işlenemez.',
    taxVerified: 'Doğrulandı',
    taxUnverified: 'Doğrulama bekliyor',
    requestId: 'Talep kimliği',
    error: {
      payout_disabled: 'Ödeme özellikleri kapalı.',
      cash_disabled: 'Nakit ödeme kapalı.',
      invalid_input: 'Talep bilgileri geçersiz.',
      invalid_reference: 'Referans 2–200 karakter olmalıdır.',
      invalid_note: 'Red notu 3–500 karakter olmalıdır.',
      not_found: 'Talep bulunamadı.',
      invoice_required: 'Önce fatura kaydı gereklidir.',
      invoice_already_recorded: 'Bu talep için fatura daha önce kaydedildi.',
      transition_conflict: 'Talebin durumu değişti. Sayfayı yenileyin.',
      missing_iban: 'Bu talep için IBAN bulunamadı.',
      encryption_unavailable: 'IBAN çözülemedi. Anahtar yapılandırmasını kontrol edin.',
      unavailable: 'İşlem şu anda kullanılamıyor.',
    } as Record<string, string>,
  },
  en: {
    title: 'Payout requests',
    description: 'Review cash payout requests, commission balances, and credit conversions.',
    privacy: 'Emails are masked server-side. Full IBAN is revealed per request to authorized admins only, and every reveal is audited.',
    openRequests: 'Open cash requests',
    pending: 'Pending commission',
    available: 'Available commission',
    converted: 'Balance converted to credits',
    topup: 'GLOVAL AI system contribution',
    request: 'Partner / request',
    method: 'Method',
    amount: 'Amount',
    tax: 'Tax / document',
    requestedAt: 'Requested',
    status: 'Status',
    actions: 'Actions',
    cash: 'Cash',
    credit: 'AI credits',
    individual: 'Individual',
    company: 'Company',
    requested: 'Under review',
    paid: 'Paid',
    rejected: 'Rejected',
    convertedStatus: 'Converted',
    invoiceRequired: 'Commission invoice pending',
    invoiceReceived: 'Invoice received',
    expenseDocument: 'GLOVAL will issue an expense document',
    creditAmount: 'AI credits added',
    payoutAmount: 'Bank payout amount',
    noRequests: 'No payout requests yet.',
    unavailable: 'Payout admin data is unavailable. Confirm the SQL drafts are applied and the payout flags are enabled.',
    showIban: 'Show IBAN',
    hideIban: 'Hide IBAN',
    invoiceAction: 'Invoice received',
    paidAction: 'Mark as paid',
    rejectAction: 'Reject',
    verifyTax: 'Verify tax information',
    invoiceField: 'Invoice reference',
    invoiceHint: 'Enter the invoice number or accounting reference.',
    paymentField: 'Payment reference',
    paymentHint: 'Bank transaction number or payment record reference.',
    rejectField: 'Rejection note',
    rejectHint: 'Enter a short reason that can be shared with the partner.',
    minimumReference: 'Enter at least 2 characters.',
    minimumNote: 'The rejection note must be at least 3 characters.',
    review: 'Review',
    cancel: 'Cancel',
    confirming: 'Processing…',
    confirm: 'Confirm',
    confirmInvoiceTitle: 'Record this invoice as received?',
    confirmInvoiceBody: 'The invoice reference will be saved and the payout can be processed afterward.',
    confirmPaidTitle: 'Process this cash payout?',
    confirmPaidBody: 'The payment reference will be saved, the payout completed, and an unverified partner may be suspended for tax verification.',
    confirmRejectTitle: 'Reject this cash payout request?',
    confirmRejectBody: 'The commission balance will be returned to the partner’s available balance. The rejection note will be audited.',
    confirmVerifyTitle: 'Verify this partner’s tax information?',
    confirmVerifyBody: 'A suspended partner will be reactivated and the verification will be audited.',
    actionSuccess: 'Action completed.',
    actionError: 'The action could not be completed. Try again.',
    invoicePending: 'Record the invoice reference before processing payment.',
    invoiceConfirmRequired: 'Payment cannot be processed before the invoice is recorded.',
    taxVerified: 'Verified',
    taxUnverified: 'Verification pending',
    requestId: 'Request ID',
    error: {
      payout_disabled: 'Payout features are disabled.',
      cash_disabled: 'Cash payouts are disabled.',
      invalid_input: 'Request details are invalid.',
      invalid_reference: 'A reference must contain 2–200 characters.',
      invalid_note: 'The rejection note must contain 3–500 characters.',
      not_found: 'The request was not found.',
      invoice_required: 'An invoice reference is required first.',
      invoice_already_recorded: 'An invoice has already been recorded for this request.',
      transition_conflict: 'The request status changed. Refresh the page.',
      missing_iban: 'No IBAN is available for this request.',
      encryption_unavailable: 'The IBAN could not be decrypted. Check the key configuration.',
      unavailable: 'This action is temporarily unavailable.',
    } as Record<string, string>,
  },
} as const

const STATUS_LABEL: Record<Language, Record<ReferralPayoutStatus, string>> = {
  tr: { requested: 'İncelemede', paid: 'Ödendi', rejected: 'Reddedildi', converted: 'Dönüştürüldü' },
  en: { requested: 'Under review', paid: 'Paid', rejected: 'Rejected', converted: 'Converted' },
}

function asDate(value: string, locale: string) {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp)
    : '—'
}

export function ReferralPayoutsAdminTable({
  requests,
  summary,
  enabled,
  unavailable = false,
}: {
  requests: ReferralPayoutAdminRequest[]
  summary: ReferralPayoutAdminSummary | null
  enabled: boolean
  unavailable?: boolean
}) {
  const { lang } = useLanguage()
  const language: Language = lang === 'tr' ? 'tr' : 'en'
  const copy = COPY[language]
  const locale = language === 'tr' ? 'tr-TR' : 'en-US'
  const router = useRouter()
  const [editAction, setEditAction] = useState<{ requestId: string; kind: EditKind } | null>(null)
  const [fieldValue, setFieldValue] = useState('')
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [working, setWorking] = useState(false)
  const [revealedIban, setRevealedIban] = useState<{ requestId: string; iban: string } | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  if (!enabled) return null

  function beginEdit(requestId: string, kind: EditKind) {
    setEditAction({ requestId, kind })
    setFieldValue('')
    setFeedback(null)
    setRevealedIban(null)
  }

  function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editAction || working) return
    const value = fieldValue.trim()
    if (editAction.kind === 'reject' ? value.length < 3 || value.length > 500 : value.length < 2 || value.length > 200) {
      setFeedback({
        requestId: editAction.requestId,
        ok: false,
        message: editAction.kind === 'reject' ? copy.minimumNote : copy.minimumReference,
      })
      return
    }

    setPendingAction({ ...editAction, value })
  }

  async function confirmPendingAction() {
    if (!pendingAction || working) return
    setWorking(true)
    setFeedback(null)
    try {
      let result
      if (pendingAction.kind === 'invoice') {
        result = await recordReferralCashInvoice({
          requestId: pendingAction.requestId,
          invoiceReference: pendingAction.value,
        })
      } else if (pendingAction.kind === 'paid') {
        result = await processReferralCashPayout({
          requestId: pendingAction.requestId,
          paymentReference: pendingAction.value,
        })
      } else if (pendingAction.kind === 'reject') {
        result = await rejectReferralCashPayout({
          requestId: pendingAction.requestId,
          note: pendingAction.value,
        })
      } else {
        result = await verifyReferralPartnerTax(pendingAction.partnerId)
      }

      if (!result.ok) {
        setFeedback({
          requestId: 'requestId' in pendingAction ? pendingAction.requestId : '',
          ok: false,
          message: copy.error[result.error] ?? copy.actionError,
        })
        setPendingAction(null)
        return
      }

      const requestId = 'requestId' in pendingAction ? pendingAction.requestId : ''
      setFeedback({ requestId, ok: true, message: copy.actionSuccess })
      setPendingAction(null)
      setEditAction(null)
      setFieldValue('')
      setRevealedIban(null)
      router.refresh()
    } catch {
      const requestId = 'requestId' in pendingAction ? pendingAction.requestId : ''
      setFeedback({ requestId, ok: false, message: copy.actionError })
      setPendingAction(null)
    } finally {
      setWorking(false)
    }
  }

  async function toggleIban(request: ReferralPayoutAdminRequest) {
    if (revealedIban?.requestId === request.requestId) {
      setRevealedIban(null)
      return
    }
    setWorking(true)
    setFeedback(null)
    try {
      const result = await revealReferralPayoutIban({
        partnerId: request.partnerId,
        requestId: request.requestId,
      })
      if (!result.ok || !result.iban) {
        setFeedback({
          requestId: request.requestId,
          ok: false,
          message: !result.ok ? copy.error[result.error] ?? copy.actionError : copy.actionError,
        })
        return
      }
      setRevealedIban({ requestId: request.requestId, iban: result.iban })
    } catch {
      setFeedback({ requestId: request.requestId, ok: false, message: copy.actionError })
    } finally {
      setWorking(false)
    }
  }

  function confirmTitle(action: PendingAction | null) {
    if (!action) return ''
    if (action.kind === 'invoice') return copy.confirmInvoiceTitle
    if (action.kind === 'paid') return copy.confirmPaidTitle
    if (action.kind === 'reject') return copy.confirmRejectTitle
    return copy.confirmVerifyTitle
  }

  function confirmDescription(action: PendingAction | null) {
    if (!action) return ''
    const summary = action.kind === 'invoice'
      ? `${copy.invoiceField}: ${action.value}`
      : action.kind === 'paid'
        ? `${copy.paymentField}: ${action.value}`
        : action.kind === 'reject'
          ? `${copy.rejectField}: ${action.value}`
          : `${copy.request}: ${action.referralCode}`
    const explanation = action.kind === 'invoice'
      ? copy.confirmInvoiceBody
      : action.kind === 'paid'
        ? copy.confirmPaidBody
        : action.kind === 'reject'
          ? copy.confirmRejectBody
          : copy.confirmVerifyBody
    return `${explanation}\n\n${summary}`
  }

  const summaryCards = summary ? [
    { label: copy.openRequests, value: new Intl.NumberFormat(locale).format(summary.openCashRequests) },
    { label: copy.pending, value: formatReferralTry(summary.pendingCents, language) },
    { label: copy.available, value: formatReferralTry(summary.availableCents, language) },
    { label: copy.converted, value: formatReferralTry(summary.convertedCents, language) },
    { label: copy.topup, value: formatReferralTry(summary.systemTopupCents, language) },
  ] : []

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{copy.title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{copy.description}</p>
      </div>

      {unavailable || !summary ? (
        <Alert variant="destructive"><AlertDescription>{copy.unavailable}</AlertDescription></Alert>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {summaryCards.map((card) => (
              <Card key={card.label}>
                <CardHeader className="pb-2"><CardDescription>{card.label}</CardDescription></CardHeader>
                <CardContent><p className="text-lg font-semibold tabular-nums text-foreground">{card.value}</p></CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{copy.title}</CardTitle>
              <CardDescription>{copy.privacy}</CardDescription>
            </CardHeader>
            <CardContent>
              {requests.length === 0 ? (
                <p className="text-sm text-muted-foreground">{copy.noRequests}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{copy.request}</TableHead>
                      <TableHead>{copy.method}</TableHead>
                      <TableHead>{copy.amount}</TableHead>
                      <TableHead>{copy.tax}</TableHead>
                      <TableHead>{copy.requestedAt}</TableHead>
                      <TableHead>{copy.status}</TableHead>
                      <TableHead>{copy.actions}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requests.map((request) => (
                      <FragmentRows
                        key={request.requestId}
                        request={request}
                        language={language}
                        locale={locale}
                        copy={copy}
                        editing={editAction?.requestId === request.requestId ? editAction.kind : null}
                        fieldValue={fieldValue}
                        onFieldChange={setFieldValue}
                        onBeginEdit={beginEdit}
                        onEditSubmit={handleEditSubmit}
                        onCancelEdit={() => setEditAction(null)}
                        onToggleIban={toggleIban}
                        revealedIban={revealedIban?.requestId === request.requestId ? revealedIban.iban : null}
                        feedback={feedback?.requestId === request.requestId ? feedback : null}
                        working={working}
                        onVerifyTax={() => setPendingAction({
                          kind: 'verifyTax',
                          requestId: request.requestId,
                          partnerId: request.partnerId,
                          referralCode: request.referralCode,
                        })}
                      />
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <ConfirmDialog
        open={pendingAction !== null}
        title={confirmTitle(pendingAction)}
        description={confirmDescription(pendingAction)}
        confirmLabel={working ? copy.confirming : copy.confirm}
        cancelLabel={copy.cancel}
        destructive={pendingAction?.kind === 'reject'}
        confirmDisabled={working}
        onConfirm={confirmPendingAction}
        onCancel={() => setPendingAction(null)}
      />
    </section>
  )
}

function FragmentRows({
  request,
  language,
  locale,
  copy,
  editing,
  fieldValue,
  onFieldChange,
  onBeginEdit,
  onEditSubmit,
  onCancelEdit,
  onToggleIban,
  revealedIban,
  feedback,
  working,
  onVerifyTax,
}: {
  request: ReferralPayoutAdminRequest
  language: Language
  locale: string
  copy: (typeof COPY)[Language]
  editing: EditKind | null
  fieldValue: string
  onFieldChange: (value: string) => void
  onBeginEdit: (requestId: string, kind: EditKind) => void
  onEditSubmit: (event: FormEvent<HTMLFormElement>) => void
  onCancelEdit: () => void
  onToggleIban: (request: ReferralPayoutAdminRequest) => void
  revealedIban: string | null
  feedback: Feedback | null
  working: boolean
  onVerifyTax: () => void
}) {
  const localeCode = language === 'tr' ? 'tr-TR' : 'en-US'
  const isCashRequest = request.method === 'cash' && request.status === 'requested'
  const canVerifyTax = request.taxVerifiedAt === null && request.partnerStatus !== 'closed'
  const statusLabel = STATUS_LABEL[language][request.status]

  return (
    <>
      <TableRow>
        <TableCell className="min-w-44">
          <p className="font-mono text-xs font-semibold text-foreground">{request.referralCode}</p>
          <p className="mt-1 text-xs text-muted-foreground">{request.maskedEmail}</p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground" title={request.requestId}>{request.requestId.slice(0, 8)}</p>
        </TableCell>
        <TableCell>{request.method === 'cash' ? copy.cash : copy.credit}</TableCell>
        <TableCell className="min-w-40">
          {request.method === 'cash' ? (
            <>
              <p className="font-medium tabular-nums">{formatReferralTry(request.payoutCents, language)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{copy.payoutAmount}</p>
            </>
          ) : (
            <>
              <p className="font-medium tabular-nums">{new Intl.NumberFormat(localeCode).format(request.creditAmount ?? 0)} {copy.credit}</p>
              <p className="mt-1 text-xs text-muted-foreground">{copy.topup}: {formatReferralTry(request.systemTopupCents, language)}</p>
            </>
          )}
        </TableCell>
        <TableCell className="min-w-48">
          <p className="text-sm">{request.taxStatus === 'company' ? copy.company : request.taxStatus === 'individual' ? copy.individual : '—'}</p>
          {request.method === 'cash' && (
            <p className="mt-1 text-xs text-muted-foreground">
              {request.invoiceRequired
                ? request.invoiceConfirmed ? copy.invoiceReceived : copy.invoiceRequired
                : copy.expenseDocument}
            </p>
          )}
          {request.ibanLast4 && <p className="mt-1 font-mono text-xs text-muted-foreground">•••• {request.ibanLast4}</p>}
          {request.taxVerifiedAt && <Badge variant="outline" className="mt-1">{copy.taxVerified}</Badge>}
          {!request.taxVerifiedAt && request.partnerStatus !== 'closed' && <Badge variant="secondary" className="mt-1">{copy.taxUnverified}</Badge>}
          {request.adminNote && request.status === 'rejected' && <p className="mt-1 max-w-52 whitespace-normal text-xs text-muted-foreground">{request.adminNote}</p>}
        </TableCell>
        <TableCell className="min-w-36 text-xs text-muted-foreground">{asDate(request.requestedAt, locale)}</TableCell>
        <TableCell><Badge variant={request.status === 'paid' ? 'default' : request.status === 'rejected' ? 'destructive' : 'secondary'}>{statusLabel}</Badge></TableCell>
        <TableCell className="min-w-56">
          <div className="flex flex-wrap gap-2">
            {isCashRequest && (
              <>
                <Button type="button" size="sm" variant="outline" disabled={working} onClick={() => void onToggleIban(request)}>
                  {revealedIban ? copy.hideIban : copy.showIban}
                </Button>
                {request.invoiceRequired && !request.invoiceConfirmed && (
                  <Button type="button" size="sm" variant="outline" disabled={working} onClick={() => onBeginEdit(request.requestId, 'invoice')}>
                    {copy.invoiceAction}
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  disabled={working || (request.invoiceRequired && !request.invoiceConfirmed)}
                  onClick={() => onBeginEdit(request.requestId, 'paid')}
                  title={request.invoiceRequired && !request.invoiceConfirmed ? copy.invoicePending : undefined}
                >
                  {copy.paidAction}
                </Button>
                <Button type="button" size="sm" variant="destructive" disabled={working} onClick={() => onBeginEdit(request.requestId, 'reject')}>
                  {copy.rejectAction}
                </Button>
              </>
            )}
            {canVerifyTax && (
              <Button type="button" size="sm" variant="outline" disabled={working} onClick={onVerifyTax}>
                {copy.verifyTax}
              </Button>
            )}
          </div>
          {revealedIban && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 p-2">
              <p className="font-mono text-xs text-foreground">{revealedIban}</p>
              <Button type="button" size="xs" variant="ghost" onClick={() => void onToggleIban(request)}>{copy.hideIban}</Button>
            </div>
          )}
          {feedback && (
            <p role={feedback.ok ? 'status' : 'alert'} className={`mt-2 text-xs ${feedback.ok ? 'text-primary' : 'text-destructive'}`}>
              {feedback.message}
            </p>
          )}
        </TableCell>
      </TableRow>
      {editing && (
        <TableRow>
          <TableCell colSpan={7}>
            <form onSubmit={onEditSubmit} className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-3 sm:flex-row sm:items-end">
              <Field className="min-w-0 flex-1">
                <FieldLabel htmlFor={`referral-payout-${request.requestId}-${editing}`}>
                  {editing === 'invoice' ? copy.invoiceField : editing === 'paid' ? copy.paymentField : copy.rejectField}
                </FieldLabel>
                <Input
                  id={`referral-payout-${request.requestId}-${editing}`}
                  value={fieldValue}
                  onChange={(event) => onFieldChange(event.target.value)}
                  autoComplete="off"
                  maxLength={editing === 'reject' ? 500 : 200}
                  required
                  disabled={working}
                />
                <FieldDescription>
                  {editing === 'invoice' ? copy.invoiceHint : editing === 'paid' ? copy.paymentHint : copy.rejectHint}
                </FieldDescription>
              </Field>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={onCancelEdit} disabled={working}>{copy.cancel}</Button>
                <Button type="submit" size="sm" disabled={working}>{copy.review}</Button>
              </div>
            </form>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
