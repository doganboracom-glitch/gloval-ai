'use client'

import type { ReactNode } from 'react'
import { Check, Info, Sparkles } from 'lucide-react'
import { LinkButton } from '@/components/link-button'
import {
  AI_CREDIT_CONFIG,
  planPrice,
  yearlySavingLabel,
  resolvePlanForCycle,
  YEARLY_DOMAIN_GIFT,
  type BillingCycle,
  type Plan,
  type PlanCode,
} from '@/lib/pricing-config'

export function PlanCard({
  plan: basePlan,
  cycle,
  currentPlanCode,
  renderCta,
}: {
  plan: Plan
  cycle: BillingCycle
  /**
   * Kullanıcı panelinde aktif paketi işaretlemek için. Verilirse eşleşen kart
   * "Mevcut paketin" rozetiyle vurgulanır ve CTA devre dışı kalır. Ana sayfada
   * verilmez, bu yüzden oradaki davranışı değiştirmez.
   */
  currentPlanCode?: PlanCode
  /**
   * Abonelik (billing) sayfasında gerçek "abone ol / paket değiştir / deneme
   * başlat" aksiyonlarını enjekte etmek için. Verilirse varsayılan yönlendirme
   * butonunun yerini alır; verilmezse ana sayfadaki pazarlama CTA'sı çalışır.
   */
  renderCta?: (ctx: { code: PlanCode; isCurrent: boolean }) => ReactNode
}) {
  // PRO'nun aylık kredi satırı ödeme dönemine göre değişir; diğer paketler aynı
  // kalır. Kart bundan sonra çözümlenmiş paketi kullanır.
  const plan = resolvePlanForCycle(basePlan, cycle)
  const isCurrent = currentPlanCode === plan.code
  const { price, period } = planPrice(plan, cycle)
  const saving = cycle === 'yearly' ? yearlySavingLabel(plan) : null
  // Yıllık pakete özel satırlar (.com.tr domain hediyesi) aylık seçimde
  // gösterilmez; yanlış beklenti yaratmasın.
  const features = plan.features.filter(
    (feature) => !feature.yearlyOnly || cycle === 'yearly',
  )

  return (
    <div
      id={`plan-${plan.code}`}
      className={`relative flex scroll-mt-24 flex-col rounded-2xl border p-6 ${
        isCurrent
          ? 'border-brand ring-2 ring-brand/40 bg-card'
          : plan.featured
            ? 'border-brand/45 bg-card glow-primary lg:-my-3 lg:py-9'
            : 'border-border bg-card'
      }`}
    >
      {isCurrent && (
        <span className="absolute -top-3 right-6 inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-brand-foreground">
          <Check className="h-3 w-3" />
          Mevcut paketin
        </span>
      )}
      {plan.badge && !isCurrent && (
        <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-brand-foreground">
          <Sparkles className="h-3 w-3" />
          {plan.badge}
        </span>
      )}

      <header>
        <h3 className="font-display text-sm font-bold tracking-widest text-muted-foreground">
          {plan.name}
        </h3>
        <p className="mt-2 text-balance font-display text-xl font-semibold leading-snug">
          {plan.headline}
        </p>
        <p className="mt-1.5 text-pretty text-sm leading-relaxed text-muted-foreground">
          {plan.description}
        </p>
      </header>

      <div className="mt-6">
        <div className="flex items-baseline gap-1.5">
          <span className="font-display text-4xl font-bold tracking-tight">
            {price}
          </span>
          {period && (
            <span className="text-sm text-muted-foreground">{period}</span>
          )}
        </div>
        <p className="mt-1.5 h-5 text-xs font-medium text-brand">
          {saving ?? (plan.monthlyPrice === 0 ? 'Kredi kartı gerekmez' : '')}
        </p>
        {cycle === 'yearly' && plan.monthlyPrice > 0 && (
          <p className="text-xs text-muted-foreground">{YEARLY_DOMAIN_GIFT}</p>
        )}
      </div>

      {/* AI kredi özeti: paketler arasındaki en belirleyici fark, bu yüzden
          özellik listesinden önce ayrı bir blokta duruyor. */}
      <div
        className={`mt-5 rounded-xl border p-4 ${
          plan.featured
            ? 'border-brand/35 bg-brand/8'
            : 'border-border bg-secondary/30'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold">{plan.creditSummary}</p>
          {plan.code === 'pro' && (
            <span
              className="group relative shrink-0 text-muted-foreground"
              tabIndex={0}
              role="note"
              aria-label={`Maksimum AI işlem bakiyesi ${AI_CREDIT_CONFIG.pro.maxBalance} AI işlemi`}
            >
              <Info className="h-4 w-4" />
              <span className="pointer-events-none absolute right-0 top-6 z-10 w-44 rounded-lg border border-border bg-popover p-2 text-xs leading-relaxed text-muted-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus:opacity-100">
                Maksimum bakiye:{' '}
                <strong className="text-foreground">
                  {AI_CREDIT_CONFIG.pro.maxBalance.toLocaleString('tr-TR')} AI
                  işlemi
                </strong>
              </span>
            </span>
          )}
        </div>
        <ul className="mt-1.5 space-y-0.5">
          {plan.creditNotes.map((note) => (
            <li
              key={note}
              className="text-xs leading-relaxed text-muted-foreground"
            >
              {note}
            </li>
          ))}
        </ul>
      </div>

      {renderCta ? (
        <div className="mt-5">{renderCta({ code: plan.code, isCurrent })}</div>
      ) : isCurrent ? (
        <button
          type="button"
          disabled
          className="mt-5 inline-flex w-full cursor-default items-center justify-center gap-2 rounded-lg border border-brand/40 bg-brand/10 px-4 py-2.5 text-sm font-semibold text-brand"
        >
          <Check className="h-4 w-4" />
          Mevcut paketin
        </button>
      ) : (
        <LinkButton
          href={plan.code === 'free' ? '#hero-input' : '/billing'}
          variant={plan.featured ? 'brand' : 'secondary'}
          size="lg"
          className="mt-5 w-full"
        >
          {plan.cta}
        </LinkButton>
      )}

      <ul className="mt-6 flex-1 space-y-2.5">
        {features.map((feature) => (
          <li key={feature.label} className="flex items-start gap-2.5 text-sm">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            <span>
              <span
                className={
                  feature.highlight
                    ? 'font-medium text-foreground'
                    : 'text-muted-foreground'
                }
              >
                {feature.label}
              </span>
              {feature.note && (
                <span className="block text-xs text-muted-foreground/70">
                  {feature.note}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {plan.footnote && (
        <p className="mt-5 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground/80">
          {plan.footnote}
        </p>
      )}
    </div>
  )
}
