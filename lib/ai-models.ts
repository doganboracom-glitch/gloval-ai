import { toPlanCode, type PlanCode } from '@/lib/pricing-config'

/**
 * The ONE place that decides which language model an AI flow runs on.
 *
 * Two tiers exist: `standard` (FREE, STARTER, anonymous) and `advanced`
 * (PRO, E-COMMERCE). Routes never write a model id themselves; they call
 * `resolveAiModel(flow, planCode)` with a plan code that was looked up on the
 * server. Credit prices are NOT affected by the tier (see `lib/ai-credits.ts`).
 *
 * Image generation models (hero, section, product images, try-on, logo) are
 * configured elsewhere on purpose and are not part of the advanced tier.
 */

export type AiTier = 'standard' | 'advanced'

/** Text flows that go through `resolveAiModel`. */
export type AiFlow =
  | 'siteGenerate'
  | 'sitePlan'
  | 'siteEdit'
  | 'sectionEdit'
  | 'productText'
  | 'blogWrite'

const STANDARD_MODEL = 'openai/gpt-5-mini'

/**
 * Change the `advanced` line to switch every eligible flow for PRO+ at once.
 * It equals the standard model until the product owner approves a model.
 */
export const AI_TIER_MODELS: Record<AiTier, string> = {
  standard: STANDARD_MODEL,
  advanced: STANDARD_MODEL,
}

/**
 * The single switch for every "Gelişmiş AI" promise (pricing rows, editor and
 * create-screen badge). It is on only while the advanced model really differs
 * from the standard one, so the product never advertises a difference that
 * does not exist.
 */
export const ADVANCED_AI_DISTINCT = AI_TIER_MODELS.advanced !== AI_TIER_MODELS.standard

/**
 * Whether the advanced-AI promise should be visible for a plan. `distinct`
 * defaults to the live flag and is only passed explicitly by tests.
 */
export function advancedAiVisibleFor(
  plan: string | null | undefined,
  distinct: boolean = ADVANCED_AI_DISTINCT,
): boolean {
  return distinct && tierForPlan(plan) === 'advanced'
}

/**
 * Whether a flow may use the advanced tier. `sitePlan` is the cheap landing
 * page sketch and stays on the standard tier. `blogWrite` is reserved for the
 * upcoming blog writer and has no caller yet.
 */
export const AI_FLOW_ADVANCED: Record<AiFlow, boolean> = {
  siteGenerate: true,
  sitePlan: false,
  siteEdit: true,
  sectionEdit: true,
  productText: true,
  blogWrite: true,
}

const ADVANCED_PLANS: ReadonlySet<PlanCode> = new Set<PlanCode>(['pro', 'ecommerce'])

/** Plan -> tier. Unknown, missing or anonymous plans are `standard`. */
export function tierForPlan(plan: string | null | undefined): AiTier {
  return ADVANCED_PLANS.has(toPlanCode(plan)) ? 'advanced' : 'standard'
}

export type AiModelSelection = {
  flow: AiFlow
  tier: AiTier
  model: string
  plan: PlanCode
}

/**
 * Picks the model for one request. `plan` must come from a server-side lookup
 * (e.g. `getPlanCodeForUser`); it is resolved per request, so a user whose plan
 * drops is back on the standard tier on their very next call.
 */
export function resolveAiModel(flow: AiFlow, plan: string | null | undefined): AiModelSelection {
  const planCode = toPlanCode(plan)
  const tier: AiTier = AI_FLOW_ADVANCED[flow] ? tierForPlan(planCode) : 'standard'
  return { flow, tier, model: AI_TIER_MODELS[tier], plan: planCode }
}

type UsageLike = { inputTokens?: number; outputTokens?: number } | undefined

/**
 * Cost-tracking log line. Carries flow, tier, model, plan code and token counts
 * only: no user id, prompt, site content or generated text.
 */
export function logAiUsage(
  selection: AiModelSelection,
  outcome: 'ok' | 'error',
  usage?: UsageLike,
): void {
  console.info('[ai-usage]', {
    flow: selection.flow,
    tier: selection.tier,
    model: selection.model,
    plan: selection.plan,
    outcome,
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
  })
}
