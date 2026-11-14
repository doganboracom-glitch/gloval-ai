'use client'

import Link from 'next/link'
import { ArrowRight, Check, Eye, MessageCircle, Minus, WalletCards } from 'lucide-react'
import { BrandLogo } from '@/components/brand-logo'
import { LinkButton } from '@/components/link-button'
import {
  DBAJANS_WHATSAPP_DISPLAY,
  DBAJANS_WHATSAPP_URL,
} from '@/lib/dbajans-campaign'
import {
  VERCEL_FUNNEL_EVENTS,
  trackFunnelEvent,
} from '@/lib/vercel-analytics'
import { buildPlanView, getCommonPlanCopy, splitPlanItems } from '@/lib/plan-copy'
import { PLANS, planPrice } from '@/lib/pricing-config'
import type { Plan } from '@/lib/pricing-config'

const campaignPlans = PLANS.filter((plan) => plan.code === 'free' || plan.code === 'starter')
const starterPlan = campaignPlans.find((plan) => plan.code === 'starter')
const startingPrice = starterPlan ? planPrice(starterPlan, 'monthly').price : null
const commonPlanCopy = getCommonPlanCopy('tr')

const campaignBenefits = [
  {
    icon: Eye,
    title: 'Önce görün',
    description: 'Sitenizi inceleyip karar verin.',
  },
  {
    icon: WalletCards,
    title: 'Bütçenize uygun',
    description: 'Paketler güncel fiyatlarıyla sunulur; yıllık planda avantaj sizi bekler.',
  },
  {
    icon: MessageCircle,
    title: 'Size özel WhatsApp desteği',
    description: 'Sitenizi birlikte hazırlayabiliriz.',
  },
]

function CampaignPlanCard({ plan }: { plan: Plan }) {
  const view = buildPlanView(plan.code, 'monthly', 'tr')
  const { featured } = splitPlanItems(view, 3)
  const { price, period } = planPrice(plan, 'monthly')

  return (
    <article
      className={`flex h-full flex-col rounded-2xl border p-5 sm:p-6 ${
        plan.featured ? 'border-brand/50 bg-card' : 'border-border bg-card'
      }`}
    >
      <header>
        <p className="font-display text-sm font-bold tracking-widest text-muted-foreground">
          {view.name}
        </p>
        <h3 className="mt-2 text-balance font-display text-xl font-semibold leading-snug">
          {view.headline}
        </h3>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
          {view.description}
        </p>
      </header>

      <div className="mt-5">
        <p className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-display text-3xl font-bold tabular-nums tracking-tight">
            {price}
          </span>
          {period && <span className="text-sm text-muted-foreground">{commonPlanCopy.perMonth}</span>}
        </p>
        {plan.monthlyPrice === 0 && (
          <p className="mt-1 text-xs leading-relaxed text-brand">{commonPlanCopy.noCardRequired}</p>
        )}
      </div>

      <ul className="mt-5 flex flex-col gap-3" aria-label={`${view.name} planının öne çıkan özellikleri`}>
        {featured.map((item) => (
          <li key={item.id} className="flex items-start gap-2.5 text-sm leading-relaxed">
            {item.excluded ? (
              <Minus aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            ) : (
              <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" />
            )}
            <span className={item.excluded ? 'text-muted-foreground' : 'text-foreground'}>
              {item.label}
            </span>
          </li>
        ))}
      </ul>

      <LinkButton
        href="/auth/sign-up"
        variant={plan.featured ? 'brand' : 'secondary'}
        className="mt-6 w-full"
        onClick={() =>
          trackFunnelEvent(VERCEL_FUNNEL_EVENTS.campaignSignupClick, {
            campaign: 'dbajans',
            plan: plan.code,
          })
        }
      >
        Ücretsiz dene
      </LinkButton>
    </article>
  )
}

export function DbAjansCampaignLanding() {
  return (
    <main className="min-h-screen bg-background px-4 font-sans text-foreground sm:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between gap-4 py-5 sm:py-7">
          <Link href="/" aria-label="GLOVAL AI ana sayfa" className="shrink-0">
            <BrandLogo className="w-28 sm:w-32" priority />
          </Link>
          <span className="rounded-full border border-brand/35 bg-card px-3 py-2 text-right text-xs font-semibold text-brand sm:text-sm">
            DB AJANS&apos;a özel davet
          </span>
        </header>

        <section aria-labelledby="dbajans-title" className="pb-14 pt-8 text-center sm:pb-16 sm:pt-12">
          <p className="mx-auto mb-5 inline-flex items-center rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground sm:text-sm">
            Yapay zekâyla hazırlanan web siteleri
          </p>
          <h1
            id="dbajans-title"
            className="mx-auto max-w-4xl text-balance font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl"
          >
            DB AJANS&apos;tan tanıdığınız ekipten yeni bir çözüm:{' '}
            <span className="text-brand">GLOVAL AI</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:mt-6 sm:text-lg">
            Web siteniz yapay zekâyla hazırlanır; satın almadan önce görür, beğenirseniz yayına alırsınız.
          </p>
          <div className="mt-7 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <LinkButton
              href={DBAJANS_WHATSAPP_URL}
              variant="brand"
              size="lg"
              className="w-full sm:w-auto"
              onClick={() =>
                trackFunnelEvent(VERCEL_FUNNEL_EVENTS.campaignWhatsappClick, {
                  campaign: 'dbajans',
                })
              }
            >
              <MessageCircle aria-hidden="true" className="size-5" />
              WhatsApp&apos;tan yazın
            </LinkButton>
            <LinkButton
              href="/auth/sign-up"
              variant="secondary"
              size="lg"
              className="w-full sm:w-auto"
              onClick={() =>
                trackFunnelEvent(VERCEL_FUNNEL_EVENTS.campaignSignupClick, {
                  campaign: 'dbajans',
                })
              }
            >
              Ücretsiz dene
              <ArrowRight aria-hidden="true" className="size-4" />
            </LinkButton>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            WhatsApp destek hattı: <span className="font-semibold text-foreground">{DBAJANS_WHATSAPP_DISPLAY}</span>
          </p>
        </section>

        <section aria-label="GLOVAL AI avantajları" className="grid gap-3 pb-14 sm:grid-cols-3 sm:gap-4 sm:pb-20">
          {campaignBenefits.map(({ icon: Icon, title, description }, index) => (
            <article key={title} className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <h2 className="font-display text-base font-semibold leading-snug sm:text-lg">{title}</h2>
              </div>
              {index === 1 && startingPrice ? (
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Paketler {startingPrice}/ay&apos;dan başlıyor. Yıllık planlarda {commonPlanCopy.yearlyHighlight}.
                </p>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
              )}
            </article>
          ))}
        </section>

        <section id="campaign-pricing" aria-labelledby="campaign-pricing-title" className="pb-16 sm:pb-20">
          <div className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-brand">Güncel paket özeti</p>
              <h2 id="campaign-pricing-title" className="mt-2 text-balance font-display text-2xl font-bold tracking-tight sm:text-3xl">
                Size uygun planla başlayın
              </h2>
            </div>
            <Link
              href="/#pricing"
              className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-semibold text-foreground underline decoration-brand/60 underline-offset-4 transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:self-auto"
            >
              Tüm paketleri gör
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {campaignPlans.map((plan) => (
              <CampaignPlanCard key={plan.code} plan={plan} />
            ))}
          </div>
        </section>

        <footer className="border-t border-border py-6 text-center text-xs leading-relaxed text-muted-foreground">
          GLOVAL AI · DB AJANS&apos;a özel bilgilendirme sayfası
        </footer>
      </div>
    </main>
  )
}
