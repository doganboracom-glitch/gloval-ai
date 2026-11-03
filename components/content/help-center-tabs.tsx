import Link from 'next/link'
import { cn } from '@/lib/utils'
import { HELP_CENTER_COPY, localizedGuideHref, type GuideLocale } from '@/lib/content/guides'

type HelpCenterTab = 'faq' | 'guides'

export function HelpCenterTabs({
  active,
  locale,
}: {
  active: HelpCenterTab
  locale: GuideLocale
}) {
  const copy = HELP_CENTER_COPY[locale]
  const tabs = [
    { id: 'faq' as const, label: copy.tabs.faq, href: localizedGuideHref('/sss', locale) },
    { id: 'guides' as const, label: copy.tabs.guides, href: localizedGuideHref('/sss/rehber', locale) },
    { id: 'blog' as const, label: copy.tabs.blog, href: localizedGuideHref('/blog', locale) },
  ]

  return (
    <nav aria-label={copy.tabsLabel} className="flex flex-wrap justify-center gap-2">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          aria-current={active === tab.id ? 'page' : undefined}
          className={cn(
            'inline-flex min-h-10 items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            active === tab.id
              ? 'bg-brand text-brand-foreground'
              : 'border border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
