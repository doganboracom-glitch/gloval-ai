import { ArrowRight } from 'lucide-react'
import { DEMO_CTA_STRIP_HEIGHT_PX } from '@/lib/demo-chrome'

/**
 * Sticky strip at the bottom of a sector landing demo: says the page is a
 * sample and sends the visitor to gloval.ai. Styled like `DemoBanner` (the top
 * bar) so the two read as one demo frame around the example site. Its height
 * comes from `DEMO_CTA_STRIP_HEIGHT_PX`; the page root reserves the same space.
 */
export function DemoCtaStrip({
  href,
  lead,
  text,
  cta,
}: {
  href: string
  /** Short bold opener, e.g. "Bu bir örnek demodur." */
  lead: string
  text: string
  cta: string
}) {
  return (
    <aside
      data-demo-cta-strip
      aria-label={lead}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-black text-white"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div
        style={{ height: DEMO_CTA_STRIP_HEIGHT_PX }}
        className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4"
      >
        <p className="line-clamp-3 min-w-0 text-pretty text-xs leading-snug text-white/80 sm:text-sm">
          <strong className="font-semibold text-white">{lead}</strong> {text}
        </p>
        {/* A plain anchor on purpose: the attribution capture writes its cookie when a page loads,
            so the campaign URL must be a full page load, not a client-side transition. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href={href}
          data-demo-cta
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-brand px-4 text-sm font-semibold text-brand-foreground outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          {cta}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </a>
      </div>
    </aside>
  )
}
