'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, ChevronLeft, Loader2, Search, ShoppingCart, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Button } from '@/components/ui/button'
import { fill } from '@/components/domains/domain-chrome'
import {
  searchMyDomainAvailability,
  startMyDomainPurchase,
  type PurchaseErrorCode,
} from '@/lib/custom-domains/registrar/actions'
import type { PricedDomainResult } from '@/lib/custom-domains/pricing/calc'
import type { RegistrantContact } from '@/lib/custom-domains/registrar/types'
import type { Dict } from '@/lib/i18n'

/**
 * "Buy a new domain" flow: search -> pick a result -> registrant details ->
 * platform checkout. Separate from `AddDomainDialog` in `domains-client.tsx`,
 * which connects a domain the customer already owns elsewhere — this one
 * registers a brand-new domain through the registrar and money changes
 * hands, so it has its own step machine and its own price display.
 */

type Step =
  | { name: 'search' }
  | { name: 'contact'; result: PricedDomainResult }
  | { name: 'success'; domain: string }

const PERIOD_OPTIONS = [1, 2, 3, 5]

function formatPrice(cents: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`
  }
}

export function BuyDomainDialog({ onClose }: { onClose: () => void }) {
  const { t, lang } = useLanguage()
  const router = useRouter()
  const d = t.domains
  const locale = lang === 'tr' ? 'tr-TR' : 'en-US'

  const [step, setStep] = useState<Step>({ name: 'search' })
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PricedDomainResult[] | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [purchaseError, setPurchaseError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSearch(event: React.FormEvent) {
    event.preventDefault()
    if (!query.trim() || isPending) return
    setSearchError(null)
    startTransition(async () => {
      const res = await searchMyDomainAvailability(query)
      if (!res.ok) {
        setResults(null)
        setSearchError(
          res.error === 'NOT_CONFIGURED'
            ? d.buyNotConfigured
            : res.error === 'INVALID_QUERY'
              ? d.buyErrInvalidQuery
              : d.buyErrProviderError,
        )
        return
      }
      setResults(res.results)
      if (!res.pricingAvailable) setSearchError(d.buyPricingUnavailable)
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
            <ShoppingCart className="size-5 text-primary" />
            {step.name === 'success' ? d.buySuccessTitle : d.buyTitle}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label={d.buyClose}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 min-h-0 overflow-y-auto">
          {step.name === 'search' && (
            <>
              <form onSubmit={handleSearch} className="flex gap-2">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={d.buySearchPlaceholder}
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none transition-colors focus:border-primary"
                />
                <Button type="submit" disabled={isPending || !query.trim()} className="shrink-0 gap-2">
                  {isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                  {d.buySearchSubmit}
                </Button>
              </form>

              {searchError && (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  {searchError}
                </p>
              )}

              {results && (
                <ul className="mt-4 flex flex-col gap-2">
                  {results.map((result) => (
                    <li
                      key={result.domain}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/60 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-mono text-sm font-medium">{result.domain}</p>
                        <p
                          className={
                            result.status === 'available'
                              ? 'text-xs text-emerald-500'
                              : result.status === 'unavailable'
                                ? 'text-xs text-destructive'
                                : 'text-xs text-muted-foreground'
                          }
                        >
                          {result.status === 'available'
                            ? d.buyAvailable
                            : result.status === 'unavailable'
                              ? d.buyUnavailable
                              : d.buyUnknown}
                          {result.status === 'available' && result.quote && (
                            <span className="text-foreground">
                              {' · '}
                              {formatPrice(result.quote.netMinor, 'TRY', locale)}
                              {d.buyPerYear} {d.buyVatExcluded}
                            </span>
                          )}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant={result.status === 'available' ? 'default' : 'outline'}
                        disabled={result.status !== 'available' || !result.quote}
                        onClick={() => setStep({ name: 'contact', result })}
                      >
                        {d.buySelect}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {step.name === 'contact' && (
            <ContactStep
              result={step.result}
              locale={locale}
              pending={isPending}
              error={purchaseError}
              onBack={() => {
                setPurchaseError(null)
                setStep({ name: 'search' })
              }}
              onSubmit={(periodYears, contact) => {
                setPurchaseError(null)
                startTransition(async () => {
                  const res = await startMyDomainPurchase(step.result.domain, periodYears, contact)
                  if (!res.ok) {
                    setPurchaseError(purchaseErrorText(res.error, d))
                    return
                  }
                  if (res.redirectUrl) {
                    window.location.href = res.redirectUrl
                    return
                  }
                  setStep({ name: 'success', domain: step.result.domain })
                })
              }}
            />
          )}

          {step.name === 'success' && (
            <div className="flex flex-col items-center py-6 text-center">
              <CheckCircle2 className="size-12 text-emerald-500" />
              <p className="mt-4 text-pretty text-sm text-muted-foreground">
                {fill(d.buySuccessBody, { domain: step.domain })}
              </p>
              <Button
                className="mt-6"
                onClick={() => {
                  onClose()
                  router.refresh()
                }}
              >
                {d.buyClose}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function purchaseErrorText(code: PurchaseErrorCode, d: Dict['domains']): string {
  return (
    {
      NOT_CONFIGURED: d.buyNotConfigured,
      INVALID_DOMAIN: d.buyErrInvalidDomain,
      UNAVAILABLE: d.buyErrUnavailable,
      ALREADY_OWNED: d.buyErrAlreadyOwned,
      LIMIT_REACHED: d.buyErrLimitReached,
      NOT_ENTITLED: d.buyErrNotEntitled,
      PRICING_UNAVAILABLE: d.buyPricingUnavailable,
      PAYMENT_UNAVAILABLE: d.buyErrPaymentUnavailable,
      FAILED: d.buyErrFailed,
    }[code] ?? d.buyErrFailed
  )
}

/* ------------------------------- contact step ------------------------------ */

const emptyContact: RegistrantContact = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  phoneCountryCode: '90',
  addressLine1: '',
  city: '',
  state: '',
  country: 'TR',
  zipCode: '',
  company: '',
}

function ContactStep({
  result,
  locale,
  pending,
  error,
  onBack,
  onSubmit,
}: {
  result: PricedDomainResult
  locale: string
  pending: boolean
  error: string | null
  onBack: () => void
  onSubmit: (periodYears: number, contact: RegistrantContact) => void
}) {
  const { t } = useLanguage()
  const d = t.domains
  const [periodYears, setPeriodYears] = useState(1)
  const [contact, setContact] = useState<RegistrantContact>(emptyContact)

  // Display only: the server recomputes and charges its own total.
  const price = result.quote
  const netTotal = price ? price.netMinor * periodYears : 0
  const vatTotal = price ? price.vatMinor * periodYears : 0
  const grossTotal = price ? price.grossMinor * periodYears : 0

  const isValid =
    contact.firstName.trim() &&
    contact.lastName.trim() &&
    contact.email.trim() &&
    contact.phone.trim() &&
    contact.addressLine1.trim() &&
    contact.city.trim() &&
    contact.state?.trim() &&
    contact.zipCode.trim() &&
    contact.country.trim()

  function update<K extends keyof RegistrantContact>(key: K, value: RegistrantContact[K]) {
    setContact((prev) => ({ ...prev, [key]: value }))
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!isValid || pending || !price) return
    onSubmit(periodYears, contact)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 self-start text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        {d.buyBack}
      </button>

      <div className="rounded-xl border border-border bg-background/60 px-4 py-3">
        <p className="font-mono text-sm font-medium">{result.domain}</p>
      </div>

      <div>
        <label htmlFor="buy-period" className="text-sm font-medium">
          {d.buyPeriodLabel}
        </label>
        <select
          id="buy-period"
          value={periodYears}
          onChange={(event) => setPeriodYears(Number(event.target.value))}
          className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary"
        >
          {PERIOD_OPTIONS.map((years) => (
            <option key={years} value={years}>
              {fill(d.buyPeriodYears, { count: years })}
            </option>
          ))}
        </select>
      </div>

      <div>
        <h4 className="text-sm font-medium">{d.buyContactTitle}</h4>
        <p className="mt-0.5 text-xs text-pretty text-muted-foreground">{d.buyContactDescription}</p>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label={d.buyFirstName} value={contact.firstName} onChange={(v) => update('firstName', v)} />
          <Field label={d.buyLastName} value={contact.lastName} onChange={(v) => update('lastName', v)} />
          <Field
            label={d.buyEmail}
            value={contact.email}
            onChange={(v) => update('email', v)}
            type="email"
            className="col-span-2"
          />
          <Field label={d.buyPhone} value={contact.phone} onChange={(v) => update('phone', v)} type="tel" />
          <Field label={d.buyCompany} value={contact.company ?? ''} onChange={(v) => update('company', v)} />
          <Field
            label={d.buyAddress}
            value={contact.addressLine1}
            onChange={(v) => update('addressLine1', v)}
            className="col-span-2"
          />
          <Field label={d.buyCity} value={contact.city} onChange={(v) => update('city', v)} />
          <Field label={d.buyState} value={contact.state ?? ''} onChange={(v) => update('state', v)} />
          <Field label={d.buyZip} value={contact.zipCode} onChange={(v) => update('zipCode', v)} />
          <Field label={d.buyCountry} value={contact.country} onChange={(v) => update('country', v.toUpperCase())} />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-end justify-between gap-3 border-t border-border pt-4">
        <div>
          {price && (
            <p className="text-xs text-muted-foreground">
              {formatPrice(netTotal, 'TRY', locale)} + {d.buyVat} %{price.vatBps / 100}{' '}
              {formatPrice(vatTotal, 'TRY', locale)}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">{d.buyTotal}</p>
          <p className="font-display text-lg font-semibold">
            {price ? formatPrice(grossTotal, 'TRY', locale) : '—'}
          </p>
        </div>
        <Button type="submit" disabled={!isValid || pending} className="gap-2">
          {pending && <Loader2 className="size-4 animate-spin" />}
          {pending ? d.buyProcessing : d.buySubmit}
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  className,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  className?: string
}) {
  return (
    <label className={`text-xs font-medium text-muted-foreground ${className ?? ''}`}>
      {label}
      <input
        value={value}
        type={type}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary"
      />
    </label>
  )
}
