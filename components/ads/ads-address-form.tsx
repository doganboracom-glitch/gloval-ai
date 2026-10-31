'use client'

import { useState, type FormEvent } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { AdsScanError } from '@/components/ads/ads-scan-error'
import { AdsScanResult } from '@/components/ads/ads-scan-result'
import { useAdsScan } from '@/components/ads/use-ads-scan'
import { MAX_SITE_ADDRESS_LENGTH, normalizeSiteAddress } from '@/lib/ads/normalize-site-address'
import type { ScanStage } from '@/lib/ads/scan-client'

const STAGE_KEY = {
  reading: 'scanStageReading',
  planning: 'scanStagePlanning',
  writing: 'scanStageWriting',
  slow: 'scanStageSlow',
} as const satisfies Record<ScanStage, string>

export function AdsAddressForm() {
  const { t } = useLanguage()
  const copy = t.ads
  const { state, start, reset } = useAdsScan()
  const [value, setValue] = useState('')
  const [invalid, setInvalid] = useState(false)
  const busy = state.phase === 'busy'

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const result = normalizeSiteAddress(value)
    if (!result.ok) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    void start(result.host)
  }

  function newScan() {
    reset()
    setValue('')
  }

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <form onSubmit={submit} noValidate aria-busy={busy} className="w-full max-w-xl">
        <label htmlFor="ads-address" className="sr-only">
          {copy.addressLabel}
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="ads-address"
            name="address"
            type="text"
            inputMode="url"
            autoComplete="url"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={MAX_SITE_ADDRESS_LENGTH}
            value={value}
            disabled={busy}
            onChange={(event) => {
              setValue(event.target.value)
              if (invalid) setInvalid(false)
            }}
            placeholder={copy.addressPlaceholder}
            aria-invalid={invalid}
            aria-describedby="ads-address-hint"
            className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-card px-4 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60 aria-[invalid=true]:border-destructive"
          />
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-6 text-base font-medium text-brand-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <ArrowRight className="size-4" aria-hidden="true" />
            )}
            {copy.addressSubmit}
          </button>
        </div>
        <p
          id="ads-address-hint"
          role={invalid ? 'alert' : undefined}
          className={invalid ? 'mt-3 text-sm text-destructive' : 'mt-3 text-sm text-muted-foreground'}
        >
          {invalid ? copy.addressInvalid : copy.addressHint}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{copy.scanQuotaNote}</p>
      </form>

      <div aria-live="polite" className="flex w-full max-w-3xl flex-col items-center">
        {state.phase === 'busy' ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {copy[STAGE_KEY[state.stage]]}
          </p>
        ) : null}
        {state.phase === 'error' ? <AdsScanError error={state.error} onAction={newScan} /> : null}
        {state.phase === 'done' ? <AdsScanResult result={state.result} onNewScan={newScan} /> : null}
      </div>
    </div>
  )
}
