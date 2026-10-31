'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/components/language-provider'
import { isAdsFeatureUiEnabled } from '@/lib/ads/feature-flag'
import { cn } from '@/lib/utils'

const ADS_ROUTE_TRANSITION_CLASS = 'ads-route-transition'
const ADS_ROUTE_TRANSITION_CLEANUP_MS = 680

type AdsTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> }
}

function navigateWithAdsTransition(navigate: () => void) {
  const root = document.documentElement
  root.classList.add(ADS_ROUTE_TRANSITION_CLASS)
  window.setTimeout(() => root.classList.remove(ADS_ROUTE_TRANSITION_CLASS), ADS_ROUTE_TRANSITION_CLEANUP_MS)

  let navigationStarted = false
  const navigateOnce = () => {
    if (navigationStarted) return
    navigationStarted = true
    navigate()
  }

  const transitionDocument = document as AdsTransitionDocument
  if (typeof transitionDocument.startViewTransition === 'function') {
    try {
      transitionDocument.startViewTransition(navigateOnce)
      return
    } catch {
      navigateOnce()
      return
    }
  }

  navigateOnce()
}

function handleProductSwitchClick(
  event: React.MouseEvent<HTMLAnchorElement>,
  navigate: () => void,
) {
  const link = event.currentTarget
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    link.hasAttribute('download') ||
    (link.target && link.target !== '_self')
  ) {
    return
  }

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  event.preventDefault()
  navigateWithAdsTransition(navigate)
}

export function AdsProductSwitch({
  active,
  className,
}: {
  active: 'build' | 'ads'
  className?: string
}) {
  const { t } = useLanguage()
  const router = useRouter()
  const copy = t.ads

  if (!isAdsFeatureUiEnabled()) return null

  const items = [
    { key: 'build', href: '/', label: copy.switchBuild },
    { key: 'ads', href: '/ads', label: copy.switchAds },
  ] as const

  return (
    <nav
      aria-label={copy.switchLabel}
      className={cn('flex w-fit max-w-full items-center rounded-full border border-border bg-card p-1', className)}
    >
      {items.map((item) => {
        const isActive = item.key === active
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            onClick={(event) => {
              if (isActive) return
              handleProductSwitchClick(event, () => router.push(item.href))
            }}
            className={cn(
              'flex min-h-11 items-center justify-center whitespace-nowrap rounded-full px-2.5 py-2 text-sm font-medium transition-colors sm:px-4',
              isActive
                ? 'bg-brand text-brand-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
