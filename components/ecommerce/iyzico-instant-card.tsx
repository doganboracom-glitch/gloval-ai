'use client'

import { useState, useTransition } from 'react'
import useSWR from 'swr'
import { CheckCircle2, Info, Loader2, Send } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import {
  getIyzicoInstantPrefill,
  submitIyzicoInstant,
  type IyzicoInstantPrefill,
} from '@/lib/iyzico-onboarding'
import { IYZICO_CAMPAIGN_COPY } from '@/lib/iyzico-onboarding-shared'

const copy = {
  tr: {
    title: 'iyzico ön başvuru',
    intro: "iyzico hesabınız yoksa yalnızca ad, soyad, telefon ve e-posta bilgilerinizi iyzico'ya iletebilirsiniz.",
    firstName: 'Ad',
    lastName: 'Soyad',
    email: 'E-posta',
    phone: 'Telefon',
    consent: "Ad, soyad, e-posta ve telefon bilgilerimin iyzico'ya iletilmesini ve iyzico tarafından benimle iletişime geçilmesini kabul ediyorum.",
    kvkk: 'KVKK Aydınlatma Metni',
    submit: 'Ön başvuru gönder',
    sending: 'Gönderiliyor...',
    success: 'Ön başvurunuz iyzico\'ya iletildi. İletişim için teşekkürler.',
    errors: {
      invalid_name: 'Ad ve soyad gerekli ve çok uzun olamaz.',
      invalid_email: 'Geçerli bir e-posta adresi girin.',
      invalid_phone: 'Geçerli bir Türkiye telefon numarası girin.',
      consent_required: 'Göndermek için açık onayınızı vermeniz gerekir.',
      already_submitted: 'Başvurunuz zaten iletildi, iyzico ekibi sizinle iletişime geçecek.',
      in_progress: 'Başvurunuz şu anda iletiliyor. Lütfen birkaç dakika bekleyin.',
      rate_limited: 'Bu mağaza veya hesap için çok fazla başvuru denendi. Lütfen 24 saat sonra tekrar deneyin.',
      rejected: 'iyzico bilgileri kabul etmedi. Bilgilerinizi kontrol edip tekrar deneyin.',
      unavailable: 'Başvuru şu anda gönderilemedi. Lütfen daha sonra tekrar deneyin.',
    } as Record<string, string>,
  },
  en: {
    title: 'iyzico pre-application',
    intro: 'If you have no iyzico account, you can send only your name, surname, phone and email to iyzico.',
    firstName: 'First name',
    lastName: 'Last name',
    email: 'Email',
    phone: 'Phone',
    consent: 'I agree to iyzico receiving my name, surname, email and phone number and contacting me.',
    kvkk: 'KVKK disclosure text',
    submit: 'Send application',
    sending: 'Sending...',
    success: 'Your application was sent to iyzico. Thank you.',
    errors: {
      invalid_name: 'First and last name are required and cannot be too long.',
      invalid_email: 'Enter a valid email address.',
      invalid_phone: 'Enter a valid Turkish phone number.',
      consent_required: 'You must give your explicit consent to send.',
      already_submitted: 'Your application was already sent; the iyzico team will contact you.',
      in_progress: 'Your application is being sent. Please wait a few minutes.',
      rate_limited: 'Too many applications were attempted for this store or account. Please try again in 24 hours.',
      rejected: 'iyzico did not accept the details. Check them and try again.',
      unavailable: 'The application could not be sent. Please try again later.',
    } as Record<string, string>,
  },
}

type FormField = 'firstName' | 'lastName' | 'email' | 'phone'

export function IyzicoInstantCard({ projectId }: { projectId: string }) {
  const { lang } = useLanguage()
  const c = copy[lang === 'en' ? 'en' : 'tr']
  const { data: prefill } = useSWR<IyzicoInstantPrefill>(
    ['iyzico-instant-prefill', projectId],
    () => getIyzicoInstantPrefill(projectId),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )
  const [edits, setEdits] = useState<Partial<Record<FormField, string>>>({})
  const [consent, setConsent] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'info' | 'error'; text: string } | null>(null)
  const [sending, startSending] = useTransition()

  if (!prefill?.enabled) return null

  const form = {
    firstName: edits.firstName ?? prefill.firstName,
    lastName: edits.lastName ?? prefill.lastName,
    email: edits.email ?? prefill.email,
    phone: edits.phone ?? prefill.phone,
  }

  function update(field: FormField, value: string) {
    setEdits((current) => ({ ...current, [field]: value }))
  }

  function submit() {
    if (!consent || sending) return
    setMessage(null)
    startSending(async () => {
      try {
        const result = await submitIyzicoInstant(projectId, form, consent)
        if (result.ok) {
          setMessage({ kind: 'success', text: c.success })
        } else {
          const informational = result.error === 'already_submitted' || result.error === 'in_progress'
          setMessage({
            kind: informational ? 'info' : 'error',
            text: c.errors[result.error] ?? c.errors.unavailable,
          })
        }
      } catch {
        setMessage({ kind: 'error', text: c.errors.unavailable })
      }
    })
  }

  const inputClass = 'h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30'

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-muted/20 p-4" aria-labelledby="iyzico-instant-title">
      <div>
        <h3 id="iyzico-instant-title" className="font-medium">{c.title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{c.intro}</p>
        {prefill.showCampaign && (
          <p className="mt-2 rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed text-foreground">
            {IYZICO_CAMPAIGN_COPY[lang === 'en' ? 'en' : 'tr']}
          </p>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {([['firstName', c.firstName], ['lastName', c.lastName], ['email', c.email], ['phone', c.phone]] as const).map(([field, label]) => (
          <label key={field} className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{label}</span>
            <input className={inputClass} value={form[field]} onChange={(event) => update(field, event.target.value)} autoComplete={field === 'firstName' ? 'given-name' : field === 'lastName' ? 'family-name' : field} />
          </label>
        ))}
      </div>
      <label className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 size-4 shrink-0 accent-primary" />
        <span>{c.consent}{' '}<a href="/yasal/kvkk" target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline underline-offset-2">{c.kvkk}</a></span>
      </label>
      {message && <p role={message.kind === 'error' ? 'alert' : 'status'} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${message.kind === 'error' ? 'border-destructive/40 bg-destructive/10 text-destructive' : message.kind === 'info' ? 'border-border bg-muted text-foreground' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}`}>{message.kind === 'success' ? <CheckCircle2 className="size-4 shrink-0" /> : message.kind === 'info' ? <Info className="size-4 shrink-0" /> : null}{message.text}</p>}
      <button type="button" onClick={submit} disabled={!consent || sending} className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
        {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        {sending ? c.sending : c.submit}
      </button>
    </section>
  )
}
