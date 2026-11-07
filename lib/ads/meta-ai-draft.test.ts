import { describe, expect, it } from 'vitest'
import { draftMetaCopyFromScan } from '@/lib/ads/meta-ai-draft'
import { evaluateMetaCopyPolicy } from '@/lib/ads/meta-ad-policy'
import { META_PLAN_LIMITS } from '@/lib/ads/meta-publish-plan'
import { hasMetaManagement, metaAccessLabel } from '@/lib/ads/meta-ads-shared'

describe('draftMetaCopyFromScan', () => {
  it('maps scan copy onto Meta fields within limits and picks a sector CTA', () => {
    const draft = draftMetaCopyFromScan({
      plan: { sector: 'retail' },
      ad: { headlines: ['x'.repeat(200), 'ikinci'], descriptions: ['Birinci açıklama.', 'İkinci açıklama.'] },
    })
    expect(draft).not.toBeNull()
    expect(draft!.cta).toBe('SHOP_NOW')
    expect(draft!.headline.length).toBeLessThanOrEqual(META_PLAN_LIMITS.headline)
    expect(draft!.description.length).toBeLessThanOrEqual(META_PLAN_LIMITS.description)
    expect(draft!.primaryText.length).toBeLessThanOrEqual(META_PLAN_LIMITS.primaryText)
    expect(draft!.primaryText).toContain('Birinci açıklama.')
  })

  it('falls back to LEARN_MORE for unknown sectors', () => {
    const draft = draftMetaCopyFromScan({ plan: { sector: 'unknown' }, ad: { headlines: ['Başlık'], descriptions: ['Metin'] } })
    expect(draft?.cta).toBe('LEARN_MORE')
  })

  it('returns null when the scan has no usable copy', () => {
    expect(draftMetaCopyFromScan({ plan: { sector: 'retail' }, ad: { headlines: [' '], descriptions: ['Metin'] } })).toBeNull()
    expect(draftMetaCopyFromScan({ plan: { sector: 'retail' }, ad: { headlines: ['Başlık'], descriptions: [] } })).toBeNull()
  })
})

describe('evaluateMetaCopyPolicy', () => {
  it('passes ordinary copy', () => {
    expect(evaluateMetaCopyPolicy(['Yeni sezon ürünlerimizi keşfedin'])).toEqual({ blocked: [], warnings: [] })
  })

  it('blocks guaranteed-income and personal-attribute copy', () => {
    expect(evaluateMetaCopyPolicy(['Garantili kazanç sizi bekliyor']).blocked.length).toBeGreaterThan(0)
    expect(evaluateMetaCopyPolicy(['Borcun mu var? Çözüm burada']).blocked.length).toBeGreaterThan(0)
  })

  it('only warns about finance topics', () => {
    const verdict = evaluateMetaCopyPolicy(['Uygun kredi ve faiz seçenekleri'])
    expect(verdict.blocked).toEqual([])
    expect(verdict.warnings.length).toBeGreaterThan(0)
  })
})

describe('Meta access labels', () => {
  it('reports management only when no publish scope is missing', () => {
    expect(hasMetaManagement({ missingPublishScopes: [] })).toBe(true)
    expect(hasMetaManagement({ missingPublishScopes: ['ads_management'] })).toBe(false)
  })

  it('only says read-only while management is not granted', () => {
    expect(metaAccessLabel(false, true)).toBe('Salt okunur')
    expect(metaAccessLabel(true, true)).not.toBe('Salt okunur')
    expect(metaAccessLabel(true, false)).toContain('paused')
  })
})
