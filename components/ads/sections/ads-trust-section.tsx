'use client'

import { History, ShieldCheck, Wallet } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'

export function AdsTrustSection() {
  const { t } = useLanguage()
  const copy = t.ads
  const principles = [
    { icon: ShieldCheck, title: copy.principleApprovalTitle, body: copy.principleApprovalBody },
    { icon: History, title: copy.principleLogTitle, body: copy.principleLogBody },
    { icon: Wallet, title: copy.principleBudgetTitle, body: copy.principleBudgetBody },
  ]

  return (
    <section aria-labelledby="ads-principles-heading" className="mx-auto max-w-5xl px-4 py-10 sm:py-12">
      <h2 id="ads-principles-heading" className="mb-6 text-balance text-2xl font-semibold tracking-tight">
        {copy.principlesTitle}
      </h2>
      <ul className="grid gap-3 md:grid-cols-3">
        {principles.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
            <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand" />
            <div className="flex flex-col gap-1.5">
              <h3 className="text-base font-semibold">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm leading-relaxed text-muted-foreground">{copy.betaNote}</p>
    </section>
  )
}
