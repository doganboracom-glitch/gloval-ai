'use client'

import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { AdsScrollRow } from '@/components/ads/ads-scroll-row'
import { cn } from '@/lib/utils'

export type AdsTabId = 'overview' | 'plans' | 'management' | 'reports' | 'settings'

export const ADS_TAB_IDS: readonly AdsTabId[] = ['overview', 'plans', 'management', 'reports', 'settings']

export function adsTabLabel(tab: AdsTabId, isTr: boolean): string {
  const labels: Record<AdsTabId, [string, string]> = {
    overview: ['Genel Bakış', 'Overview'],
    plans: ['Planlar', 'Plans'],
    management: ['Yönetim', 'Management'],
    reports: ['Raporlar', 'Reports'],
    settings: ['Ayarlar', 'Settings'],
  }
  return labels[tab][isTr ? 0 : 1]
}

export function adsTabId(tab: AdsTabId) {
  return `ads-tab-${tab}`
}

export function adsPanelId(tab: AdsTabId) {
  return `ads-panel-${tab}`
}

export function AdsTabList({
  active,
  onChange,
  isTr,
  label,
  tabs = ADS_TAB_IDS,
}: {
  active: AdsTabId
  onChange: (tab: AdsTabId) => void
  isTr: boolean
  label?: string
  tabs?: readonly AdsTabId[]
}) {
  const refs = useRef<Partial<Record<AdsTabId, HTMLButtonElement | null>>>({})

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const index = tabs.indexOf(active)
    const last = tabs.length - 1
    const next = event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
        : event.key === 'Home' ? 0
          : event.key === 'End' ? last
            : null
    if (next === null) return
    event.preventDefault()
    const tab = tabs[next]
    onChange(tab)
    refs.current[tab]?.focus()
  }

  return (
    <AdsScrollRow
      role="tablist"
      aria-label={label ?? (isTr ? 'Reklam bölümleri' : 'Ads sections')}
      aria-orientation="horizontal"
      activeKey={active}
      onKeyDown={onKeyDown}
      className="border-b border-border"
    >
      {tabs.map((tab) => {
        const selected = tab === active
        return (
          <button
            key={tab}
            ref={(node) => { refs.current[tab] = node }}
            id={adsTabId(tab)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={adsPanelId(tab)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab)}
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              selected
                ? 'border-brand bg-brand text-brand-foreground'
                : 'border-border bg-transparent text-muted-foreground hover:border-brand/50 hover:bg-brand/10 hover:text-foreground',
            )}
          >
            {adsTabLabel(tab, isTr)}
          </button>
        )
      })}
    </AdsScrollRow>
  )
}

export function AdsTabPanel({ tab, active, children }: { tab: AdsTabId; active: AdsTabId; children: ReactNode }) {
  return (
    <div id={adsPanelId(tab)} role="tabpanel" aria-labelledby={adsTabId(tab)} hidden={tab !== active} className="flex flex-col gap-6 pt-6">
      {children}
    </div>
  )
}
