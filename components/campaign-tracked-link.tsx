'use client'

import type { ComponentProps, MouseEvent, ReactNode } from 'react'
import { LinkButton } from '@/components/link-button'
import { ATTRIBUTION_KEYS, snapshotFromLocation } from '@/lib/attribution'
import { VERCEL_FUNNEL_EVENTS, trackFunnelEvent, type FunnelProps } from '@/lib/vercel-analytics'

type CampaignName = NonNullable<FunnelProps['campaign']>
type CampaignEvent =
  | typeof VERCEL_FUNNEL_EVENTS.campaignSignupClick
  | typeof VERCEL_FUNNEL_EVENTS.campaignPricingClick
  | typeof VERCEL_FUNNEL_EVENTS.campaignWhatsappClick

type CampaignTrackedLinkProps = {
  href: string
  eventName: CampaignEvent
  campaign: CampaignName
  plan?: FunnelProps['plan']
  preserveAttribution?: boolean
  variant?: ComponentProps<typeof LinkButton>['variant']
  size?: ComponentProps<typeof LinkButton>['size']
  className?: string
  children: ReactNode
}

function appendAttribution(href: string): string | null {
  if (typeof window === 'undefined') return null

  const attribution = snapshotFromLocation()
  if (!attribution) return null

  const destination = new URL(href, window.location.origin)
  for (const key of ATTRIBUTION_KEYS) {
    const value = attribution.params[key]
    if (value && !destination.searchParams.has(key)) {
      destination.searchParams.set(key, value)
    }
  }

  return `${destination.pathname}${destination.search}${destination.hash}`
}

export function CampaignTrackedLink({
  href,
  eventName,
  campaign,
  plan,
  preserveAttribution = false,
  variant,
  size,
  className,
  children,
}: CampaignTrackedLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    trackFunnelEvent(eventName, { campaign, plan })

    if (preserveAttribution && href === '/auth/sign-up') {
      const attributedHref = appendAttribution(href)
      if (attributedHref) event.currentTarget.href = attributedHref
    }
  }

  return (
    <LinkButton
      href={href}
      variant={variant}
      size={size}
      className={className}
      onClick={handleClick}
    >
      {children}
    </LinkButton>
  )
}
