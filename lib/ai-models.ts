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
  | 'logoEmblem'

const STANDARD_MODEL = 'openai/gpt-5-mini'

/** Approved after the model comparison (see reports/ai-model-compare-pipeline.md). */
const ADVANCED_MODEL = 'anthropic/claude-sonnet-5.5'

/** Change the `advanced` line to switch every eligible flow for PRO+ at once. */
export const AI_TIER_MODELS: Record<AiTier, string> = {
  standard: STANDARD_MODEL,
  advanced: ADVANCED_MODEL,
}

/**
 * The single switch for every "Gelişmiş AI" promise (pricing rows, editor and
 * create-screen badge). It is on only while the advanced model really differs
 * from the standard one, so the product never advertises a difference that
 * does not exist.
 */
export const ADVANCED_AI_DISTINCT = AI_TIER_MODELS.advanced !== AI_TIER_MODELS.standard

export type AdvancedAiBadgeState = 'active' | 'locked' | null

/**
 * What the editor badge shows. Both the "active" mark (PRO+) and the "locked"
 * mark (everyone else) are gated by the one `distinct` flag: while the advanced
 * model equals the standard one nothing is shown at all, not even a lock.
 * `distinct` defaults to the live flag and is only passed explicitly by tests.
 */
export function advancedAiBadgeState(
  plan: string | null | undefined,
  distinct: boolean = ADVANCED_AI_DISTINCT,
): AdvancedAiBadgeState {
  if (!distinct || !plan) return null
  return tierForPlan(plan) === 'advanced' ? 'active' : 'locked'
}

/**
 * Whether a flow may use the advanced tier. `sitePlan` is the cheap landing
 * page sketch and stays on the standard tier. `blogWrite` is reserved for the
 * upcoming blog writer and has no caller yet.
 *
 * `siteEdit` and `sectionEdit` stay standard on purpose: the edit-quality
 * evaluation (reports/ai-edit-quality.md) found no quality gain from the
 * advanced model on edits (the fixes are deterministic guards, not model
 * strength), so PRO must not be promised a better editor.
 */
export const AI_FLOW_ADVANCED: Record<AiFlow, boolean> = {
  siteGenerate: true,
  sitePlan: false,
  siteEdit: false,
  sectionEdit: false,
  productText: true,
  blogWrite: true,
  logoEmblem: true,
}

/**
 * Flows that do not use the shared tier table. The logo emblem is drawn as SVG
 * code by an LLM, and the comparison (reports/logo-model-compare.html) showed
 * the Claude models clearly ahead of the general standard model for that job:
 * Sonnet for every plan, Opus on the advanced tier (PRO, E-COMMERCE).
 */
export const AI_FLOW_TIER_MODELS: Partial<Record<AiFlow, Record<AiTier, string>>> = {
  logoEmblem: {
    standard: 'anthropic/claude-sonnet-5.5',
    advanced: 'anthropic/claude-opus-5.5',
  },
}

/**
 * A model that is tried once, in the same round, when the flow's primary model
 * errors or times out. Only the advanced logo tier has one: Opus drops to Sonnet.
 */
export const AI_FLOW_FALLBACK_MODELS: Partial<Record<AiFlow, Partial<Record<AiTier, string>>>> = {
  logoEmblem: { advanced: 'anthropic/claude-sonnet-5.5' },
}

/**
 * Per-attempt time budget. Opus draws a logo in about 14 s, so 45 s leaves room
 * for a slow call without letting a stuck one eat the round; Sonnet is faster
 * and gets the longer budget because it is also the retry/fallback model.
 * Worst case for one emblem is Opus 45 s + Sonnet 60 s, well inside the
 * route's 300 s limit.
 */
export const AI_MODEL_ATTEMPT_TIMEOUT_MS: Record<string, number> = {
  'anthropic/claude-opus-5.5': 45_000,
  'anthropic/claude-sonnet-5.5': 60_000,
}
export const DEFAULT_ATTEMPT_TIMEOUT_MS = 60_000

export function attemptTimeoutMs(model: string): number {
  return AI_MODEL_ATTEMPT_TIMEOUT_MS[model] ?? DEFAULT_ATTEMPT_TIMEOUT_MS
}

/** The same-round fallback model for a selection, or `null` when it has none. */
export function fallbackModelFor(selection: AiModelSelection): string | null {
  const model = AI_FLOW_FALLBACK_MODELS[selection.flow]?.[selection.tier]
  return model && model !== selection.model ? model : null
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
  return { flow, tier, model: AI_FLOW_TIER_MODELS[flow]?.[tier] ?? AI_TIER_MODELS[tier], plan: planCode }
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
  attempt: 'first' | 'retry' = 'first',
): void {
  console.info('[ai-usage]', {
    flow: selection.flow,
    tier: selection.tier,
    model: selection.model,
    plan: selection.plan,
    outcome,
    attempt,
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
  })
}
