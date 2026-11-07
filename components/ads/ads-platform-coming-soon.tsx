import { Clock } from 'lucide-react'
import type { AdsPlatformDefinition } from '@/lib/ads/platforms'
import type { Dict } from '@/lib/i18n'

type AdsCopy = Dict['ads']

export function AdsPlatformComingSoon({
  platform,
  copy,
  reason,
}: {
  platform: AdsPlatformDefinition
  copy: AdsCopy
  reason: 'coming_soon' | 'limited'
}) {
  const name = copy[platform.nameKey]
  const body = (reason === 'limited' ? copy.platformLimitedBody : copy.platformComingSoonBody).replace('{name}', name)

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="ads-platform-notice"
      className="flex items-start gap-3 rounded-2xl border border-dashed border-border bg-card/50 p-4"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-border/70 bg-secondary/40 text-muted-foreground">
        <Clock className="size-4" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-semibold">{reason === 'limited' ? copy.platformLimitedAccess : copy.platformComingSoonTitle}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  )
}
