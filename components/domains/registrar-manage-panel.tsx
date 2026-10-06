'use client'

import { useState, useTransition } from 'react'
import useSWR from 'swr'
import { Loader2, Settings2 } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Button } from '@/components/ui/button'
import { fill } from '@/components/domains/domain-chrome'
import { RenewalCard } from '@/components/domains/renewal-card'
import {
  loadManagedDomainAction,
  setPrivacyAction,
  updateContactAction,
} from '@/lib/custom-domains/registrar/manage-actions'
import type { DomainContact } from '@/lib/custom-domains/registrar/types'
import type { DomainErrorCode } from '@/lib/custom-domains/types'

const EMPTY_CONTACT: DomainContact = {
  firstName: '',
  lastName: '',
  company: '',
  email: '',
  addressLine1: '',
  city: '',
  state: '',
  country: '',
  zipCode: '',
  phoneCountryCode: '',
  phone: '',
}

type Notice = { kind: 'ok' | 'error'; text: string }

/**
 * Registrar-side settings for a domain bought through Gloval. Everything shown
 * is read live from the registrar; every change is re-read and verified by the
 * server before it reports success. Renewal, auto-renew and DNS records are
 * stated honestly as unavailable rather than faked.
 */
export function RegistrarManagePanel({ domain }: { domain: string }) {
  const { t, lang } = useLanguage()
  const d = t.domains
  const locale = lang === 'tr' ? 'tr-TR' : 'en-US'
  const { data, isLoading, mutate } = useSWR(['registrar-manage', domain], () => loadManagedDomainAction(domain), {
    revalidateOnFocus: false,
  })
  const [isPending, startTransition] = useTransition()
  const [notice, setNotice] = useState<Notice | null>(null)

  const errorText = (code: DomainErrorCode): string => {
    switch (code) {
      case 'INVALID_INPUT':
        return d.errInvalidInput
      case 'PROVIDER_REFUSED':
        return d.errProviderRefused
      case 'OUTCOME_UNKNOWN':
        return d.errOutcomeUnknown
      case 'FEATURE_UNSUPPORTED':
        return d.errFeatureUnsupported
      case 'REGISTRAR_UNAVAILABLE':
        return d.errRegistrarUnavailable
      case 'NOT_REGISTRAR_MANAGED':
        return d.errNotRegistrarManaged
      default:
        return d.errGeneric
    }
  }

  function run(action: () => Promise<{ ok: true; changed: boolean } | { ok: false; error: DomainErrorCode }>) {
    setNotice(null)
    startTransition(async () => {
      const res = await action()
      if (res.ok) {
        setNotice({ kind: 'ok', text: res.changed ? d.mgSaved : d.mgNoChange })
      } else {
        setNotice({ kind: 'error', text: errorText(res.error) })
      }
      await mutate()
    })
  }

  if (isLoading) {
    return (
      <section className="mt-6 rounded-2xl border border-border bg-card p-5" aria-busy="true">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </section>
    )
  }

  // Not a registrar-managed domain (or no access): this panel simply does not apply.
  if (!data || (!data.ok && (data.error === 'NOT_REGISTRAR_MANAGED' || data.error === 'NOT_FOUND'))) return null

  if (!data.ok) {
    return (
      <section className="mt-6 rounded-2xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <Settings2 className="size-4 text-primary" />
          {d.mgTitle}
        </h2>
        <p role="alert" className="mt-3 text-sm text-destructive">
          {data.error === 'REGISTRAR_UNAVAILABLE' ? d.errRegistrarUnavailable : d.mgLoadFailed}
        </p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => mutate()}>
          {d.mgRetry}
        </Button>
      </section>
    )
  }

  const { details, contacts, contactsUnavailable } = data
  const state = (v: boolean | null) => (v === null ? d.mgUnknown : v ? d.mgOn : d.mgOff)
  const expiry = details.expiresAt
    ? new Date(details.expiresAt).toLocaleDateString(locale)
    : (details.expiresAtRaw ?? d.mgUnknown)

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold">
        <Settings2 className="size-4 text-primary" />
        {d.mgTitle}
      </h2>
      <p className="mt-2 text-pretty text-sm text-muted-foreground">{d.mgIntro}</p>

      {notice && (
        <p
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={`mt-3 text-sm ${notice.kind === 'error' ? 'text-destructive' : 'text-accent'}`}
        >
          {notice.text}
        </p>
      )}

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <Fact label={d.mgStatus} value={details.status} />
        <Fact
          label={d.mgExpires}
          value={
            details.remainingDays !== null
              ? `${expiry} (${fill(d.mgRemainingDays, { days: details.remainingDays })})`
              : expiry
          }
        />
        <Fact label={d.mgLock} value={state(details.locked)} hint={d.mgLockUnsupported} />
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-background/60 p-3">
          <dt className="text-xs text-muted-foreground">{d.mgPrivacy}</dt>
          <dd className="flex items-center justify-between gap-2 text-sm font-medium">
            {state(details.privacy)}
            {details.privacy !== null && (
              <Button
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => run(() => setPrivacyAction(domain, !details.privacy))}
              >
                {details.privacy ? d.mgPrivacyDisable : d.mgPrivacyEnable}
              </Button>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-6">
        <h3 className="text-sm font-medium">{d.mgNs}</h3>
        {details.nameservers.length > 0 && (
          <ul className="mt-1.5 flex flex-col gap-1 rounded-lg border border-border bg-background/60 px-3 py-2 font-mono text-sm">
            {details.nameservers.map((ns) => (
              <li key={ns}>{ns}</li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-pretty text-xs text-muted-foreground">{d.mgNsUnsupported}</p>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-medium">{d.mgContacts}</h3>
        {contactsUnavailable || !contacts ? (
          <p className="mt-2 text-sm text-muted-foreground">{d.mgContactsUnavailable}</p>
        ) : (
          <ContactForm
            key={JSON.stringify(contacts.registrant)}
            initial={contacts.registrant ?? EMPTY_CONTACT}
            disabled={isPending}
            pending={isPending}
            onSave={(c) => run(() => updateContactAction(domain, c))}
          />
        )}
      </div>

      <RenewalCard domain={domain} errorText={errorText} />

      <div className="mt-6 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
        <Unavailable title={d.mgAutoTitle} body={d.mgAutoBody} />
        <Unavailable title={d.mgDnsTitle} body={d.mgDnsBody} />
      </div>
    </section>
  )
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Unavailable({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="mt-1 text-pretty text-xs text-muted-foreground">{body}</p>
    </div>
  )
}

function ContactForm({
  initial,
  disabled,
  pending,
  onSave,
}: {
  initial: DomainContact
  disabled: boolean
  pending: boolean
  onSave: (c: DomainContact) => void
}) {
  const { t } = useLanguage()
  const d = t.domains
  const [c, setC] = useState<DomainContact>(initial)
  const dirty = JSON.stringify(c) !== JSON.stringify(initial)

  const fields: Array<{ key: keyof DomainContact; label: string; type?: string; wide?: boolean }> = [
    { key: 'firstName', label: d.mgFirstName },
    { key: 'lastName', label: d.mgLastName },
    { key: 'company', label: d.mgCompany },
    { key: 'email', label: d.mgEmail, type: 'email' },
    { key: 'addressLine1', label: d.mgAddress, wide: true },
    { key: 'city', label: d.mgCity },
    { key: 'state', label: d.mgState },
    { key: 'country', label: d.mgCountry },
    { key: 'zipCode', label: d.mgZip },
    { key: 'phoneCountryCode', label: d.mgPhoneCc },
    { key: 'phone', label: d.mgPhone, type: 'tel' },
  ]

  return (
    <form
      className="mt-2"
      onSubmit={(e) => {
        e.preventDefault()
        onSave({ ...c, country: c.country.trim().toUpperCase() })
      }}
    >
      <p className="text-xs text-muted-foreground">{d.mgContactsHelp}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key} className={f.wide ? 'sm:col-span-2' : undefined}>
            <label htmlFor={`mg-${f.key}`} className="text-xs text-muted-foreground">
              {f.label}
            </label>
            <input
              id={`mg-${f.key}`}
              type={f.type ?? 'text'}
              value={c[f.key]}
              disabled={disabled}
              onChange={(e) => setC((prev) => ({ ...prev, [f.key]: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-60"
            />
          </div>
        ))}
      </div>
      <Button type="submit" size="sm" className="mt-3" disabled={disabled || !dirty}>
        {pending && <Loader2 className="size-3.5 animate-spin" />}
        {d.mgContactSave}
      </Button>
    </form>
  )
}
