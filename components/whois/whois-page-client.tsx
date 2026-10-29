'use client'

import { useState, useTransition, type FormEvent } from 'react'
import Link from 'next/link'
import { ArrowLeft, Search } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { WhoisResult } from '@/components/whois/whois-result'
import { lookupWhois } from '@/lib/whois/actions'
import { MAX_WHOIS_INPUT_LENGTH } from '@/lib/whois/constants'
import type { WhoisOutcome } from '@/lib/whois/service'

export function WhoisPageClient({ initialQuery }: { initialQuery: string }) {
  const { t, lang } = useLanguage()
  const copy = t.whois
  const [query, setQuery] = useState(initialQuery)
  const [outcome, setOutcome] = useState<WhoisOutcome | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checkedAt, setCheckedAt] = useState(() => new Date())
  const [pending, startTransition] = useTransition()

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setError(null)
    startTransition(async () => {
      try {
        const res = await lookupWhois(query)
        if (res.ok) {
          setOutcome(res.outcome)
          setCheckedAt(new Date())
        } else {
          setOutcome(null)
          setError(
            res.error === 'INVALID_QUERY'
              ? copy.errorInvalid
              : res.error === 'RATE_LIMITED'
                ? copy.errorRate.replace('{seconds}', String(res.retryAfterSeconds))
                : copy.errorUnavailable,
          )
        }
      } catch {
        setOutcome(null)
        setError(copy.errorUnavailable)
      }
    })
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-16 sm:py-20">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t.nav.backHome}
        </Link>

        <header className="mt-8 max-w-3xl">
          <h1 className="text-balance font-display text-4xl font-bold tracking-tight sm:text-5xl">{copy.title}</h1>
          <p className="mt-4 max-w-xl text-pretty leading-relaxed text-muted-foreground">{copy.subtitle}</p>
        </header>

        <div className="mt-10 flex max-w-3xl flex-col gap-6">
          <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end" noValidate>
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="whois-input" className="text-sm font-medium">
                {copy.inputLabel}
              </label>
              <input
                id="whois-input"
                name="domain"
                type="text"
                inputMode="url"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={MAX_WHOIS_INPUT_LENGTH}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={copy.placeholder}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'whois-error' : undefined}
                className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30"
              />
            </div>
            <button
              type="submit"
              disabled={pending || query.trim().length === 0}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Search className="size-4" aria-hidden="true" />
              {pending ? copy.loading : copy.submit}
            </button>
          </form>

          {error && (
            <p id="whois-error" role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          {outcome && <WhoisResult outcome={outcome} copy={copy} locale={lang} now={checkedAt} />}

          <aside className="rounded-xl border border-border p-5">
            <h2 className="text-sm font-semibold">{copy.privacyTitle}</h2>
            <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">{copy.privacyNote}</p>
            <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">{copy.usageNote}</p>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
