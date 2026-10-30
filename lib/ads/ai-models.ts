import 'server-only'

import { resolveAiModel, type AiFlow, type AiModelSelection } from '@/lib/ai-models'
import { ADS_ENV } from '@/lib/ads/env'

export type AdsAiFlow = Extract<
  AiFlow,
  'adsPlanner' | 'adsPreview' | 'adsRevise' | 'adsOptimization' | 'adsAssistant'
>

/** Env variable that overrides the model of each ads flow. */
const FLOW_ENV: Record<AdsAiFlow, string> = {
  adsPlanner: ADS_ENV.plannerModel,
  adsPreview: ADS_ENV.previewModel,
  adsRevise: ADS_ENV.plannerModel,
  adsOptimization: ADS_ENV.plannerModel,
  adsAssistant: ADS_ENV.assistantModel,
}

/**
 * Per-attempt time budget of the planner, which reads a whole site summary and
 * writes a full campaign. The generic Opus budget (45 s) is too short for it.
 */
export const ADS_PLANNER_TIMEOUT_MS = 90_000

const GATEWAY_MODEL_ID = /^[a-z0-9][a-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/

type Env = Readonly<Record<string, string | undefined>>

/**
 * Model for one ads request. The env value must be a `provider/model` gateway
 * id; anything else is ignored with a warning (the value itself is not logged)
 * and the repo default is used.
 */
export function resolveAdsModel(
  flow: AdsAiFlow,
  plan: string | null | undefined,
  env: Env = process.env,
): AiModelSelection {
  const selection = resolveAiModel(flow, plan)
  const name = FLOW_ENV[flow]
  const override = env[name]?.trim()
  if (!override) return selection
  if (!GATEWAY_MODEL_ID.test(override)) {
    console.warn(`[ads-ai-models] ${name} is not a provider/model id; using the default`)
    return selection
  }
  return { ...selection, model: override }
}
