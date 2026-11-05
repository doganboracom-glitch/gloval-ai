import { describe, expect, it } from 'vitest'
import { buildManualSnapshot, manualPlanSchema } from '@/lib/ads/manual-plan'
import { buildPlannerPrompt } from '@/lib/ads/planner'

const brief = {
  businessName: 'Northline Studio',
  industry: 'Custom furniture',
  services: 'Made-to-measure tables; installation',
  location: 'Ankara, Türkiye',
  language: 'en' as const,
}

describe('manualPlanSchema', () => {
  it('requires bounded business details and defaults the optional service area', () => {
    expect(manualPlanSchema.safeParse({ ...brief, businessName: '' }).success).toBe(false)
    expect(manualPlanSchema.safeParse({ ...brief, services: 'x'.repeat(501) }).success).toBe(false)

    const parsed = manualPlanSchema.parse({
      businessName: brief.businessName,
      industry: brief.industry,
      services: brief.services,
      language: brief.language,
    })
    expect(parsed.location).toBe('')
  })

  it('builds a manual snapshot from user details without treating the address as business evidence', () => {
    const input = manualPlanSchema.parse(brief)
    const snapshot = buildManualSnapshot('northline.example', input)
    const prompt = buildPlannerPrompt(snapshot, 'SITE_DATA_TEST', 'manual')

    expect(snapshot).toMatchObject({
      host: 'northline.example',
      finalHost: 'northline.example',
      language: 'en',
      title: 'Northline Studio',
      siteName: 'Northline Studio',
    })
    expect(snapshot.text).toContain('Business name: Northline Studio')
    expect(snapshot.text).toContain('Industry: Custom furniture')
    expect(snapshot.text).toContain('Products or services: Made-to-measure tables; installation')
    expect(snapshot.text).toContain('Service area: Ankara, Türkiye')
    expect(snapshot.text).not.toContain('northline.example')
    expect(prompt).toContain('Source: User-provided business details; the website was not scanned.')
    expect(prompt).toContain('the business described above')
    expect(prompt).not.toContain('northline.example')
  })
})
