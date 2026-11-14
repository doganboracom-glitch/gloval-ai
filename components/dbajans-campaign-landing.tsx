'use client'

import Link from 'next/link'
import { ArrowRight, Eye, MessageCircle, WalletCards } from 'lucide-react'
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
import { getCommonPlanCopy } from '@/lib/plan-copy'
import { PLANS, planPrice } from '@/lib/pricing-config'

const starterPlan = PLANS.find((plan) => plan.code === 'starter')
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

        <section aria-label="GLOVAL AI avantajları" className="grid gap-3 pb-8 sm:grid-cols-3 sm:gap-4 sm:pb-10">
          {campaignBenefits.map(({ icon: Icon, title, description }, index) => (
            <article
              key={title}
              className="rounded-2xl border border-brand/55 bg-card p-5 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-brand)_40%,transparent),0_0_24px_color-mix(in_oklab,var(--color-brand)_25%,transparent)] transition-shadow hover:shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-brand)_50%,transparent),0_0_30px_color-mix(in_oklab,var(--color-brand)_35%,transparent)] motion-reduce:transition-none sm:p-6"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand">
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

        <div className="flex justify-center pb-14 sm:pb-16">
          <LinkButton
            href="/#pricing"
            variant="brand"
            size="lg"
            className="w-full sm:w-auto"
            onClick={() =>
              trackFunnelEvent(VERCEL_FUNNEL_EVENTS.campaignPricingClick, {
                campaign: 'dbajans',
              })
            }
          >
            Paketlere göz at
            <ArrowRight aria-hidden="true" className="size-4" />
          </LinkButton>
        </div>

        <footer className="border-t border-border py-6 text-center text-xs leading-relaxed text-muted-foreground">
          GLOVAL AI · DB AJANS&apos;a özel bilgilendirme sayfası
        </footer>
      </div>
    </main>
  )
}
