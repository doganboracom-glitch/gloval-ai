import Link from 'next/link'
import { ArrowRight, Eye, MessageCircle, WalletCards } from 'lucide-react'
import { BrandLogo } from '@/components/brand-logo'
import { CampaignDemoSection } from '@/components/campaign-demo-section'
import { CampaignTrackedLink } from '@/components/campaign-tracked-link'
import {
  DBAJANS_WHATSAPP_DISPLAY,
  DBAJANS_WHATSAPP_URL,
} from '@/lib/dbajans-campaign'
import { VERCEL_FUNNEL_EVENTS } from '@/lib/vercel-analytics'
import { getCommonPlanCopy } from '@/lib/plan-copy'
import { PLANS, planPrice } from '@/lib/pricing-config'

const starterPlan = PLANS.find((plan) => plan.code === 'starter')
const startingPrice = starterPlan ? planPrice(starterPlan, 'monthly').price : null
const commonPlanCopy = getCommonPlanCopy('tr')

function WhatsappIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className="size-5 fill-current">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.768.967-.941 1.166-.173.198-.347.223-.644.074-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.372-.025-.52-.075-.149-.669-1.612-.916-2.206-.242-.579-.487-.5-.67-.51l-.57-.01c-.198 0-.52.074-.793.372-.272.297-1.04 1.016-1.04 2.479s1.065 2.875 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.262.489 1.693.625.712.227 1.36.195 1.872.118.571-.085 1.758-.718 2.006-1.412.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.87 9.87 0 0 1-1.516-5.26c.002-5.45 4.439-9.886 9.893-9.886 2.64 0 5.122 1.03 6.99 2.898a9.825 9.825 0 0 1 2.9 6.99c-.003 5.45-4.44 9.885-9.893 9.885m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.156 11.89c-.002 2.096.547 4.142 1.588 5.947L0 24l6.335-1.66a11.89 11.89 0 0 0 5.71 1.455h.005c6.555 0 11.89-5.335 11.893-11.89a11.82 11.82 0 0 0-3.479-8.418z" />
    </svg>
  )
}

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
            <CampaignTrackedLink
              href={DBAJANS_WHATSAPP_URL}
              eventName={VERCEL_FUNNEL_EVENTS.campaignWhatsappClick}
              campaign="dbajans"
              variant="brand"
              size="lg"
              className="w-full sm:w-auto bg-[#25D366] font-semibold text-[#0B1F14] shadow-[0_8px_24px_rgba(37,211,102,0.35)] transition-colors hover:bg-[#1EBE5A] hover:opacity-100 active:bg-[#19A84F] focus-visible:ring-[#0B1F14] focus-visible:ring-offset-2 motion-reduce:transition-none"
            >
              <WhatsappIcon />
              WhatsApp&apos;tan yazın
            </CampaignTrackedLink>
            <CampaignTrackedLink
              href="/auth/sign-up"
              eventName={VERCEL_FUNNEL_EVENTS.campaignSignupClick}
              campaign="dbajans"
              variant="secondary"
              size="lg"
              className="w-full sm:w-auto"
            >
              Ücretsiz dene
              <ArrowRight aria-hidden="true" className="size-4" />
            </CampaignTrackedLink>
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

        <CampaignDemoSection campaign="dbajans" sectionPrefix="dbajans" />

        <div className="flex justify-center pb-14 sm:pb-16">
          <CampaignTrackedLink
            href="/#pricing"
            eventName={VERCEL_FUNNEL_EVENTS.campaignPricingClick}
            campaign="dbajans"
            variant="brand"
            size="lg"
            className="w-full sm:w-auto"
          >
            Paketlere göz at
            <ArrowRight aria-hidden="true" className="size-4" />
          </CampaignTrackedLink>
        </div>

        <footer className="border-t border-border py-6 text-center text-xs leading-relaxed text-muted-foreground">
          GLOVAL AI · DB AJANS&apos;a özel bilgilendirme sayfası
        </footer>
      </div>
    </main>
  )
}
