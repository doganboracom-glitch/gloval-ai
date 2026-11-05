'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { Loader2, Pencil, Sparkles } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { AdsScanError } from '@/components/ads/ads-scan-error'
import { useAdsScan } from '@/components/ads/use-ads-scan'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { PublicScanResult } from '@/lib/ads/scan-orchestrator'

type Props = {
  initialAddress: string | null
  /** True while the parent turns a finished scan into a plan. */
  applying: boolean
  disabledReason: string | null
  onResult: (result: PublicScanResult) => void
  onManual: (address: string) => void
}

/**
 * First step of the workspace: type the site address and let the scan build the
 * whole plan. The empty form is only reachable through "edit manually", or
 * offered as the way out when the scan fails.
 */
export function GoogleAdsAiPlanner({ initialAddress, applying, disabledReason, onResult, onManual }: Props) {
  const { lang } = useLanguage()
  const isTr = lang === 'tr'
  const [address, setAddress] = useState(initialAddress ?? '')
  const { state, start, reset } = useAdsScan()
  const busy = state.phase === 'busy' || applying

  useEffect(() => {
    if (state.phase !== 'done') return
    onResult(state.result)
    reset()
  }, [state, onResult, reset])

  function submit(event: FormEvent) {
    event.preventDefault()
    const value = address.trim()
    if (!value || busy || disabledReason) return
    void start(value)
  }

  return (
    <section
      aria-labelledby="google-ads-ai-planner-title"
      className="flex flex-col gap-4 rounded-2xl border border-brand/30 bg-card p-5"
    >
      <div className="flex flex-col gap-1">
        <h3 id="google-ads-ai-planner-title" className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="size-5 text-brand" aria-hidden="true" />
          {isTr ? 'AI ile kampanya planı oluştur' : 'Create a campaign plan with AI'}
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {isTr
            ? 'Site adresinizi yazın; marka, hizmetler, anahtar kelimeler, reklam metni ve bütçe önerisi sitenizden hazırlansın. Sonra hepsini düzenleyebilirsiniz.'
            : 'Enter your site address and the brand, services, keywords, ad copy and a budget suggestion are prepared from your site. You can edit everything afterwards.'}
        </p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <label htmlFor="google-ads-ai-address" className="sr-only">
            {isTr ? 'Site adresi' : 'Site address'}
          </label>
          <Input
            id="google-ads-ai-address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="ornek.com"
            inputMode="url"
            autoComplete="url"
            disabled={busy}
          />
        </div>
        <Button type="submit" disabled={busy || !address.trim() || disabledReason !== null}>
          {busy ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden="true" /> : <Sparkles data-icon="inline-start" aria-hidden="true" />}
          {busy ? (isTr ? 'Plan hazırlanıyor…' : 'Preparing plan…') : isTr ? 'Planı oluştur' : 'Create plan'}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => onManual(address.trim())}>
          <Pencil data-icon="inline-start" aria-hidden="true" />
          {isTr ? 'Elle düzenle' : 'Edit manually'}
        </Button>
      </form>
      <p className="text-xs leading-relaxed text-muted-foreground" aria-live="polite">
        {busy
          ? isTr ? 'Site okunuyor ve plan hazırlanıyor. Bu işlem bir dakikaya yakın sürebilir.' : 'Reading your site and preparing the plan. This can take up to a minute.'
          : disabledReason ??
            (isTr
              ? 'Tarama, /ads önizlemesindeki ücretsiz hak ve kredi kurallarıyla çalışır. Taslağı kaydetmek ayrıca kredi düşürmez.'
              : 'The scan follows the same free allowance and credit rules as the /ads preview. Saving a draft costs no extra credits.')}
      </p>
      {state.phase === 'error' ? (
        <div className="flex flex-col gap-3">
          <AdsScanError error={state.error} onAction={() => void start(address.trim())} />
          <div>
            <Button type="button" variant="secondary" onClick={() => onManual(address.trim())}>
              <Pencil data-icon="inline-start" aria-hidden="true" />
              {isTr ? 'Siteyi elle tanımla' : 'Describe the site manually'}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
