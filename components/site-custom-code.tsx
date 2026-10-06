import { hasCode } from '@/lib/site-tracking'

/**
 * Injects one owner-supplied code snippet into the published page, verbatim.
 *
 * The markup is server-rendered as part of the initial HTML document, so any
 * `<script>` inside it is parsed and executed by the browser exactly as it
 * would be if pasted straight into the page source. The snippet is NEVER
 * escaped or rewritten — Google Analytics, GTM and Meta Pixel snippets work
 * as-is.
 *
 * The wrapper is `display: none` and `aria-hidden` so tracking markup (GTM's
 * `<noscript>` iframe, pixel `<img>`) never affects layout or screen readers.
 */
export function SiteCustomCode({ code }: { code?: string | null }) {
  if (!hasCode(code)) return null
  return (
    <div
      aria-hidden="true"
      style={{ display: 'none' }}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: code as string }}
    />
  )
}
