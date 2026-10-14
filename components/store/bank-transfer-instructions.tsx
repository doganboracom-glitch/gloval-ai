import { formatIban } from '@/lib/iban'
import {
  BANK_DETAILS_MISSING_COPY,
  formatBankDueDate,
  type BankTransferInstructionsData,
} from '@/lib/bank-transfer-instructions'

const COPY = {
  tr: {
    title: 'Havale / EFT bilgileri',
    intro: (ref: string, due: string) =>
      `Tutarı aşağıdaki hesaba gönderirken açıklamaya ${ref} yazın. Ödeme ${due} tarihine kadar yapılmazsa sipariş otomatik iptal edilir.`,
    bank: 'Banka',
    holder: 'Hesap sahibi',
    iban: 'IBAN',
    reference: 'Açıklama',
    due: 'Son ödeme tarihi',
    note: 'Not',
  },
  en: {
    title: 'Bank transfer details',
    intro: (ref: string, due: string) =>
      `Please put ${ref} in the transfer description. If payment is not made by ${due}, the order is cancelled automatically.`,
    bank: 'Bank',
    holder: 'Account holder',
    iban: 'IBAN',
    reference: 'Description',
    due: 'Payment due by',
    note: 'Note',
  },
} as const

export function BankTransferInstructions({
  data,
  language = 'tr',
  headingId = 'bank-heading',
  className = '',
}: {
  data: BankTransferInstructionsData
  language?: 'tr' | 'en'
  headingId?: string
  className?: string
}) {
  const t = COPY[language]
  const due = formatBankDueDate(data.dueAt, language)
  return (
    <section
      aria-labelledby={headingId}
      className={`rounded-2xl border border-border bg-card p-5 ${className}`}
    >
      <h2 id={headingId} className="font-display text-lg font-bold">
        {t.title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t.intro(data.reference, due)}</p>
      <dl className="mt-4 grid gap-2 text-sm">
        {data.bankName && <Row label={t.bank} value={data.bankName} />}
        {data.accountHolder && <Row label={t.holder} value={data.accountHolder} />}
        <Row label={t.iban} value={formatIban(data.iban)} mono />
        <Row label={t.reference} value={data.reference} mono />
        <Row label={t.due} value={due} />
        {data.instructions && <Row label={t.note} value={data.instructions} />}
      </dl>
    </section>
  )
}

export function BankTransferMissing({
  language = 'tr',
  headingId = 'bank-missing-heading',
  className = '',
}: {
  language?: 'tr' | 'en'
  headingId?: string
  className?: string
}) {
  const t = BANK_DETAILS_MISSING_COPY[language]
  return (
    <section
      aria-labelledby={headingId}
      className={`rounded-2xl border border-border bg-card p-5 ${className}`}
    >
      <h2 id={headingId} className="font-display text-lg font-bold">
        {t.title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t.body}</p>
    </section>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`text-right font-medium ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}
