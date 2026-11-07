'use client'

import { useRef, type KeyboardEvent, type ReactNode } from 'react'
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
}: {
  active: AdsTabId
  onChange: (tab: AdsTabId) => void
  isTr: boolean
}) {
  const refs = useRef<Partial<Record<AdsTabId, HTMLButtonElement | null>>>({})

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = ADS_TAB_IDS.length - 1
    const next = event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
        : event.key === 'Home' ? 0
          : event.key === 'End' ? last
            : null
    if (next === null) return
    event.preventDefault()
    const tab = ADS_TAB_IDS[next]
    onChange(tab)
    refs.current[tab]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={isTr ? 'Google Ads bölümleri' : 'Google Ads sections'}
      className="flex gap-1 overflow-x-auto border-b border-border"
    >
      {ADS_TAB_IDS.map((tab, index) => {
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
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              '-mb-px shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected ? 'border-brand text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {adsTabLabel(tab, isTr)}
          </button>
        )
      })}
    </div>
  )
}

export function AdsTabPanel({ tab, active, children }: { tab: AdsTabId; active: AdsTabId; children: ReactNode }) {
  return (
    <div id={adsPanelId(tab)} role="tabpanel" aria-labelledby={adsTabId(tab)} hidden={tab !== active} className="flex flex-col gap-6 pt-6">
      {children}
    </div>
  )
}
