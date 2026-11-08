'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { cn } from '@/lib/utils'
import {
  ADS_ANONYMOUS_VIEWER,
  ADS_PLATFORM_REGISTRY,
  resolveAdsPlatformCardTarget,
  type AdsViewerAccess,
} from '@/lib/ads/platforms'
import { AdsPlatformIcon } from '@/components/ads/sections/ads-platform-icon'

export function AdsPlatformGrid({ viewer = ADS_ANONYMOUS_VIEWER }: { viewer?: AdsViewerAccess }) {
  const { t } = useLanguage()
  const copy = t.ads

  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
      {ADS_PLATFORM_REGISTRY.map((platform) => {
        const resolvedTarget = resolveAdsPlatformCardTarget(platform, viewer)
        const isMetaComingSoonForAnonymous =
          platform.slug === 'meta' && resolvedTarget.kind === 'link' && resolvedTarget.requiresLogin
        const target = isMetaComingSoonForAnonymous
          ? { kind: 'passive' as const, reason: 'coming_soon' as const }
          : resolvedTarget
        const isActive = platform.status === 'available' && !isMetaComingSoonForAnonymous
        const name = copy[platform.nameKey]
        const body = copy[platform.bodyKey]

        const content = (
          <>
            <div className="flex min-w-0 items-start gap-3 xl:flex-col">
              <span
                className={cn(
                  'grid size-10 shrink-0 place-items-center rounded-xl border',
                  isActive
                    ? 'border-brand/30 bg-brand/10 text-brand'
                    : 'border-border/70 bg-secondary/40 text-muted-foreground',
                )}
              >
                <AdsPlatformIcon name={platform.icon} />
              </span>
              <div className="flex min-w-0 flex-col gap-2">
                <h3 className={cn('text-sm font-semibold leading-snug', isActive ? 'text-foreground' : 'text-muted-foreground')}>
                  {name}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </div>
            {target.kind === 'link' ? (
              <span className="mt-auto inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand">
                {target.requiresLogin ? copy.platformCardSignIn : copy.platformCardOpen}
                <ArrowRight className="size-4" aria-hidden="true" />
              </span>
            ) : (
              <span className="mt-auto inline-flex w-fit items-center rounded-full border border-border/70 bg-secondary/50 px-2.5 py-1 text-sm font-medium text-muted-foreground">
                {target.reason === 'limited' ? copy.platformLimitedAccess : copy.comingSoon}
              </span>
            )}
          </>
        )

        const cardClasses = 'flex min-h-40 flex-col gap-4 rounded-2xl border p-4'

        return (
          <li key={platform.id} className="flex">
            {target.kind === 'link' ? (
              <Link
                href={target.href}
                data-platform={platform.slug}
                className={cn(
                  cardClasses,
                  'w-full border-brand/45 bg-brand/5 transition-colors hover:border-brand hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                )}
              >
                {content}
              </Link>
            ) : (
              <div
                data-platform={platform.slug}
                className={cn(
                  cardClasses,
                  'w-full',
                  isActive ? 'border-brand/30 bg-brand/5' : 'border-border/70 bg-card/50 opacity-80',
                )}
              >
                {content}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
