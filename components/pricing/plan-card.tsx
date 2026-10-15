'use client'

import { useId, useState, type ReactNode } from 'react'
import { Check, ChevronDown, Minus, Sparkles } from 'lucide-react'
import { LinkButton } from '@/components/link-button'
import { CreditInfoTip } from '@/components/pricing/credit-info-tip'
import { useLanguage } from '@/components/language-provider'
import {
  buildPlanView,
  getCommonPlanCopy,
  splitPlanItems,
  yearlySavingText,
  type PlanCopyItem,
} from '@/lib/plan-copy'
import {
  AI_CREDIT_CONFIG,
  planPrice,
  type BillingCycle,
  type Plan,
  type PlanCode,
} from '@/lib/pricing-config'

export function PlanCard({
  plan,
  cycle,
  currentPlanCode,
  renderCta,
  expanded,
  onExpandedChange,
}: {
  /** Özellik listesinin açık/kapalı durumu; verilmezse kart kendi durumunu tutar. */
  expanded?: boolean
  onExpandedChange?: (next: boolean) => void
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
  const { lang } = useLanguage()
  const copy = getCommonPlanCopy(lang)
  const view = buildPlanView(plan.code, cycle, lang)
  const isCurrent = currentPlanCode === plan.code
  const { price, period: basePeriod } = planPrice(plan, cycle)
  const period = basePeriod
    ? cycle === 'yearly'
      ? copy.perYear
      : copy.perMonth
    : null
  const maxBalance =
    plan.code === 'pro' || plan.code === 'ecommerce'
      ? AI_CREDIT_CONFIG[plan.code].maxBalance.toLocaleString(
          lang === 'tr' ? 'tr-TR' : 'en-US',
        )
      : null
  const saving = cycle === 'yearly' ? yearlySavingText(plan, lang) : null
  const { featured, restGroups, hiddenCount } = splitPlanItems(view)
  const restId = `${useId()}-${plan.code}-features`
  const [ownExpanded, setOwnExpanded] = useState(false)
  const isExpanded = expanded ?? ownExpanded
  const setExpanded = (next: boolean) => {
    if (onExpandedChange) onExpandedChange(next)
    else setOwnExpanded(next)
  }

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
          {copy.currentPlan}
        </span>
      )}
      {view.badge && !isCurrent && (
        <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-brand-foreground">
          <Sparkles className="h-3 w-3" />
          {view.badge}
        </span>
      )}

      <header>
        <h3 className="font-display text-sm font-bold tracking-widest text-muted-foreground">
          {view.name}
        </h3>
        <p className="mt-2 text-balance font-display text-xl font-semibold leading-snug">
          {view.headline}
        </p>
        <p className="mt-1.5 text-pretty text-sm leading-relaxed text-muted-foreground">
          {view.description}
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
          {saving ?? (plan.monthlyPrice === 0 ? copy.noCardRequired : '')}
        </p>
        {cycle === 'yearly' && plan.monthlyPrice > 0 && (
          <p className="text-xs text-muted-foreground">{copy.domainGift}</p>
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
          <p className="text-sm font-semibold">{view.creditSummary}</p>
          {maxBalance && <CreditInfoTip text={copy.maxBalanceTip(maxBalance)} />}
        </div>
        <ul className="mt-1.5 space-y-0.5">
          {view.creditNotes.map((note) => (
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
          {copy.currentPlan}
        </button>
      ) : (
        <LinkButton
          href={plan.code === 'free' ? '#hero-input' : '/billing'}
          variant={plan.featured ? 'brand' : 'secondary'}
          size="lg"
          className="mt-5 w-full"
        >
          {view.cta}
        </LinkButton>
      )}

      <div className="mt-6 flex flex-1 flex-col">
        {view.extendsLabel && (
          <p className="mb-4 border-b border-border pb-3 text-xs font-semibold uppercase tracking-wider text-brand">
            {view.extendsLabel}
          </p>
        )}
        <ul className="space-y-2.5" aria-label={view.name}>
          {featured.map((item) => (
            <FeatureRow key={item.id} item={item} />
          ))}
        </ul>

        {/* Kalan satırlar DOM'da kalır (arama motoru okur); kapalıyken grid-rows
            animasyonuyla görsel olarak kapanır, `inert` ise ekran okuyucudan ve
            klavye sırasından çıkarır. */}
        <div
          id={restId}
          inert={!isExpanded}
          className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
            isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="space-y-5 pt-5">
              {restGroups.map((group) => (
                <section key={group.key} aria-label={group.title}>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
                    {group.title}
                  </h4>
                  <ul className="mt-2 space-y-2.5">
                    {group.items.map((item) => (
                      <FeatureRow key={item.id} item={item} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </div>

        {hiddenCount > 0 && (
          <div className="mt-auto pt-5">
            <button
              type="button"
              onClick={() => setExpanded(!isExpanded)}
              aria-expanded={isExpanded}
              aria-controls={restId}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {isExpanded ? copy.showFewerFeatures : copy.showAllFeatures}
              <ChevronDown
                aria-hidden="true"
                className={`h-4 w-4 transition-transform duration-300 motion-reduce:transition-none ${
                  isExpanded ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function FeatureRow({ item }: { item: PlanCopyItem }) {
  return (
    <li className="flex items-start gap-2.5 text-sm">
      {item.excluded ? (
        <Minus className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
      ) : (
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
      )}
      <span>
        <span
          className={
            item.highlight ? 'font-medium text-foreground' : 'text-muted-foreground'
          }
        >
          {item.label}
        </span>
        {item.badge && (
          <span className="ml-2 inline-flex items-center rounded-full border border-border bg-secondary/40 px-2 py-0.5 align-middle text-xs font-medium text-muted-foreground/70">
            {item.badge}
          </span>
        )}
        {item.note && (
          <span className="block text-xs text-muted-foreground/70">{item.note}</span>
        )}
      </span>
    </li>
  )
}
