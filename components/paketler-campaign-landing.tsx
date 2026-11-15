import { ArrowRight, Check, MessageCircle } from 'lucide-react'
import { BrandLogo } from '@/components/brand-logo'
import { CampaignDemoSection } from '@/components/campaign-demo-section'
import { CampaignTrackedLink } from '@/components/campaign-tracked-link'
import { cn } from '@/lib/utils'
import { DBAJANS_WHATSAPP_DISPLAY, DBAJANS_WHATSAPP_NUMBER } from '@/lib/dbajans-campaign'
import { buildPlanView, getCommonPlanCopy, splitPlanItems, yearlySavingText } from '@/lib/plan-copy'
import { PLANS, planPrice } from '@/lib/pricing-config'
import { VERCEL_FUNNEL_EVENTS } from '@/lib/vercel-analytics'

const whatsappHref = `https://wa.me/${DBAJANS_WHATSAPP_NUMBER}?text=${encodeURIComponent('Merhaba, GLOVAL AI paketleri hakkında bilgi almak istiyorum.')}`

export function PaketlerPlansSection() {
  const commonCopy = getCommonPlanCopy('tr')

  return (
    <section id="paketler" aria-labelledby="paketler-title" className="scroll-mt-8 py-12 sm:py-16">
      <div className="mx-auto max-w-3xl pb-8 text-center">
        <p className="text-sm font-semibold tracking-wide text-brand">Planlar</p>
        <h2
          id="paketler-title"
          className="mt-3 text-balance font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl"
        >
          İhtiyacınıza uygun paketi seçin
        </h2>
        <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground">
          Aylık ve yıllık fiyatları, site limitlerini ve her paketin öne çıkan özelliklerini karşılaştırın.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((plan) => {
          const view = buildPlanView(plan.code, 'yearly', 'tr')
          const monthly = planPrice(plan, 'monthly')
          const yearly = planPrice(plan, 'yearly')
          const saving = yearlySavingText(plan, 'tr')
          const highlights = splitPlanItems(view, 3).featured.filter((item) => !item.excluded).slice(0, 3)

          return (
            <article
              key={plan.code}
              id={`paket-${plan.code}`}
              className={cn(
                'flex min-w-0 flex-col rounded-2xl border bg-card p-5 sm:p-6',
                plan.featured ? 'border-brand/60 shadow-lg shadow-brand/10' : 'border-border',
              )}
            >
              <div className="flex min-h-20 flex-col items-start gap-2">
                <div className="flex w-full items-center justify-between gap-2">
                  <h3 className="font-display text-xl font-bold tracking-tight">{view.name}</h3>
                  {view.badge ? (
                    <span className="shrink-0 rounded-full bg-brand/10 px-2.5 py-1 text-sm font-semibold text-brand">
                      {view.badge}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm font-semibold leading-relaxed text-foreground">{view.headline}</p>
              </div>

              <p className="mt-3 min-h-12 text-sm leading-relaxed text-muted-foreground">
                {view.description}
              </p>

              <div className="mt-4 border-y border-border py-4">
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-muted-foreground">Aylık</p>
                    <p className="mt-1 whitespace-nowrap text-2xl font-bold tracking-tight">
                      {monthly.price}
                      {monthly.period ? <span className="text-sm font-medium text-muted-foreground">{monthly.period}</span> : null}
                    </p>
                  </div>
                  {yearly.period ? (
                    <div className="min-w-0 text-right">
                      <p className="text-sm font-medium text-muted-foreground">Yıllık</p>
                      <p className="mt-1 whitespace-nowrap text-base font-semibold">
                        {yearly.price}
                        <span className="text-sm font-medium text-muted-foreground">{yearly.period}</span>
                      </p>
                    </div>
                  ) : null}
                </div>
                <p className="mt-2 min-h-5 text-sm leading-relaxed text-muted-foreground">
                  {saving ?? commonCopy.noCardRequired}
                </p>
              </div>

              <div className="flex flex-1 flex-col pt-4">
                {view.extendsLabel ? (
                  <p className="mb-2 text-sm font-semibold leading-relaxed text-muted-foreground">
                    {view.extendsLabel}
                  </p>
                ) : null}
                <ul className="flex flex-col gap-3">
                  {highlights.map((item) => (
                    <li key={item.id} className="flex items-start gap-2.5 text-sm leading-relaxed">
                      <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" />
                      <span className="min-w-0">{item.label}</span>
                    </li>
                  ))}
                </ul>
                <CampaignTrackedLink
                  href="/auth/sign-up"
                  eventName={VERCEL_FUNNEL_EVENTS.campaignSignupClick}
                  campaign="paketler"
                  plan={plan.code}
                  preserveAttribution
                  variant={plan.featured ? 'brand' : 'secondary'}
                  size="lg"
                  className="mt-6 w-full"
                >
                  {plan.code === 'free' ? 'Ücretsiz dene' : 'Başla'}
                  <ArrowRight aria-hidden="true" className="size-4" />
                </CampaignTrackedLink>
              </div>
            </article>
          )
        })}
      </div>
      <p className="mt-6 text-center text-sm font-medium leading-relaxed text-muted-foreground">
        {commonCopy.yearlyHighlight}
      </p>
    </section>
  )
}

export function PaketlerCampaignLanding() {
  return (
    <main className="min-h-screen bg-background px-4 font-sans text-foreground sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="py-5 sm:py-7">
          <header className="flex items-center justify-between gap-4">
            <a href="/" aria-label="GLOVAL AI ana sayfa" className="shrink-0">
              <BrandLogo className="w-28 sm:w-32" priority />
            </a>
          </header>
        </div>

        <section aria-labelledby="paketler-hero-title" className="border-b border-border py-12 text-center sm:py-16 lg:py-20">
          <p className="mx-auto inline-flex items-center rounded-full border border-brand/35 bg-card px-3 py-1.5 text-sm font-semibold tracking-wide text-brand sm:text-sm">
            GLOVAL AI paketleri
          </p>
          <h1
            id="paketler-hero-title"
            className="mx-auto mt-5 max-w-4xl text-balance font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl"
          >
            Bütçene uygun <span className="text-brand">web sitesi çözümleri</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            Güncel fiyatları karşılaştırın, size uyan paketle başlayın.
          </p>
          <div className="mt-7">
            <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <CampaignTrackedLink
                href="/auth/sign-up"
                eventName={VERCEL_FUNNEL_EVENTS.campaignSignupClick}
                campaign="paketler"
                preserveAttribution
                variant="brand"
                size="lg"
                className="w-full sm:w-auto"
              >
                Ücretsiz başla
                <ArrowRight aria-hidden="true" className="size-4" />
              </CampaignTrackedLink>
              <CampaignTrackedLink
                href={whatsappHref}
                eventName={VERCEL_FUNNEL_EVENTS.campaignWhatsappClick}
                campaign="paketler"
                variant="secondary"
                size="lg"
                className="w-full sm:w-auto"
              >
                <MessageCircle aria-hidden="true" className="size-4" />
                WhatsApp&apos;tan yazın
              </CampaignTrackedLink>
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            WhatsApp destek hattı: <span className="font-semibold text-foreground">{DBAJANS_WHATSAPP_DISPLAY}</span>
          </p>
        </section>

        <PaketlerPlansSection />

        <div id="ornekler" className="scroll-mt-8">
          <CampaignDemoSection campaign="paketler" sectionPrefix="paketler" />
        </div>

        <div className="flex justify-center pb-14 sm:pb-16">
          <CampaignTrackedLink
            href="/#pricing"
            eventName={VERCEL_FUNNEL_EVENTS.campaignPricingClick}
            campaign="paketler"
            variant="brand"
            size="lg"
            className="w-full sm:w-auto"
          >
            Paketlere göz at
            <ArrowRight aria-hidden="true" className="size-4" />
          </CampaignTrackedLink>
        </div>

        <footer className="border-t border-border py-8 text-center text-sm leading-relaxed text-muted-foreground">
          <a href="/" aria-label="GLOVAL AI ana sayfa" className="inline-flex justify-center">
            <BrandLogo className="w-24" />
          </a>
          <p className="mx-auto mt-3 max-w-xl">
            Paket ve fiyat bilgileri değişebilir; güncel koşullar ödeme adımında gösterilir.
          </p>
        </footer>
      </div>
    </main>
  )
}
