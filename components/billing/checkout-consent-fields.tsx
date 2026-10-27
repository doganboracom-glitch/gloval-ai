'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { legalPath } from '@/lib/legal/documents'
import type { CheckoutConsents } from '@/lib/checkout-consent'

const NONE: CheckoutConsents = { preInfo: false, distance: false, withdrawal: false }

export function useCheckoutConsents() {
  const [consents, setConsents] = useState<CheckoutConsents>(NONE)
  const [touched, setTouched] = useState(false)
  const allGiven = consents.preInfo && consents.distance && consents.withdrawal
  return {
    consents,
    touched,
    allGiven,
    setConsent: (key: keyof CheckoutConsents, value: boolean) =>
      setConsents((prev) => ({ ...prev, [key]: value })),
    markTouched: () => setTouched(true),
    reset: () => {
      setConsents(NONE)
      setTouched(false)
    },
  }
}

export function CheckoutConsentFields({
  consents,
  touched,
  onChange,
}: {
  consents: CheckoutConsents
  touched: boolean
  onChange: (key: keyof CheckoutConsents, value: boolean) => void
}) {
  const { t } = useLanguage()
  const c = t.billing.checkout
  const allGiven = consents.preInfo && consents.distance && consents.withdrawal

  return (
    <div>
      <h4 className="text-sm font-semibold text-foreground">{c.legalTitle}</h4>
      <div className="mt-3 flex flex-col gap-3">
        <Row
          checked={consents.preInfo}
          onChange={(v) => onChange('preInfo', v)}
          label={c.consentPreInfo}
          href={legalPath('on-bilgilendirme-formu')}
          linkLabel={c.viewContract}
          invalid={touched && !consents.preInfo}
        />
        <Row
          checked={consents.distance}
          onChange={(v) => onChange('distance', v)}
          label={c.consentDistance}
          href={legalPath('mesafeli-satis-sozlesmesi')}
          linkLabel={c.viewContract}
          invalid={touched && !consents.distance}
        />
        <Row
          checked={consents.withdrawal}
          onChange={(v) => onChange('withdrawal', v)}
          label={c.consentWithdrawal}
          invalid={touched && !consents.withdrawal}
        />
      </div>
      {touched && !allGiven && <p className="mt-2 text-xs text-destructive">{c.required}</p>}
    </div>
  )
}

function Row({
  checked,
  onChange,
  label,
  href,
  linkLabel,
  invalid,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  href?: string
  linkLabel?: string
  invalid: boolean
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors hover:border-primary/50 ${
        invalid ? 'border-destructive ring-1 ring-destructive/40' : 'border-border'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
      />
      <span className="min-w-0 flex-1 text-pretty text-foreground">
        {label}
        {href && linkLabel && (
          <>
            {' '}
            <Link
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 font-medium text-brand underline underline-offset-2"
            >
              {linkLabel}
              <ExternalLink className="size-3" />
            </Link>
          </>
        )}
      </span>
    </label>
  )
}
