import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import { fallbackWebsite } from '@/lib/website-schema'

/**
 * A site published before the About detail page existed carries no `detail`.
 * Its public HTML must stay byte-identical to what `main` rendered; the
 * snapshots were generated on `main` before this feature landed.
 */
describe('legacy published sites render the same HTML as before', () => {
  for (const lang of ['tr', 'en'] as const) {
    it(`home page / ${lang}`, async () => {
      const site = fallbackWebsite('kahve dükkanı ve atölye', lang)
      const html = renderToStaticMarkup(<WebsiteRenderer site={site} pageRouting initialPage={null} />)
      await expect(html).toMatchFileSnapshot(`./__snapshots__/published-legacy-home-${lang}.html`)
    })
  }
})
