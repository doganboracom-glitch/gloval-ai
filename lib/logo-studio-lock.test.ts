import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { canUseLogoGeneration, UPGRADE_PROMPTS } from './pricing-config'

describe('logo studio plan lock', () => {
  it('is closed on FREE and open on STARTER and PRO', () => {
    expect(canUseLogoGeneration('free')).toBe(false)
    expect(canUseLogoGeneration('starter')).toBe(true)
    expect(canUseLogoGeneration('pro')).toBe(true)
  })

  it('upgrade copy names Starter and PRO and keeps own-logo upload free', () => {
    const prompt = UPGRADE_PROMPTS.logoStudio
    expect(prompt.title).toContain('Starter ve PRO')
    expect(prompt.description).toContain('tüm paketlerde ücretsizdir')
  })

  it('the API route checks the plan on the server before any mode runs', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/logo-image/route.ts'), 'utf8')
    const planCheck = src.indexOf('canUseLogoGeneration(planCode)')
    expect(planCheck).toBeGreaterThan(-1)
    expect(src).toContain("code: 'plan_required'")
    expect(src).toContain('status: 403')
    expect(src.indexOf("mode === 'ai'", planCheck)).toBeGreaterThan(planCheck)
    expect(src.indexOf('supabase.auth.getUser()')).toBeLessThan(planCheck)
  })
})
