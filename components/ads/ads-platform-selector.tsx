'use client'

import { useState } from 'react'
import type { Dict } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import {
  ADS_PLATFORM_REGISTRY,
  isAdsPlatformAccessible,
  type AdsPlatformDefinition,
  type AdsPlatformGate,
  type AdsPlatformSlug,
} from '@/lib/ads/platforms'
import { AdsScrollRow } from '@/components/ads/ads-scroll-row'
import { AdsPlatformComingSoon } from '@/components/ads/ads-platform-coming-soon'
import { AdsPlatformIcon } from '@/components/ads/sections/ads-platform-icon'

type AdsCopy = Dict['ads']

type AdsPlatformSelectorProps = {
  copy: AdsCopy
  activeSlug: AdsPlatformSlug
  openGates: readonly AdsPlatformGate[]
  onSelect: (platform: AdsPlatformDefinition) => void
}

export function AdsPlatformSelector({ copy, activeSlug, openGates, onSelect }: AdsPlatformSelectorProps) {
  const [notice, setNotice] = useState<AdsPlatformDefinition | null>(null)

  function handleClick(platform: AdsPlatformDefinition, accessible: boolean) {
    if (!accessible) {
      setNotice(platform)
      return
    }
    setNotice(null)
    onSelect(platform)
  }

  const noticeReason = notice?.status === 'available' ? 'limited' : 'coming_soon'

  return (
    <div className="flex flex-col gap-3">
      <AdsScrollRow role="group" aria-label={copy.platformSwitchLabel} activeKey={activeSlug}>
        {ADS_PLATFORM_REGISTRY.map((platform) => {
          const accessible = isAdsPlatformAccessible(platform, openGates)
          const selected = accessible && platform.slug === activeSlug
          const badge = accessible
            ? null
            : platform.slug === 'meta'
              ? copy.metaApprovalPendingShort
              : platform.status === 'available' ? copy.platformLimitedAccess : copy.comingSoon

          return (
            <button
              key={platform.id}
              type="button"
              data-platform={platform.slug}
              aria-pressed={accessible ? selected : undefined}
              aria-current={selected ? 'true' : undefined}
              aria-disabled={accessible ? undefined : true}
              aria-describedby={!accessible && notice?.id === platform.id ? 'ads-platform-notice' : undefined}
              onClick={() => handleClick(platform, accessible)}
              className={cn(
                'inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                selected && 'border-brand bg-brand/10 text-foreground',
                accessible && !selected && 'border-border text-muted-foreground hover:border-brand/50 hover:text-foreground',
                !accessible && 'cursor-not-allowed border-border/70 bg-card/40 text-muted-foreground opacity-80',
              )}
            >
              <span className={cn('inline-flex', selected && 'text-brand')}>
                <AdsPlatformIcon name={platform.icon} />
              </span>
              {copy[platform.nameKey]}
              {badge ? (
                <span className="rounded-full border border-border/70 bg-secondary/50 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {badge}
                </span>
              ) : null}
            </button>
          )
        })}
      </AdsScrollRow>
      {notice ? (
        <div id="ads-platform-notice">
          <AdsPlatformComingSoon platform={notice} copy={copy} reason={noticeReason} />
        </div>
      ) : null}
    </div>
  )
}
