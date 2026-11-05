'use client'

import { useId, useState, useTransition } from 'react'
import useSWR from 'swr'
import { ChevronDown, Loader2, Pencil, Settings2 } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Button } from '@/components/ui/button'
import { DomainModal, fill } from '@/components/domains/domain-chrome'
import { RenewalCard } from '@/components/domains/renewal-card'
import {
  loadManagedDomainAction,
  setPrivacyAction,
  updateContactAction,
  updateNameserversAction,
} from '@/lib/custom-domains/registrar/manage-actions'
import { REGISTRAR_PUBLIC_CAPABILITIES } from '@/lib/custom-domains/registrar/capabilities-public'
import { isActiveAndUnexpired } from '@/lib/custom-domains/registrar/nameserver-access'
import { NameserverEditor } from '@/components/domains/nameserver-editor'
import type { DomainContact } from '@/lib/custom-domains/registrar/types'
import type { DomainErrorCode } from '@/lib/custom-domains/types'
import { cn } from '@/lib/utils'

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
type RegistrarMutationResult =
  | { ok: true; changed: boolean }
  | { ok: false; error: DomainErrorCode }
  | { ok: false; reason: 'auth_unavailable' }

/**
 * Registrar-side settings for a domain managed through GLOVAL. Registrar data
 * is read live, and state-changing operations are verified server-side before
 * success is reported.
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
  const [nameserverEditing, setNameserverEditing] = useState(false)
  const [confirmNameservers, setConfirmNameservers] = useState<string[] | null>(null)
  const [nameserversJustSaved, setNameserversJustSaved] = useState(false)
  const [contactsExpanded, setContactsExpanded] = useState(false)
  const contactsContentId = useId()
  const nameserverConfirmTitleId = useId()

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
      case 'RATE_LIMITED':
        return d.pageRateLimited
      case 'REGISTRAR_UNAVAILABLE':
        return d.errRegistrarUnavailable
      case 'NOT_REGISTRAR_MANAGED':
        return d.errNotRegistrarManaged
      default:
        return d.errGeneric
    }
  }

  function run(action: () => Promise<RegistrarMutationResult>) {
    setNotice(null)
    startTransition(async () => {
      const res = await action()
      if (res.ok) {
        setNotice({ kind: 'ok', text: res.changed ? d.mgSaved : d.mgNoChange })
      } else if ('reason' in res) {
        setNotice({ kind: 'error', text: d.mgLoadFailed })
      } else {
        setNotice({ kind: 'error', text: errorText(res.error) })
      }
      await mutate()
    })
  }

  function requestNameserverChange(nameservers: string[]) {
    setNotice(null)
    setConfirmNameservers(nameservers)
  }

  function confirmNameserverChange() {
    if (!confirmNameservers) return
    const requestedNameservers = confirmNameservers
    setNotice(null)
    startTransition(async () => {
      try {
        const result = await updateNameserversAction(domain, requestedNameservers)
        if (result.ok) {
          setNotice({ kind: 'ok', text: result.changed ? d.mgSaved : d.mgNoChange })
          setNameserverEditing(false)
          setNameserversJustSaved(result.changed)
        } else if ('reason' in result) {
          setNotice({ kind: 'error', text: d.mgLoadFailed })
        } else {
          setNotice({ kind: 'error', text: errorText(result.error) })
        }
      } catch {
        setNotice({ kind: 'error', text: d.errGeneric })
      } finally {
        setConfirmNameservers(null)
        try {
          await mutate()
        } catch {
          setNotice({ kind: 'error', text: d.mgLoadFailed })
        }
      }
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
  if (!data || (!data.ok && 'error' in data && (data.error === 'NOT_REGISTRAR_MANAGED' || data.error === 'NOT_FOUND'))) return null

  if (!data.ok) {
    return (
      <section className="mt-6 rounded-2xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <Settings2 className="size-4 text-primary" />
          {d.mgTitle}
        </h2>
        <p role="alert" className="mt-3 text-sm text-destructive">
          {'reason' in data ? d.mgLoadFailed : data.error === 'REGISTRAR_UNAVAILABLE' ? d.errRegistrarUnavailable : d.mgLoadFailed}
        </p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => mutate()}>
          {d.mgRetry}
        </Button>
      </section>
    )
  }

  const { details, contacts, contactsUnavailable } = data
  const canEditNameservers =
    REGISTRAR_PUBLIC_CAPABILITIES.nameserverChange && isActiveAndUnexpired(details)
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
        <Fact label={d.mgLock} value={state(details.locked)} />
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-medium">{d.mgNs}</h3>
          {canEditNameservers && !nameserverEditing && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => {
                setNameserverEditing(true)
                setNameserversJustSaved(false)
                setNotice(null)
              }}
            >
              <Pencil data-icon="inline-start" />
              {d.mgNsEdit}
            </Button>
          )}
        </div>
        {nameserversJustSaved && !nameserverEditing && (
          <p className="mt-2 text-xs text-muted-foreground">{d.mgNsReadback}</p>
        )}
        {details.nameservers.length > 0 && (
          <ul className="mt-1.5 flex flex-col gap-1 rounded-lg border border-border bg-background/60 px-3 py-2 font-mono text-sm">
            {details.nameservers.map((nameserver) => (
              <li key={nameserver}>{nameserver}</li>
            ))}
          </ul>
        )}
        {!REGISTRAR_PUBLIC_CAPABILITIES.nameserverChange ? (
          <p className="mt-2 text-pretty text-xs text-muted-foreground">{d.mgNsUnsupported}</p>
        ) : !canEditNameservers ? (
          <p className="mt-2 text-pretty text-xs text-muted-foreground">{d.mgNsNeedsActive}</p>
        ) : nameserverEditing ? (
          <NameserverEditor
            current={details.nameservers}
            disabled={isPending}
            onCancel={() => setNameserverEditing(false)}
            onSubmit={requestNameserverChange}
          />
        ) : null}
      </div>

      <div className="mt-6">
        <h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-between px-0"
            aria-expanded={contactsExpanded}
            aria-controls={contactsContentId}
            onClick={() => setContactsExpanded((expanded) => !expanded)}
          >
            <span>{d.mgContacts}</span>
            <ChevronDown
              data-icon="inline-end"
              aria-hidden="true"
              className={cn('transition-transform', contactsExpanded && 'rotate-180')}
            />
          </Button>
        </h3>
        <div id={contactsContentId} hidden={!contactsExpanded}>
          {contactsUnavailable || !contacts ? (
            <p className="mt-2 text-sm text-muted-foreground">{d.mgContactsUnavailable}</p>
          ) : (
            <ContactForm
              key={JSON.stringify(contacts.registrant)}
              initial={contacts.registrant ?? EMPTY_CONTACT}
              disabled={isPending}
              pending={isPending}
              onSave={(contact) => run(() => updateContactAction(domain, contact))}
            />
          )}
        </div>
      </div>

      <RenewalCard domain={domain} errorText={errorText} />

      {confirmNameservers && (
        <DomainModal
          ariaLabelledBy={nameserverConfirmTitleId}
          onClose={() => {
            if (!isPending) setConfirmNameservers(null)
          }}
        >
          <h2 id={nameserverConfirmTitleId} className="font-display text-lg font-semibold">
            {d.mgNs}
          </h2>
          <p className="mt-2 text-pretty text-sm text-muted-foreground">{d.mgNsConfirmWarn}</p>
          <p className="mt-1 text-pretty text-sm text-muted-foreground">{d.mgNsWarn}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <h3 className="text-xs text-muted-foreground">{d.mgNsOldList}</h3>
              <ul className="mt-1 flex flex-col gap-1 rounded-lg border border-border bg-background/60 px-3 py-2 font-mono text-sm">
                {details.nameservers.map((nameserver) => (
                  <li key={nameserver} className="break-all">
                    {nameserver}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-xs text-muted-foreground">{d.mgNsNewList}</h3>
              <ul className="mt-1 flex flex-col gap-1 rounded-lg border border-border bg-background/60 px-3 py-2 font-mono text-sm">
                {confirmNameservers.map((nameserver) => (
                  <li key={nameserver} className="break-all">
                    {nameserver}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setConfirmNameservers(null)}
            >
              {d.cancel}
            </Button>
            <Button type="button" disabled={isPending} onClick={confirmNameserverChange}>
              {isPending && <Loader2 data-icon="inline-start" className="animate-spin" />}
              {d.mgNsConfirm}
            </Button>
          </div>
        </DomainModal>
      )}
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
