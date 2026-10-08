'use client'

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { PlanCard } from '@/components/pricing/plan-card'
import { ComparisonAccordion } from '@/components/pricing/comparison-accordion'
import { CreditRulesDialog } from '@/components/pricing/credit-rules-dialog'
import { useLanguage } from '@/components/language-provider'
import { getCommonPlanCopy } from '@/lib/plan-copy'
import { PLANS, type BillingCycle } from '@/lib/pricing-config'

const CYCLES: Array<{ value: BillingCycle; label: string }> = [
  { value: 'monthly', label: 'Aylık' },
  { value: 'yearly', label: 'Yıllık' },
]

export function Pricing() {
  // İlk açılışta aylık paketler listelenir; yıllık avantaj toggle ile seçilir.
  const [cycle, setCycle] = useState<BillingCycle>('monthly')
  const [creditRulesOpen, setCreditRulesOpen] = useState(false)
  const { lang } = useLanguage()
  const yearlyHighlight = getCommonPlanCopy(lang).yearlyHighlight

  return (
    <section
      id="pricing"
      className="scroll-mt-20 border-y border-border bg-secondary/20 py-20 sm:py-28"
    >
      <div className="mx-auto max-w-7xl px-4">
        <header className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance font-display text-3xl font-bold tracking-tight sm:text-4xl">
            İşletmen için doğru GLOVAL’ı seç.
          </h2>
          <p className="mt-3 text-pretty text-lg text-muted-foreground">
            Önce oluştur. Sonra yönet. İstersen büyüt.
          </p>
          <p className="mt-2 text-pretty text-sm text-muted-foreground">
            İhtiyacın kadarını seç, istediğin zaman daha gelişmiş özelliklere geç.
          </p>
        </header>

        <div className="mt-8 flex flex-col items-center gap-3">
          <div
            role="tablist"
            aria-label="Ödeme dönemi"
            className="inline-flex rounded-full border border-border bg-card p-1"
          >
            {CYCLES.map((option) => (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={cycle === option.value}
                onClick={() => setCycle(option.value)}
                className={`rounded-full px-5 py-1.5 text-sm font-medium transition-colors ${
                  cycle === option.value
                    ? 'bg-brand text-brand-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {/* Yıllık avantaj metni her iki dönemde de sabit gösterilir. */}
          <p className="flex h-5 items-center gap-1.5 text-sm font-bold text-brand">
            <Sparkles className="h-3.5 w-3.5" />
            {yearlyHighlight}
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((plan) => (
            <PlanCard key={plan.code} plan={plan} cycle={cycle} />
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          AI işlemlerin tükendiğinde ne oluyor?{' '}
          <button
            type="button"
            onClick={() => setCreditRulesOpen(true)}
            className="font-medium text-brand underline decoration-brand/40 underline-offset-4 transition-colors hover:decoration-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Kullanım kurallarını gör
          </button>
        </p>

        <ComparisonAccordion />
      </div>

      <CreditRulesDialog
        open={creditRulesOpen}
        onClose={() => setCreditRulesOpen(false)}
      />
    </section>
  )
}
