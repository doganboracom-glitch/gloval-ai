import { describe, expect, it } from 'vitest'
import {
  ADVANCED_AI_DISTINCT,
  AI_TIER_MODELS,
  advancedAiBadgeState,
  resolveAiModel,
  tierForPlan,
} from '@/lib/ai-models'
import { buildComparison, buildPlanView } from '@/lib/plan-copy'
import type { PlanCode } from '@/lib/pricing-config'

const CODES: PlanCode[] = ['free', 'starter', 'pro', 'ecommerce']

describe('advanced AI visibility while the advanced model equals the standard one', () => {
  it('the live flag mirrors the model table', () => {
    expect(ADVANCED_AI_DISTINCT).toBe(AI_TIER_MODELS.advanced !== AI_TIER_MODELS.standard)
  })

  it('shows no badge for any plan (not even the locked one) when the models are identical', () => {
    for (const code of [...CODES, null, undefined, 'unknown']) {
      expect(advancedAiBadgeState(code, false)).toBeNull()
    }
  })

  it('shows no pricing row for any plan when the models are identical', () => {
    for (const code of CODES) {
      const ids = buildPlanView(code, 'yearly', 'tr', { advancedAi: false }).groups.flatMap((g) =>
        g.items.map((i) => i.id),
      )
      expect(ids).not.toContain('advancedAi')
    }
    for (const lang of ['tr', 'en']) {
      const labels = buildComparison(lang, { advancedAi: false })
        .flatMap((g) => g.rows)
        .map((r) => r.label)
      expect(labels.some((l) => /Gelişmiş AI|Advanced AI/.test(l))).toBe(false)
    }
  })

  it('the live, unmodified flag hides everything as long as the models match', () => {
    if (ADVANCED_AI_DISTINCT) return
    for (const code of CODES) {
      expect(advancedAiBadgeState(code)).toBeNull()
      const ids = buildPlanView(code, 'yearly', 'tr').groups.flatMap((g) => g.items.map((i) => i.id))
      expect(ids).not.toContain('advancedAi')
    }
  })
})

describe('advanced AI visibility once the advanced model differs', () => {
  it('PRO and e-commerce get the active mark, everyone else the locked one', () => {
    expect(advancedAiBadgeState('pro', true)).toBe('active')
    expect(advancedAiBadgeState('ecommerce', true)).toBe('active')
    expect(advancedAiBadgeState('free', true)).toBe('locked')
    expect(advancedAiBadgeState('starter', true)).toBe('locked')
  })

  it('stays hidden while the plan is still unknown', () => {
    expect(advancedAiBadgeState(null, true)).toBeNull()
    expect(advancedAiBadgeState(undefined, true)).toBeNull()
  })

  it('shows the pricing row on the PRO card, which e-commerce inherits', () => {
    for (const code of CODES) {
      const ids = buildPlanView(code, 'yearly', 'tr', { advancedAi: true }).groups.flatMap((g) =>
        g.items.map((i) => i.id),
      )
      expect(ids.includes('advancedAi')).toBe(code === 'pro')
    }
  })
})

describe('model resolution', () => {
  it('maps plans to tiers on the server-side plan code', () => {
    expect(tierForPlan('pro')).toBe('advanced')
    expect(tierForPlan('ecommerce')).toBe('advanced')
    expect(tierForPlan('free')).toBe('standard')
    expect(tierForPlan(null)).toBe('standard')
  })

  it('keeps the landing-page plan sketch on the standard tier', () => {
    expect(resolveAiModel('sitePlan', 'pro').tier).toBe('standard')
    expect(resolveAiModel('siteGenerate', 'pro').tier).toBe('advanced')
  })

  it('draws logo emblems with Sonnet on every plan and Opus on the advanced tier', () => {
    for (const plan of ['free', 'starter', null, undefined, 'unknown']) {
      expect(resolveAiModel('logoEmblem', plan)).toMatchObject({ tier: 'standard', model: 'anthropic/claude-sonnet-5.5' })
    }
    for (const plan of ['pro', 'ecommerce']) {
      expect(resolveAiModel('logoEmblem', plan)).toMatchObject({ tier: 'advanced', model: 'anthropic/claude-opus-5.5' })
    }
  })

  it('leaves the other flows on the shared tier table', () => {
    expect(resolveAiModel('siteEdit', 'pro').model).toBe(AI_TIER_MODELS.advanced)
    expect(resolveAiModel('siteEdit', 'starter').model).toBe(AI_TIER_MODELS.standard)
  })
})
