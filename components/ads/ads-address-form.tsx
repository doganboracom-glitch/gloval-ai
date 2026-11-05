'use client'

import { useState, type FormEvent } from 'react'
import { ArrowRight, Globe, Loader2 } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { AdsScanError } from '@/components/ads/ads-scan-error'
import { AdsManualPlanForm } from '@/components/ads/ads-manual-plan-form'
import { AdsScanResult } from '@/components/ads/ads-scan-result'
import { useAdsScan } from '@/components/ads/use-ads-scan'
import { MAX_SITE_ADDRESS_LENGTH, normalizeSiteAddress } from '@/lib/ads/normalize-site-address'
import { describeScanError } from '@/lib/ads/scan-messages'
import type { ManualPlanInput } from '@/lib/ads/manual-plan'
import type { ScanStage } from '@/lib/ads/scan-client'

const STAGE_KEY = {
  reading: 'scanStageReading',
  planning: 'scanStagePlanning',
  writing: 'scanStageWriting',
  slow: 'scanStageSlow',
} as const satisfies Record<ScanStage, string>

type AddressValidationError = 'required' | 'invalid'

export function AdsAddressForm() {
  const { t } = useLanguage()
  const copy = t.ads
  const { state, start, reset } = useAdsScan()
  const [value, setValue] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [validationError, setValidationError] = useState<AddressValidationError | null>(null)
  const [manualFallbackAvailable, setManualFallbackAvailable] = useState(false)
  const busy = state.phase === 'busy'
  const showGuidance = value.length === 0 && !isFocused
  const errorMessage = validationError === 'required' ? copy.addressRequired : copy.addressInvalid

  async function startSiteScan(address: string) {
    setManualFallbackAvailable(false)
    const outcome = await start(address)
    if (
      outcome &&
      !outcome.ok &&
      (outcome.error.code === 'site_blocked' || outcome.error.code === 'site_unresponsive')
    ) {
      setManualFallbackAvailable(true)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const result = normalizeSiteAddress(value)
    if (!result.ok) {
      setValidationError(result.reason === 'empty' ? 'required' : 'invalid')
      return
    }
    setValidationError(null)
    setValue(result.host)
    void startSiteScan(result.host)
  }

  function submitManual(input: ManualPlanInput) {
    if (busy) return
    const result = normalizeSiteAddress(value)
    if (!result.ok) {
      setValidationError(result.reason === 'empty' ? 'required' : 'invalid')
      return
    }
    setValidationError(null)
    setValue(result.host)
    void start(result.host, input)
  }

  function handleErrorAction() {
    if (state.phase === 'error' && describeScanError(state.error, copy).action === 'retry') {
      const result = normalizeSiteAddress(value)
      if (result.ok) {
        setValidationError(null)
        setValue(result.host)
        void startSiteScan(result.host)
        return
      }
    }
    newScan()
  }

  function newScan() {
    reset()
    setValue('')
    setValidationError(null)
    setManualFallbackAvailable(false)
  }

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <form onSubmit={submit} noValidate aria-busy={busy} className="flex w-full max-w-[47.5rem] flex-col gap-3 text-left">
        <label htmlFor="ads-address" className="text-sm font-medium leading-6 text-foreground">
          {copy.addressLabel}
        </label>
        <div
          data-invalid={validationError !== null}
          className="flex w-full min-w-0 flex-col gap-2 rounded-3xl border border-border bg-card p-2 shadow-sm transition-[border-color,box-shadow] focus-within:border-brand/70 focus-within:ring-4 focus-within:ring-brand/20 data-[invalid=true]:border-destructive/70 sm:flex-row"
        >
          <div className="flex min-h-16 min-w-0 flex-1 items-center gap-4 px-3">
            <Globe aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            <div className="relative flex min-h-16 min-w-0 flex-1 items-center">
              {showGuidance ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-0 flex min-w-0 items-center text-lg leading-6 text-muted-foreground"
                >
                  <span className="ads-address-guidance-motion whitespace-nowrap">
                    {copy.addressGuidance}
                  </span>
                </span>
              ) : null}
              <input
                id="ads-address"
                name="address"
                type="text"
                inputMode="url"
                autoComplete="url"
                autoCapitalize="none"
                spellCheck={false}
                required
                maxLength={MAX_SITE_ADDRESS_LENGTH}
                value={value}
                disabled={busy}
                onChange={(event) => {
                  setValue(event.target.value)
                  if (validationError) setValidationError(null)
                }}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder=""
                aria-label={copy.addressLabel}
                aria-invalid={validationError !== null}
                aria-describedby={
                  validationError ? 'ads-address-error ads-address-hint' : 'ads-address-hint'
                }
                className="ads-address-input theme-aware-autofill h-16 w-full min-w-0 flex-1 bg-transparent p-0 text-lg leading-6 text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-14 w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-brand px-5 text-base font-medium text-brand-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-6"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <ArrowRight className="size-4" aria-hidden="true" />
            )}
            {copy.addressSubmit}
          </button>
        </div>

        {validationError ? (
          <p id="ads-address-error" role="alert" className="text-sm leading-relaxed text-destructive">
            {errorMessage}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <p id="ads-address-examples-label" className="text-sm text-muted-foreground">
            {copy.addressExamplesLabel}
          </p>
          <div role="group" aria-labelledby="ads-address-examples-label" className="flex flex-wrap gap-2">
            {copy.addressExamples.map((example) => (
              <button
                key={example}
                type="button"
                disabled={busy}
                onClick={() => {
                  setValue(example)
                  setValidationError(null)
                }}
                className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-brand/50 hover:bg-brand/5 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <p id="ads-address-hint" className="text-sm leading-relaxed text-muted-foreground">
            {copy.addressHint}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">{copy.scanQuotaNote}</p>
        </div>
      </form>

      <div aria-live="polite" className="flex w-full max-w-3xl flex-col items-center">
        {state.phase === 'busy' ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {copy[STAGE_KEY[state.stage]]}
          </p>
        ) : null}
        {state.phase === 'error' ? <AdsScanError error={state.error} onAction={handleErrorAction} /> : null}
        {state.phase === 'done' ? <AdsScanResult result={state.result} onNewScan={newScan} /> : null}
      </div>

      {manualFallbackAvailable && state.phase !== 'done' ? (
        <AdsManualPlanForm disabled={busy} onSubmit={submitManual} />
      ) : null}
    </div>
  )
}
