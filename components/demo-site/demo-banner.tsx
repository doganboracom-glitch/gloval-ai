import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { DEMO_BANNER_HEIGHT_PX } from '@/lib/demo-chrome'

/**
 * Thin sticky banner shown on every demo page (home and sub-pages) so visitors
 * know the site is a generated example. Its height comes from
 * `DEMO_BANNER_HEIGHT_PX`, the single source the sticky header offset also uses.
 */
export function DemoBanner({ backLabel, badge }: { backLabel: string; badge: string }) {
  return (
    <div
      data-demo-banner
      style={{ height: DEMO_BANNER_HEIGHT_PX }}
      className="sticky top-0 z-50 flex items-center justify-between gap-4 overflow-hidden whitespace-nowrap border-b border-black/10 bg-black px-4 text-white"
    >
      <Link
        href="/#showcase"
        className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-white/90 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Link>
      <span className="inline-flex min-w-0 items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" aria-hidden />
        <span className="truncate">{badge}</span>
      </span>
    </div>
  )
}
