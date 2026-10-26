import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  PermanentRightsSection,
  type PermanentRightsCopy,
} from '@/components/billing/permanent-rights-section'
import { dictionary } from '@/lib/i18n'
import type { ProjectEntitlementItem } from '@/lib/project-entitlements'

const tr = dictionary.tr.billing as unknown as PermanentRightsCopy
const en = dictionary.en.billing as unknown as PermanentRightsCopy

const OWNED: ProjectEntitlementItem = {
  id: 'e1',
  project_id: 'p1',
  code: 'branding_removal',
  name: 'Copyright kaldirma',
  status: 'active',
  amount_cents: 100000,
  currency: 'TRY',
  granted_at: '2026-01-01T00:00:00Z',
  projectName: 'Luna Mucevher',
} as ProjectEntitlementItem

describe('Kalıcı Haklar boş durumu', () => {
  it('TR: başlık aynı, yeni açıklama, rozet yok', () => {
    const html = renderToStaticMarkup(<PermanentRightsSection items={[]} copy={tr} />)
    expect(html).toContain('Henüz kalıcı hakkın yok.')
    expect(html).toContain('Tek seferlik ödeme ile aldığın bir hizmet olursa burada görünecek.')
    expect(html).not.toContain('Yakında')
    expect(html).not.toContain('rounded-full')
    expect(html).not.toContain('yakında')
  })

  it('EN: yeni başlık ve açıklama, rozet yok', () => {
    const html = renderToStaticMarkup(<PermanentRightsSection items={[]} copy={en} />)
    expect(html).toContain('You have no lifetime entitlements yet.')
    expect(html).toContain('Services you buy with a one-time payment will appear here.')
    expect(html).not.toContain('Coming soon')
    expect(html).not.toContain('rounded-full')
  })
})

describe('Kalıcı Haklar dolu durumu', () => {
  it('sahip olunan hakkı rozet, ad ve fiyatla listeler; boş durum metni yok', () => {
    const html = renderToStaticMarkup(<PermanentRightsSection items={[OWNED]} copy={tr} />)
    expect(html).toContain('Luna Mucevher')
    expect(html).toContain(tr.brandingRight)
    expect(html).toContain(tr.brandingRightHint.replaceAll('"', '&quot;'))
    expect(html).toContain(tr.oneTime)
    expect(html).toContain('rounded-full')
    expect(html).not.toContain('Henüz kalıcı hakkın yok.')
  })
})
