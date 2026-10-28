// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRef } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { BackToTop } from '@/components/website-renderer/back-to-top'
import { GlovalBadge } from '@/components/website-renderer/gloval-badge'
import { SiteFloatingActions } from '@/components/website-renderer/site-floating-actions'
import { COOKIE_BANNER_CLASS, COOKIE_BANNER_SITE_CLASS } from '@/lib/cookie-banner-layout'
import type { WebsiteSchema } from '@/lib/website-schema'

/**
 * The site cookie card lifts the published site's fixed controls through the
 * selector in globals.css, because published HTML must not gain new classes.
 * That only works while the controls still carry the classes the selector
 * names. These tests render the REAL components and match the REAL selector
 * read from the stylesheet, so a renamed z-index or a dropped `fixed` fails
 * here instead of silently leaving the controls under the card.
 */

function liftedSelector(): string {
  const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')
  const rule = css.match(/html\[data-cookie-banner-site\] :is\((.+?)\)\s*\{\s*translate:/)
  if (!rule) throw new Error('lift rule for the site cookie card not found in globals.css')
  // CSS escapes `[` / `]` in the class name; querySelector wants the same escaping.
  return rule[1]
}

const site = {
  meta: { language: 'tr' },
  sections: [],
  pages: [],
  contactActions: { enabled: true, phone: '+905321234567', whatsapp: '+905321234567' },
} as unknown as WebsiteSchema

afterEach(cleanup)

describe('site cookie card: fixed controls stay matched by the lift selector', () => {
  it('matches the phone + WhatsApp stack', () => {
    const { container } = render(<SiteFloatingActions site={site} />)
    expect(container.querySelectorAll(liftedSelector()).length).toBe(1)
  })

  it('matches the back-to-top button', () => {
    const { container } = render(
      <BackToTop anchorRef={createRef<HTMLElement>() as never} lang="tr" resetKey="home" />,
    )
    expect(container.querySelectorAll(liftedSelector()).length).toBe(1)
  })

  it('matches the floating Gloval credit, but not the inline footer chip', () => {
    const floating = render(<GlovalBadge variant="floating" />)
    expect(floating.container.querySelectorAll(liftedSelector()).length).toBe(1)
    floating.unmount()
    const inline = render(<GlovalBadge variant="inline" />)
    expect(inline.container.querySelectorAll(liftedSelector()).length).toBe(0)
  })

  it('never matches the cookie card itself (it must not lift itself)', () => {
    for (const cls of [COOKIE_BANNER_CLASS, COOKIE_BANNER_SITE_CLASS]) {
      const el = document.createElement('div')
      el.className = cls
      document.body.appendChild(el)
      expect(el.matches(liftedSelector())).toBe(false)
      el.remove()
    }
  })
})
