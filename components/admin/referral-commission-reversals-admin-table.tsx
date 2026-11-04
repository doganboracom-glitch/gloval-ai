'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/components/language-provider'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { reverseReferralCommissionManually } from '@/lib/referrals/admin-payout-actions'
import type {
  ReferralAdminCommissionActionError,
} from '@/lib/referrals/admin-payout-actions'
import type {
  ReferralCommissionAdminRow,
  ReferralCommissionAdminStatus,
} from '@/lib/referrals/partner-types'

type AdminLanguage = 'tr' | 'en'

type CommissionCopy = {
  title: string
  description: string
  unavailable: string
  emptyTitle: string
  emptyDescription: string
  partner: string
  commission: string
  status: string
  paidAt: string
  availableAt: string
  action: string
  reverseAction: string
  confirmTitle: string
  confirmDescription: string
  reasonLabel: string
  reasonHelp: string
  reasonRequired: string
  cancel: string
  confirm: string
  confirming: string
  success: string
  repeated: string
  errors: Record<ReferralAdminCommissionActionError, string>
  statuses: Record<ReferralCommissionAdminStatus, string>
}

const copyByLanguage: Record<AdminLanguage, CommissionCopy> = {
  tr: {
    title: 'Komisyon iadeleri',
    description: 'İyzico panelinde yapılan para iadeleri komisyon defterine otomatik aktarılmaz. Bu işlem ödeme iadesi yapmaz; komisyonu iptal eder, gerekçeyi denetim kaydına ekler ve işlem zamanına göre bekleme öncesi ya da sonrası düzeltme yazar.',
    unavailable: 'Komisyon kayıtları şu anda yüklenemiyor.',
    emptyTitle: 'İptal edilebilir komisyon yok',
    emptyDescription: 'İade sonrası manuel iptal gerektiren bir komisyon kaydı bulunmuyor.',
    partner: 'Ortak / kayıt',
    commission: 'Komisyon',
    status: 'Durum',
    paidAt: 'Ödeme tarihi',
    availableAt: 'Hak ediş tarihi',
    action: 'İşlem',
    reverseAction: 'Komisyonu manuel iptal et',
    confirmTitle: 'Komisyonu manuel iptal et?',
    confirmDescription: 'Bu işlem müşteriye para iadesi yapmaz. Yalnızca komisyon defterine ters kayıt ekler; komisyon daha önce ödendiyse bakiye düzeltmesi oluşturur.',
    reasonLabel: 'İptal nedeni',
    reasonHelp: 'Zorunludur ve denetim kaydında saklanır.',
    reasonRequired: 'Lütfen en az 3 karakterlik bir neden girin.',
    cancel: 'Vazgeç',
    confirm: 'Komisyonu iptal et',
    confirming: 'Kaydediliyor…',
    success: 'Komisyon iptali ve denetim kaydı oluşturuldu.',
    repeated: 'Bu komisyon daha önce iptal edilmişti; yeni kayıt oluşturulmadı.',
    errors: {
      payout_disabled: 'Satış ortaklığı ödemeleri şu anda devre dışı.',
      invalid_input: 'Komisyon kaydı geçersiz.',
      invalid_reason: 'İptal nedeni en az 3, en fazla 500 karakter olmalıdır.',
      not_found: 'Komisyon kaydı bulunamadı.',
      unavailable: 'Komisyon iptali kaydedilemedi. Lütfen yeniden deneyin.',
    },
    statuses: {
      pending: 'Beklemede',
      available: 'Ödenebilir',
      requested: 'Talep edildi',
      converted: 'Krediye çevrildi',
      paid: 'Ödendi',
    },
  },
  en: {
    title: 'Commission reversals',
    description: 'Refunds made in the Iyzico panel do not automatically update the commission ledger. This action does not refund the customer; it reverses the commission, records the reason for audit, and uses a pre-hold or post-hold adjustment based on timing.',
    unavailable: 'Commission records are temporarily unavailable.',
    emptyTitle: 'No reversible commissions',
    emptyDescription: 'There are no commission records that need manual reversal after a provider refund.',
    partner: 'Partner / record',
    commission: 'Commission',
    status: 'Status',
    paidAt: 'Paid at',
    availableAt: 'Available at',
    action: 'Action',
    reverseAction: 'Reverse manually',
    confirmTitle: 'Manually reverse this commission?',
    confirmDescription: 'This will not refund the customer. It appends a reversal to the commission ledger; if the commission was already paid, it creates a balance adjustment.',
    reasonLabel: 'Reason for reversal',
    reasonHelp: 'Required and retained in the audit record.',
    reasonRequired: 'Enter a reason of at least 3 characters.',
    cancel: 'Cancel',
    confirm: 'Reverse commission',
    confirming: 'Saving…',
    success: 'Commission reversal and audit record created.',
    repeated: 'This commission was already reversed; no duplicate record was created.',
    errors: {
      payout_disabled: 'Referral payouts are currently disabled.',
      invalid_input: 'The commission record is invalid.',
      invalid_reason: 'The reason must contain 3–500 characters.',
      not_found: 'The commission record was not found.',
      unavailable: 'The commission reversal could not be saved. Try again.',
    },
    statuses: {
      pending: 'Pending',
      available: 'Available',
      requested: 'Requested',
      converted: 'Converted to credits',
      paid: 'Paid',
    },
  },
}

function formatTry(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'TRY' }).format(cents / 100)
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value))
}

export function ReferralCommissionReversalsAdminTable({
  commissions,
  enabled,
  unavailable,
}: {
  commissions: ReferralCommissionAdminRow[]
  enabled: boolean
  unavailable: boolean
}) {
  const { lang } = useLanguage()
  const language: AdminLanguage = lang === 'tr' ? 'tr' : 'en'
  const copy = copyByLanguage[language]
  const locale = language === 'tr' ? 'tr-TR' : 'en-US'
  const router = useRouter()
  const [selected, setSelected] = useState<ReferralCommissionAdminRow | null>(null)
  const [reason, setReason] = useState('')
  const [reasonAttempted, setReasonAttempted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const reasonIsValid = reason.trim().length >= 3 && reason.trim().length <= 500
  const showReasonError = reasonAttempted && !reasonIsValid

  function beginReversal(commission: ReferralCommissionAdminRow) {
    setSelected(commission)
    setReason('')
    setReasonAttempted(false)
    setError(null)
    setFeedback(null)
  }

  function cancelReversal() {
    if (submitting) return
    setSelected(null)
    setReason('')
    setReasonAttempted(false)
    setError(null)
  }

  async function confirmReversal() {
    setReasonAttempted(true)
    if (!selected || !reasonIsValid || submitting) return

    setSubmitting(true)
    setError(null)
    try {
      const result = await reverseReferralCommissionManually({
        commissionId: selected.commissionId,
        reason: reason.trim(),
      })
      if (!result.ok) {
        setError(copy.errors[result.error])
        return
      }

      setFeedback(result.alreadyProcessed ? copy.repeated : copy.success)
      setSelected(null)
      setReason('')
      setReasonAttempted(false)
      router.refresh()
    } catch {
      setError(copy.errors.unavailable)
    } finally {
      setSubmitting(false)
    }
  }

  if (!enabled) return null

  return (
    <Card id="reversals" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="text-base">{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {feedback ? <p role="status" className="text-sm text-muted-foreground">{feedback}</p> : null}
        {unavailable ? (
          <Alert variant="destructive"><AlertDescription>{copy.unavailable}</AlertDescription></Alert>
        ) : commissions.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{copy.emptyTitle}</EmptyTitle>
              <EmptyDescription>{copy.emptyDescription}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{copy.partner}</TableHead>
                <TableHead>{copy.commission}</TableHead>
                <TableHead>{copy.status}</TableHead>
                <TableHead>{copy.paidAt}</TableHead>
                <TableHead>{copy.availableAt}</TableHead>
                <TableHead>{copy.action}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {commissions.map((commission) => (
                <TableRow key={commission.commissionId}>
                  <TableCell className="min-w-40">
                    <p className="font-mono text-xs font-semibold text-foreground">{commission.referralCode}</p>
                    <p
                      className="mt-1 font-mono text-[11px] text-muted-foreground"
                      title={commission.commissionId}
                      aria-label={`Commission ID ${commission.commissionId}`}
                    >
                      {commission.commissionId.slice(0, 8)}
                    </p>
                  </TableCell>
                  <TableCell className="tabular-nums">{formatTry(commission.commissionCents, locale)}</TableCell>
                  <TableCell><Badge variant="outline">{copy.statuses[commission.status]}</Badge></TableCell>
                  <TableCell className="min-w-32 text-xs text-muted-foreground">{formatDate(commission.paidAt, locale)}</TableCell>
                  <TableCell className="min-w-32 text-xs text-muted-foreground">{formatDate(commission.availableAt, locale)}</TableCell>
                  <TableCell>
                    <Button type="button" size="sm" variant="destructive" disabled={submitting} onClick={() => beginReversal(commission)}>
                      {copy.reverseAction}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <ConfirmDialog
        open={selected !== null}
        title={copy.confirmTitle}
        description={selected
          ? `${copy.confirmDescription} (${selected.referralCode} · ${formatTry(selected.commissionCents, locale)})`
          : copy.confirmDescription}
        confirmLabel={submitting ? copy.confirming : copy.confirm}
        cancelLabel={copy.cancel}
        destructive
        confirmDisabled={submitting}
        onConfirm={confirmReversal}
        onCancel={cancelReversal}
      >
        <FieldGroup className="mt-4">
          <Field data-invalid={showReasonError || undefined}>
            <FieldLabel htmlFor="referral-commission-reversal-reason">{copy.reasonLabel}</FieldLabel>
            <Input
              id="referral-commission-reversal-reason"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value)
                setError(null)
              }}
              onBlur={() => setReasonAttempted(true)}
              maxLength={500}
              required
              aria-invalid={showReasonError}
              aria-describedby="referral-commission-reversal-reason-help"
              autoComplete="off"
            />
            <FieldDescription id="referral-commission-reversal-reason-help">{copy.reasonHelp}</FieldDescription>
            {showReasonError ? <FieldError>{copy.reasonRequired}</FieldError> : null}
          </Field>
        </FieldGroup>
        {error ? (
          <Alert className="mt-4" variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </ConfirmDialog>
    </Card>
  )
}
