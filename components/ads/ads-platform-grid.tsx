'use client'

import { useLanguage } from '@/components/language-provider'
import { cn } from '@/lib/utils'
import { ADS_PLATFORM_REGISTRY } from '@/lib/ads/platforms'
import { AdsPlatformIcon } from '@/components/ads/sections/ads-platform-icon'

export function AdsPlatformGrid() {
  const { t } = useLanguage()
  const copy = t.ads

  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
      {ADS_PLATFORM_REGISTRY.map((platform) => {
        const isActive = platform.status === 'available'
        const name = copy[platform.nameKey]
        const body = copy[platform.bodyKey]

        return (
          <li
            key={platform.id}
            className={cn(
              'flex min-h-40 flex-col gap-4 rounded-2xl border p-4 motion-safe:transition-transform motion-safe:hover:scale-[1.02] motion-reduce:transform-none',
              isActive ? 'border-brand/45 bg-brand/5' : 'border-border/70 bg-card/50 opacity-80',
            )}
          >
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
            {platform.status === 'coming_soon' ? (
              <span className="mt-auto inline-flex w-fit items-center rounded-full border border-border/70 bg-secondary/50 px-2.5 py-1 text-sm font-medium text-muted-foreground">
                {copy.comingSoon}
              </span>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
