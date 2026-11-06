'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { acceptReferralTerms } from '@/lib/referrals/partner-actions'

type Props = {
  acceptedVersion: string | null
  currentVersion: string
}

const COPY = {
  tr: {
    title: 'Güncellenen ortaklık şartlarını kabul edin',
    description: 'Şartlar {previous} sürümünden {current} sürümüne güncellendi. Ortaklık panelinizi ve ödeme işlemlerini kullanmaya devam etmek için yeni şartları inceleyip kabul edin.',
    link: 'Güncellenen şartların tamamını inceleyin',
    checkbox: '{version} sürümündeki şartları okudum ve kabul ediyorum.',
    button: 'Kabul et ve devam et',
    saving: 'Kaydediliyor…',
    failed: 'Kabulünüz kaydedilemedi. Lütfen yeniden deneyin.',
    errors: {
      not_authenticated: 'Oturumunuz doğrulanamadı. Lütfen yeniden giriş yapın.',
      program_unavailable: 'Program şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.',
      terms_required: 'Devam etmek için güncel şartları kabul etmelisiniz.',
      not_active: 'Etkin bir ortaklık bulunamadı.',
    } as Record<string, string>,
  },
  en: {
    title: 'Accept the updated partner terms',
    description: 'The terms changed from {previous} to {current}. Review and accept the updated terms to continue using your partner dashboard and payout features.',
    link: 'Review the complete updated terms',
    checkbox: 'I have read and accept the terms in version {version}.',
    button: 'Accept and continue',
    saving: 'Saving…',
    failed: 'Your acceptance could not be saved. Please try again.',
    errors: {
      not_authenticated: 'Your session could not be verified. Please sign in again.',
      program_unavailable: 'The program is unavailable right now. Please try again later.',
      terms_required: 'You must accept the current terms to continue.',
      not_active: 'No active partnership was found.',
    } as Record<string, string>,
  },
} as const

export function ReferralTermsReacceptance({ acceptedVersion, currentVersion }: Props) {
  const { lang } = useLanguage()
  const language = lang === 'tr' ? 'tr' : 'en'
  const copy = COPY[language]
  const router = useRouter()
  const [accepted, setAccepted] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const previousVersion = acceptedVersion ?? (language === 'tr' ? 'önceki' : 'a previous')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || !accepted) return

    setPending(true)
    setError(null)
    try {
      const result = await acceptReferralTerms({ termsAccepted: accepted, termsVersion: currentVersion })
      if (!result.ok) {
        setError(copy.errors[result.error] ?? copy.failed)
        return
      }
      router.refresh()
    } catch {
      setError(copy.failed)
    } finally {
      setPending(false)
    }
  }

  return (
    <section aria-labelledby="referral-terms-reacceptance-title" className="flex flex-col gap-4 rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex flex-col gap-2">
        <h3 id="referral-terms-reacceptance-title" className="text-base font-semibold text-foreground">
          {copy.title}
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {copy.description
            .replace('{previous}', previousVersion)
            .replace('{current}', currentVersion)}
        </p>
        <Link href="/yasal/satis-ortakligi-sartlari" className="w-fit text-sm font-medium text-primary underline underline-offset-4">
          {copy.link}
        </Link>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Field className="flex-row items-start gap-2" data-invalid={Boolean(error && !accepted)}>
          <input
            id="referral-terms-reacceptance"
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            aria-invalid={Boolean(error && !accepted)}
            aria-describedby={error ? 'referral-terms-reacceptance-error' : undefined}
            disabled={pending}
            className="mt-1 size-4 shrink-0 accent-primary"
          />
          <FieldLabel htmlFor="referral-terms-reacceptance" className="font-normal leading-relaxed">
            {copy.checkbox.replace('{version}', currentVersion)}
          </FieldLabel>
        </Field>
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription id="referral-terms-reacceptance-error">{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={!accepted || pending} className="w-fit gap-2">
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {pending ? copy.saving : copy.button}
        </Button>
      </form>
    </section>
  )
}
