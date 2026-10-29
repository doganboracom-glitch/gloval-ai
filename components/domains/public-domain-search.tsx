'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { Loader2, Search } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Button, buttonVariants } from '@/components/ui/button'
import { fill } from '@/components/domains/domain-chrome'
import { DomainResultCard } from '@/components/domains/domain-result-card'
import { DomainTldChips } from '@/components/domains/domain-tld-chips'
import { QualityScoreBadge } from '@/components/domains/quality-score-badge'
import { PUBLIC_SEARCH_TLDS, type PublicSearchTld } from '@/lib/custom-domains/public-search/validate'
import { searchDomainsPublic } from '@/lib/custom-domains/public-search/actions'
import { buildBuyHref } from '@/lib/custom-domains/public-search/buy-link'
import type { PublicSearchErrorCode, PublicSearchResponse } from '@/lib/custom-domains/public-search/service'
import type { PricedDomainResult } from '@/lib/custom-domains/pricing/calc'
import type { Dict } from '@/lib/i18n'

type Outcome = { query: string; results: PricedDomainResult[]; pricingAvailable: boolean }

function errorText(
  error: PublicSearchErrorCode,
  copy: Dict['domainSearch'],
  retryAfterSeconds?: number,
): string {
  switch (error) {
    case 'INVALID_QUERY':
      return copy.errInvalid
    case 'UNSUPPORTED_TLD':
      return copy.errUnsupported
    case 'RATE_LIMITED':
      return fill(copy.errRate, { seconds: retryAfterSeconds ?? 60 })
    case 'TEMPORARILY_UNAVAILABLE':
      return copy.errUnavailable
    default:
      return copy.errProvider
  }
}

export type SearchRequest = { query: string; nonce: number }

export function PublicDomainSearch({
  authenticated,
  initialQuery,
  request,
  onOpenScore,
  demo = false,
}: {
  /** Preview-only fake results: buying is replaced by a disabled label. */
  demo?: boolean
  authenticated: boolean
  initialQuery: string
  /** Moves a query into the box and focuses it; it never submits. */
  request?: SearchRequest | null
  onOpenScore?: (domain: string) => void
}) {
  const { t, lang } = useLanguage()
  const copy = t.domainSearch
  const [query, setQuery] = useState(initialQuery)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedTlds, setSelectedTlds] = useState<readonly PublicSearchTld[]>(PUBLIC_SEARCH_TLDS)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!request) return
    setQuery(request.query)
    inputRef.current?.focus()
  }, [request])

  function toggleTld(tld: PublicSearchTld) {
    setSelectedTlds((current) => {
      if (!current.includes(tld)) return PUBLIC_SEARCH_TLDS.filter((item) => item === tld || current.includes(item))
      return current.length > 1 ? current.filter((item) => item !== tld) : current
    })
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const value = query.trim()
    if (!value || isPending) return
    setError(null)
    startTransition(async () => {
      let res: PublicSearchResponse
      try {
        res = await searchDomainsPublic(value)
      } catch {
        setOutcome(null)
        setError(copy.errProvider)
        return
      }
      if (!res.ok) {
        setOutcome(null)
        setError(errorText(res.error, copy, res.retryAfterSeconds))
        return
      }
      setOutcome({ query: value, results: res.results, pricingAvailable: res.pricingAvailable })
    })
  }

  // The chips narrow a brand-only search; an explicit "brand.ext" query is shown as typed.
  const explicitExtension = outcome?.query.includes('.') ?? false
  const visibleResults = (outcome?.results ?? []).filter(
    (r) => explicitExtension || (selectedTlds as readonly string[]).includes(r.tld),
  )
  const availableCount = visibleResults.filter((r) => r.status === 'available').length
  const firstTaken = visibleResults.find((r) => r.status === 'unavailable')

  return (
    <div>
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row" role="search">
        <div className="flex-1">
          <label htmlFor="domain-search-input" className="sr-only">
            {copy.inputLabel}
          </label>
          <input
            ref={inputRef}
            id="domain-search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.placeholder}
            maxLength={100}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-describedby="domain-search-hint"
            className="h-12 w-full rounded-xl border border-border bg-card px-4 font-mono text-base outline-none transition-colors focus:border-primary"
          />
        </div>
        <Button type="submit" size="lg" disabled={isPending || !query.trim()} className="h-12 gap-2 px-6">
          {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Search className="size-4" aria-hidden="true" />}
          {isPending ? copy.searching : copy.submit}
        </Button>
      </form>
      <p id="domain-search-hint" className="mt-3 text-pretty text-sm text-muted-foreground">
        {copy.hint}
      </p>
      <div className="mt-3">
        <DomainTldChips label={copy.extChipsLabel} selected={selectedTlds} onToggle={toggleTld} />
      </div>

      <div aria-live="polite" className="mt-8">
        {error && (
          <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {!error && !outcome && !isPending && (
          <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
            <p className="font-display text-base font-semibold">{copy.emptyTitle}</p>
            <p className="mx-auto mt-1 max-w-md text-pretty text-sm text-muted-foreground">{copy.emptyBody}</p>
          </div>
        )}

        {outcome && (
          <section aria-labelledby="domain-results-title">
            <h2 id="domain-results-title" className="font-display text-lg font-semibold">
              {fill(copy.resultsTitle, { query: outcome.query })}
            </h2>
            {!outcome.pricingAvailable && <p className="mt-2 text-sm text-muted-foreground">{copy.errPricing}</p>}
            <ul className="mt-4 flex flex-col gap-3">
              {visibleResults.map((result) => (
                <DomainResultCard
                  key={result.domain}
                  result={result}
                  locale={lang}
                  copy={copy}
                  badge={
                    onOpenScore ? <QualityScoreBadge domain={result.domain} copy={copy} onOpen={onOpenScore} /> : null
                  }
                  actions={
                    result.status === 'available' && result.quote && demo ? (
                      <span
                        aria-disabled="true"
                        className={`${buttonVariants({ size: 'sm', variant: 'outline' })} pointer-events-none opacity-60`}
                      >
                        {lang === 'tr' ? 'Demo: satın alma kapalı' : 'Demo: purchase disabled'}
                      </span>
                    ) : result.status === 'available' && result.quote ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={buildBuyHref(result.domain, authenticated, 'sign-up')}
                          className={buttonVariants({ size: 'sm' })}
                        >
                          {copy.buy}
                        </Link>
                        {!authenticated && (
                          <Link
                            href={buildBuyHref(result.domain, false, 'login')}
                            className={buttonVariants({ size: 'sm', variant: 'outline' })}
                          >
                            {copy.haveAccount}
                          </Link>
                        )}
                      </div>
                    ) : null
                  }
                />
              ))}
            </ul>
            {firstTaken && availableCount > 0 && (
              <div className="mt-6 rounded-xl bg-muted/50 p-4">
                <p className="font-display text-sm font-semibold">{copy.alternativesTitle}</p>
                <p className="mt-1 text-pretty text-sm text-muted-foreground">
                  {fill(copy.alternativesBody, { domain: firstTaken.domain })}
                </p>
              </div>
            )}
            {availableCount === 0 && <p className="mt-6 text-sm text-muted-foreground">{copy.noAlternatives}</p>}
          </section>
        )}
      </div>
    </div>
  )
}
