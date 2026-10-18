import type { Metadata } from 'next'
import { SiteUnpublished } from '@/components/site/site-unpublished'

/**
 * Boundary for `app/site/[slug]/layout.tsx` calling `notFound()` when no
 * published site answers the slug (never published, unpublished, suspended or
 * deleted). A layout's own segment `not-found` cannot catch its throw, so the
 * notice lives one level up. Next sends HTTP 404 for it; published sites keep
 * their own `[slug]/not-found.tsx` for missing pages.
 */
export const metadata: Metadata = {
  title: 'Site yayında değil',
  robots: { index: false, follow: false },
}

export default function ClosedSiteNotFound() {
  return <SiteUnpublished />
}
