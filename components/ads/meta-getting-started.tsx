'use client'

import { useLanguage } from '@/components/language-provider'
import { ConnectForm } from '@/components/ads/meta-ads-settings'

export function MetaGettingStarted() {
  const { t } = useLanguage()
  const steps = [t.ads.metaStartStep1, t.ads.metaStartStep2, t.ads.metaStartStep3]

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-dashed border-border p-6" aria-labelledby="meta-start-title" role="group">
      <h3 id="meta-start-title" className="text-base font-semibold tracking-tight">{t.ads.metaStartTitle}</h3>
      <ol className="flex flex-col gap-2 text-sm text-muted-foreground">
        {steps.map((step, index) => (
          <li key={step} className="flex items-start gap-3">
            <span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-xs text-foreground">{index + 1}</span>
            <span className="leading-relaxed">{step}</span>
          </li>
        ))}
      </ol>
      <ConnectForm label={t.ads.metaStartConnect} />
      <p className="text-xs text-muted-foreground">{t.ads.metaStartSafetyNote}</p>
    </div>
  )
}
