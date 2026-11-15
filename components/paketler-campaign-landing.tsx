import { ArrowRight, Check } from 'lucide-react'
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
            className="mx-auto mt-5 max-w-4xl text-balance font-display text-3xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl"
          >
            <span className="block">Bütçene uygun</span>{' '}
            <span className="block whitespace-nowrap text-brand">web sitesi çözümleri</span>
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
                className="w-full sm:w-auto bg-[#25D366] font-semibold text-[#0B1F14] shadow-[0_8px_24px_rgba(37,211,102,0.35)] transition-colors hover:bg-[#1EBE5A] hover:opacity-100 active:bg-[#19A84F] focus-visible:ring-[#0B1F14] focus-visible:ring-offset-2 motion-reduce:transition-none"
              >
                <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className="size-5 fill-current">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.768.967-.941 1.166-.173.198-.347.223-.644.074-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.372-.025-.52-.075-.149-.669-1.612-.916-2.206-.242-.579-.487-.5-.67-.51l-.57-.01c-.198 0-.52.074-.793.372-.272.297-1.04 1.016-1.04 2.479s1.065 2.875 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.262.489 1.693.625.712.227 1.36.195 1.872.118.571-.085 1.758-.718 2.006-1.412.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.87 9.87 0 0 1-1.516-5.26c.002-5.45 4.439-9.886 9.893-9.886 2.64 0 5.122 1.03 6.99 2.898a9.825 9.825 0 0 1 2.9 6.99c-.003 5.45-4.44 9.885-9.893 9.885m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.156 11.89c-.002 2.096.547 4.142 1.588 5.947L0 24l6.335-1.66a11.89 11.89 0 0 0 5.71 1.455h.005c6.555 0 11.89-5.335 11.893-11.89a11.82 11.82 0 0 0-3.479-8.418z" />
                </svg>
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
            href="/sss"
            eventName={VERCEL_FUNNEL_EVENTS.campaignFaqClick}
            campaign="paketler"
            variant="brand"
            size="lg"
            className="w-full sm:w-auto"
          >
            Sıkça Sorulan Sorular
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
