import type { Lang } from '@/lib/i18n'
import { DemoAccountNavButton, DemoCartNavButton } from '@/components/demo-site/demo-store'

/**
 * Account + cart controls for a commerce demo's header. Both point at the demo's
 * own routes / localStorage cart (`/demo/<slug>/hesap`, the demo cart drawer) —
 * never at the real store routes. Rendered on the demo home and every sub-page
 * through `WebsiteHeader`'s `actions` slot so the header is identical everywhere.
 */
export function DemoHeaderActions({ slug, lang }: { slug: string; lang: Lang }) {
  return (
    <>
      <DemoAccountNavButton slug={slug} lang={lang} />
      <DemoCartNavButton lang={lang} />
    </>
  )
}
