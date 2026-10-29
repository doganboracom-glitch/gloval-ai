'use client'

import { useEffect, useMemo, useState } from 'react'
import { Gauge, Search } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Button } from '@/components/ui/button'
import { fill } from '@/components/domains/domain-chrome'
import { QualityScoreGauge } from '@/components/domains/quality-score-gauge'
import { MAX_INPUT_LENGTH, scoreDomainQuality, type CriterionLevel } from '@/lib/domains/quality-score'
import {
  bandText,
  BAND_TEXT_CLASS,
  criterionText,
  noteText,
  tipText,
  toSearchQuery,
} from '@/lib/domains/quality-score-copy'

export type ScoreSeed = { domain: string; nonce: number }

const LEVEL_BAR: Record<CriterionLevel, string> = {
  good: 'bg-emerald-500',
  ok: 'bg-amber-500',
  weak: 'bg-destructive',
}

export function DomainQualityScore({
  seed,
  onSearch,
}: {
  seed: ScoreSeed | null
  onSearch: (query: string) => void
}) {
  const { t } = useLanguage()
  const copy = t.domainSearch
  const [input, setInput] = useState('')
  const [analyzed, setAnalyzed] = useState<string | null>(null)

  useEffect(() => {
    if (!seed) return
    setInput(seed.domain)
    setAnalyzed(seed.domain)
  }, [seed])

  const result = useMemo(() => (analyzed === null ? null : scoreDomainQuality(analyzed)), [analyzed])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setAnalyzed(input)
  }

  const failureText = {
    empty: copy.qsStateEmpty,
    too_short: copy.qsStateTooShort,
    too_long: copy.qsStateTooLong,
    invalid: copy.qsStateInvalid,
  }

  return (
    <section
      id="domain-quality-score"
      aria-labelledby="domain-quality-title"
      className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 sm:p-8"
    >
      <div className="flex items-start gap-3">
        <Gauge className="mt-1 size-6 shrink-0 text-brand" aria-hidden="true" />
        <div>
          <h2 id="domain-quality-title" className="font-display text-2xl font-semibold tracking-tight">
            {copy.qsTitle}
          </h2>
          <p className="mt-1 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">{copy.qsSubtitle}</p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-6 flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <label htmlFor="quality-score-input" className="sr-only">
            {copy.qsInputLabel}
          </label>
          <input
            id="quality-score-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={copy.qsPlaceholder}
            maxLength={MAX_INPUT_LENGTH + 20}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="h-11 w-full rounded-xl border border-border bg-background px-4 font-mono text-base outline-none transition-colors focus:border-brand"
          />
        </div>
        <Button type="submit" size="lg" className="h-11 px-6">
          {copy.qsAnalyze}
        </Button>
      </form>

      <div aria-live="polite" className="mt-6">
        {result === null && <p className="text-sm text-muted-foreground">{copy.qsStateEmpty}</p>}

        {result && !result.ok && (
          <p role="status" className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            {failureText[result.reason]}
          </p>
        )}

        {result?.ok && (
          <div className="flex flex-col gap-8">
            <div className="flex flex-col items-center gap-5 sm:flex-row">
              <QualityScoreGauge
                score={result.total}
                band={result.band}
                label={fill(copy.qsGaugeAria, { score: result.total })}
              />
              <div className="min-w-0 text-center sm:text-left">
                <p className="break-all font-mono text-lg font-semibold">{result.domain}</p>
                <p className={`mt-1 font-display text-xl font-semibold ${BAND_TEXT_CLASS[result.band]}`}>
                  {bandText(copy, result.band)}
                </p>
              </div>
            </div>

            <div>
              <h3 className="font-display text-base font-semibold">{copy.qsCriteriaTitle}</h3>
              <ul className="mt-3 flex flex-col gap-4">
                {result.criteria.map((criterion) => (
                  <li key={criterion.id}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium">{criterionText(copy, criterion.id)}</span>
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {criterion.score}/{criterion.max}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <div
                        className={`h-full rounded-full ${LEVEL_BAR[criterion.level]}`}
                        style={{ width: `${(criterion.score / criterion.max) * 100}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-pretty text-sm leading-relaxed text-muted-foreground">
                      {criterion.notes.map((code) => noteText(copy, code)).join(' ')}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-pretty text-xs leading-relaxed text-muted-foreground">
                {fill(copy.qsWordHint, { count: result.wordCountHint })}
                {result.maybeMultiWord ? ` ${copy.qsWordMaybe}` : ''}
              </p>
              <p className="mt-1 text-pretty text-xs leading-relaxed text-muted-foreground">{copy.qsHeuristicNote}</p>
            </div>

            <div>
              <h3 className="font-display text-base font-semibold">{copy.qsTipsTitle}</h3>
              <ul className="mt-3 flex flex-col gap-2">
                {result.tips.map((code) => (
                  <li key={code} className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                    {tipText(copy, code, result.asciiLabel)}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-3 rounded-xl bg-muted/50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-pretty text-sm leading-relaxed text-muted-foreground">{copy.qsDisclaimer}</p>
              <Button type="button" onClick={() => onSearch(toSearchQuery(result))} className="shrink-0 gap-2">
                <Search className="size-4" aria-hidden="true" />
                {copy.qsCheckAvailability}
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
