'use client'

import Link from 'next/link'
import { useLanguage } from '@/components/language-provider'
import { cn } from '@/lib/utils'

export function AdsProductSwitch({ active }: { active: 'build' | 'ads' }) {
  const { t } = useLanguage()
  const copy = t.ads

  const items = [
    { key: 'build', href: '/', label: copy.switchBuild },
    { key: 'ads', href: '/ads', label: copy.switchAds },
  ] as const

  return (
    <nav aria-label={copy.switchLabel} className="inline-flex rounded-full border border-border bg-card p-1">
      {items.map((item) => {
        const isActive = item.key === active
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
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
