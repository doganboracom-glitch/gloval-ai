'use client'

import { useLanguage } from '@/components/language-provider'
import { cn } from '@/lib/utils'

type PlatformKey = 'Google' | 'Meta' | 'Tiktok' | 'Linkedin' | 'X'

const PLATFORMS: ReadonlyArray<{ key: PlatformKey; active: boolean }> = [
  { key: 'Google', active: true },
  { key: 'Meta', active: false },
  { key: 'Tiktok', active: false },
  { key: 'Linkedin', active: false },
  { key: 'X', active: false },
]

export function AdsPlatformGrid() {
  const { t } = useLanguage()
  const copy = t.ads

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {PLATFORMS.map(({ key, active }) => {
        const name = copy[`platform${key}Name`]
        const body = copy[`platform${key}Body`]
        return (
          <li
            key={key}
            className={cn(
              'flex flex-col gap-2 rounded-2xl border bg-card p-5',
              active ? 'border-brand/40' : 'border-border opacity-80',
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-foreground">{name}</h3>
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-medium',
                  active ? 'bg-brand/15 text-brand' : 'bg-secondary text-muted-foreground',
                )}
              >
                {active ? copy.activeLabel : copy.comingSoon}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
          </li>
        )
      })}
    </ul>
  )
}
