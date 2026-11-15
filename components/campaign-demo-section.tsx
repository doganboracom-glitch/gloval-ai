import Image from 'next/image'
import { ArrowRight } from 'lucide-react'
import { CampaignDemoLink } from '@/components/campaign-demo-link'
import { allDemos } from '@/lib/demos'
import { demoImages } from '@/lib/demo-images'
import { getLandingDemoHeroImage } from '@/lib/demo-landing'
import type { FunnelProps } from '@/lib/vercel-analytics'

export function getDemoCardImage(slug: string): { src: string; alt: string } | null {
  const demo = allDemos.find((candidate) => candidate.slug === slug)
  if (!demo) return null

  const showcaseHero = demoImages[slug]?.hero
  if (showcaseHero) {
    return { src: showcaseHero, alt: `${demo.brand.tr} örnek sitesi görseli` }
  }

  return getLandingDemoHeroImage(slug)
}

type CampaignName = NonNullable<FunnelProps['campaign']>

type CampaignDemoSectionProps = {
  campaign: CampaignName
  sectionPrefix: string
}

export function CampaignDemoSection({ campaign, sectionPrefix }: CampaignDemoSectionProps) {
  const titleId = `${sectionPrefix}-demos-title`

  return (
    <section aria-labelledby={titleId} className="pb-10 sm:pb-12">
      <div className="text-center">
        <p className="mx-auto inline-flex items-center rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground sm:text-sm">
          Örnek siteler
        </p>
        <h2
          id={titleId}
          className="mx-auto mt-3 max-w-3xl text-balance font-display text-2xl font-bold leading-tight tracking-tight sm:text-3xl"
        >
          Hazır örnek sitelere göz atın
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
          Bir örneğe tıklayın, sitenizin nasıl görüneceğini kendiniz inceleyin.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:mt-8 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {allDemos.map((demo) => {
          const image = getDemoCardImage(demo.slug)

          return (
            <CampaignDemoLink
              key={demo.slug}
              href={`/demo/${demo.slug}`}
              campaign={campaign}
              demo={demo.slug}
              ariaLabel={`${demo.brand.tr} örnek sitesini incele (yeni sekmede açılır)`}
              className="group flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {image ? (
                <div className="relative aspect-video w-full overflow-hidden rounded-t-2xl">
                  <Image
                    src={image.src}
                    alt={image.alt}
                    fill
                    loading="lazy"
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover transition-transform duration-300 motion-reduce:transition-none motion-safe:group-hover:scale-[1.03]"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent"
                  />
                </div>
              ) : null}
              <div className="flex flex-1 flex-col p-5">
                <span className="inline-flex w-fit max-w-full rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium leading-relaxed text-brand">
                  {demo.tag.tr}
                </span>
                <h3 className="mt-3 font-display text-base font-semibold leading-snug text-foreground sm:text-lg">
                  {demo.brand.tr}
                </h3>
                <p className="mt-2 line-clamp-3 text-pretty text-sm leading-relaxed text-muted-foreground">
                  {demo.description.tr}
                </p>
                <span className="mt-auto inline-flex items-center gap-2 pt-4 text-sm font-medium text-brand">
                  Örneği incele
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
                  />
                </span>
              </div>
            </CampaignDemoLink>
          )
        })}
      </div>
    </section>
  )
}
