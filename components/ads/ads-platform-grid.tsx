'use client'

import { useLanguage } from '@/components/language-provider'

type PlatformKey = 'Google' | 'Meta' | 'Tiktok' | 'Linkedin' | 'X'

const PLATFORMS: ReadonlyArray<PlatformKey> = ['Google', 'Meta', 'Tiktok', 'Linkedin', 'X']

export function AdsPlatformGrid() {
  const { t } = useLanguage()
  const copy = t.ads

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {PLATFORMS.map((key) => {
        const name = copy[`platform${key}Name`]
        const body = copy[`platform${key}Body`]
        return (
          <li
            key={key}
            className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 opacity-80"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-foreground">{name}</h3>
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                {copy.comingSoon}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
          </li>
        )
      })}
    </ul>
  )
}
