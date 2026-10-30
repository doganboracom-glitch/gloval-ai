'use client'

import { History, ShieldCheck, Wallet } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { AdsAddressForm } from '@/components/ads/ads-address-form'
import { AdsPlatformGrid } from '@/components/ads/ads-platform-grid'
import { AdsProductSwitch } from '@/components/ads/ads-product-switch'

export function AdsBetaBadge() {
  const { t } = useLanguage()
  return (
    <span className="rounded-full border border-brand/40 bg-brand/10 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-brand">
      {t.ads.beta}
    </span>
  )
}

export function AdsPageClient() {
  const { t } = useLanguage()
  const copy = t.ads

  const principles = [
    { icon: ShieldCheck, title: copy.principleApprovalTitle, body: copy.principleApprovalBody },
    { icon: History, title: copy.principleLogTitle, body: copy.principleLogBody },
    { icon: Wallet, title: copy.principleBudgetTitle, body: copy.principleBudgetBody },
  ]

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 pb-16 pt-14 text-center sm:pt-20">
          <div className="flex items-center gap-3">
            <AdsProductSwitch active="ads" />
            <AdsBetaBadge />
          </div>
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">{copy.heroTitle}</h1>
          <p className="max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">{copy.heroSubtitle}</p>
          <AdsAddressForm />
        </section>

        <section aria-labelledby="ads-platforms" className="mx-auto max-w-5xl px-4 pb-16">
          <div className="mb-6 flex flex-col gap-1">
            <h2 id="ads-platforms" className="text-2xl font-semibold tracking-tight">
              {copy.platformsTitle}
            </h2>
            <p className="text-muted-foreground">{copy.platformsSubtitle}</p>
          </div>
          <AdsPlatformGrid />
        </section>

        <section aria-labelledby="ads-principles" className="mx-auto max-w-5xl px-4 pb-20">
          <h2 id="ads-principles" className="mb-6 text-2xl font-semibold tracking-tight">
            {copy.principlesTitle}
          </h2>
          <ul className="grid gap-4 md:grid-cols-3">
            {principles.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
                <Icon className="size-5 text-brand" aria-hidden="true" />
                <h3 className="text-base font-semibold">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-sm text-muted-foreground">
            {copy.betaNote} {copy.creditsNote}
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
