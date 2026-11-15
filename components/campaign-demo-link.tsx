'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { VERCEL_FUNNEL_EVENTS, trackFunnelEvent, type FunnelProps } from '@/lib/vercel-analytics'

type CampaignName = NonNullable<FunnelProps['campaign']>

type CampaignDemoLinkProps = {
  href: string
  ariaLabel: string
  className: string
  campaign: CampaignName
  demo: string
  children: ReactNode
}

export function CampaignDemoLink({
  href,
  ariaLabel,
  className,
  campaign,
  demo,
  children,
}: CampaignDemoLinkProps) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener"
      aria-label={ariaLabel}
      onClick={() =>
        trackFunnelEvent(VERCEL_FUNNEL_EVENTS.campaignDemoClick, {
          campaign,
          demo,
        })
      }
      className={className}
    >
      {children}
    </Link>
  )
}
