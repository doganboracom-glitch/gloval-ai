import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import { fallbackWebsite } from '@/lib/website-schema'
import type { Section, WebsiteSchema } from '@/lib/website-schema'

/**
 * A site published before the demo reviews existed (no `pageEnabled`, no `sample`, no avatars) must render
 * byte for byte as before. The fixture was captured from the renderer before the demo review change.
 */
const FIXTURE = join(__dirname, '__fixtures__', 'published-testimonials.html')

function legacySite(): WebsiteSchema {
  const site = fallbackWebsite('"Örnek Atölye" için kurumsal bir site', 'tr')
  const sections: Section[] = site.sections.filter((s) => s.type !== 'testimonials')
  const at = Math.max(0, sections.findIndex((s) => s.type === 'contact'))
  sections.splice(at, 0, {
    type: 'testimonials',
    title: 'Müşterilerimiz ne diyor',
    items: [
      { quote: 'Teslimat zamanında oldu, iletişim açıktı.', author: 'Deniz T.', role: 'Müşteri' },
      { quote: 'İşi anlattığım gibi yaptılar.', author: 'Mert A.' },
      { quote: 'Tekrar çalışırım.', author: 'Selin B.', role: 'Ankara' },
    ],
  })
  return { ...site, sections }
}

describe('published site with a legacy testimonials section', () => {
  const html = renderToStaticMarkup(<WebsiteRenderer site={legacySite()} pageRouting initialPage={null} />)

  it('renders the same HTML as before demo reviews existed', () => {
    if (!existsSync(FIXTURE)) writeFileSync(FIXTURE, html)
    expect(html).toBe(readFileSync(FIXTURE, 'utf8'))
  })

  it('has no example label and no all-reviews link', () => {
    expect(html).not.toContain('Örnek yorum')
    expect(html).not.toContain('musteri-yorumlari')
  })
})
