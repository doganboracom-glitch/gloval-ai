'use client'

import { Check, Sparkles, ShoppingBag } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'

export type Plan = {
  siteName: string
  tagline: string
  tone: string
  audience: string
  siteType?: 'ecommerce' | 'business'
  palette: { name: string; hex: string }[]
  pages: string[]
  sections: { title: string; description: string }[]
}

export function PlanResult({ plan }: { plan: Plan }) {
  const { t } = useLanguage()

  return (
    <div className="animate-fade-up overflow-hidden rounded-2xl border border-primary/25 bg-card/80 text-left backdrop-blur">
      <div className="flex items-center gap-2 border-b border-border/60 bg-primary/10 px-5 py-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">{t.hero.resultTitle}</span>
      </div>

      <div className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-xl font-bold">{plan.siteName}</h3>
          {plan.siteType === 'ecommerce' && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              <ShoppingBag className="h-3.5 w-3.5" />
              {t.plan.ecommerceType}
            </span>
          )}
        </div>
        <p className="mt-1 text-pretty text-sm text-muted-foreground">
          {plan.tagline}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Meta label={t.plan.tone} value={plan.tone} />
          <Meta label={t.plan.audience} value={plan.audience} />
        </div>

        <div className="mt-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t.plan.palette}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {plan.palette.map((c) => (
              <div key={c.hex + c.name} className="flex items-center gap-2">
                <span
                  className="h-6 w-6 rounded-md border border-border"
                  style={{ backgroundColor: c.hex }}
                />
                <span className="text-xs text-muted-foreground">{c.hex}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t.plan.pages}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {plan.pages.map((p) => (
                <span
                  key={p}
                  className="rounded-md border border-border bg-secondary/50 px-2 py-1 text-xs"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t.plan.sections}
            </p>
            <ul className="mt-2 space-y-1.5">
              {plan.sections.map((s) => (
                <li key={s.title} className="flex items-start gap-2 text-xs">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>
                    <span className="font-medium text-foreground">
                      {s.title}
                    </span>
                    <span className="text-muted-foreground">
                      {' — '}
                      {s.description}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-5 border-t border-border/60 pt-3 text-xs text-muted-foreground">
          {t.hero.resultHint}
        </p>
      </div>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-xs">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium text-foreground">{value}</span>
    </span>
  )
}
