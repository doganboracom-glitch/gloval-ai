import { z } from 'zod'
import { evaluateCopyPolicy } from '@/lib/ads/policy'
import { isCleanText, MODEL_POLICY_EVIDENCE, PLAN_COUNTRIES, PLAN_SECTORS } from '@/lib/ads/planner'
import { fold } from '@/lib/visual-subjects'
import { GoogleAdsError } from '@/lib/ads/google-ads-error'

export type GoogleAdsPublishPlan = z.infer<typeof googleAdsPublishPlanSchema>

export const googleAdsPublishPlanSchema = z.object({
  brand: z.string().min(1).max(80),
  sector: z.enum(PLAN_SECTORS),
  sectorLabel: z.string().max(60),
  services: z.array(z.string().min(1).max(60)).min(1).max(6),
  language: z.enum(['tr', 'en']),
  keywords: z.array(z.string().min(1).max(80)).min(3).max(20),
  negativeKeywords: z.array(z.string().min(1).max(80)).max(8),
  country: z.enum(PLAN_COUNTRIES),
  cities: z.array(z.string().min(1).max(40)).max(5),
  modelPolicyCategory: z.string().max(40).nullable(),
  modelPolicyEvidence: z.enum(MODEL_POLICY_EVIDENCE),
  euPoliticalAdvertising: z.enum(['yes', 'no']).default('no'),
  euPoliticalDeclarationConfirmed: z.boolean().default(false),
  finalUrl: z.string().url().max(2048),
  adCopy: z.object({
    headlines: z.array(z.string().min(1).max(30)).min(3).max(15),
    descriptions: z.array(z.string().min(1).max(90)).min(2).max(4),
    displayUrl: z.string().url().max(2048),
  }),
}).passthrough()

export type GoogleAdsMutateOperation = Record<string, unknown>

export type GoogleAdsMutateRequest = {
  mutateOperations: GoogleAdsMutateOperation[]
  partialFailure: false
  validateOnly: boolean
}

const COUNTRY_GEO_TARGET_IDS: Record<(typeof PLAN_COUNTRIES)[number], string> = {
  TR: '2792',
  US: '2840',
  GB: '2826',
  DE: '2276',
  NL: '2618',
  FR: '2250',
  AE: '2784',
}

const LANGUAGE_CONSTANT_IDS = { en: '1000', tr: '1037' } as const

function invalidPlan(): never {
  throw new GoogleAdsError('invalid_publish_plan')
}

function invalidBudget(): never {
  throw new GoogleAdsError('invalid_budget')
}

function cleanDistinctLines(lines: string[], maxLength: number, headlines: boolean): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const line of lines) {
    const normalized = line.replace(/\s+/g, ' ').trim()
    const key = fold(normalized)
    if (
      normalized !== line ||
      normalized.length === 0 ||
      normalized.length > maxLength ||
      !isCleanText(normalized) ||
      (headlines && normalized.includes('!')) ||
      seen.has(key)
    ) {
      invalidPlan()
    }
    seen.add(key)
    output.push(normalized)
  }
  return output
}

function secureHttpsUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return invalidPlan()
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) return invalidPlan()
  return url
}

function displayPaths(displayUrl: string, finalUrl: string): { path1?: string; path2?: string } {
  const display = secureHttpsUrl(displayUrl)
  const final = secureHttpsUrl(finalUrl)
  if (display.hostname.toLowerCase() !== final.hostname.toLowerCase()) return invalidPlan()

  const parts = display.pathname.split('/').filter(Boolean)
  if (parts.length > 2 || parts.some((part) => part.length > 15 || !/^[a-z0-9-]+$/i.test(part))) {
    return invalidPlan()
  }
  return { ...(parts[0] ? { path1: parts[0] } : {}), ...(parts[1] ? { path2: parts[1] } : {}) }
}

function currencyFractionDigits(currency: string): number {
  if (!/^[A-Z]{3}$/.test(currency)) return invalidBudget()
  try {
    const fractionDigits = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
    if (fractionDigits > 6) return invalidBudget()
    return fractionDigits
  } catch {
    return invalidBudget()
  }
}

export function googleAdsMicrosFromMinorUnits(amountMinor: number, currency: string): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return invalidBudget()
  const fractionDigits = currencyFractionDigits(currency)
  const micros = amountMinor * 10 ** (6 - fractionDigits)
  if (!Number.isSafeInteger(micros) || micros <= 0) return invalidBudget()
  return String(micros)
}

export const GOOGLE_ADS_SUPPORTED_CURRENCIES = ['TRY', 'USD', 'EUR'] as const

export function isSupportedGoogleAdsCurrency(currency: string): boolean {
  return (GOOGLE_ADS_SUPPORTED_CURRENCIES as readonly string[]).includes(currency.toUpperCase())
}

export type GoogleAdsApprovalSummary = {
  termsVersion?: string
  currency: string
  dailyBudgetMinor: number
  budgetCapMinor: number
  currencyFractionDigits: number
  cpcBidCeilingMinor: number
  cpcBidCeilingMicros: string
}

export function buildGoogleAdsApprovalSummary(input: {
  currency: string
  dailyBudgetMinor: number
  budgetCapMinor: number
}): GoogleAdsApprovalSummary {
  if (
    !Number.isSafeInteger(input.dailyBudgetMinor) ||
    !Number.isSafeInteger(input.budgetCapMinor) ||
    input.dailyBudgetMinor <= 0 ||
    input.budgetCapMinor <= 0 ||
    input.dailyBudgetMinor > input.budgetCapMinor
  ) {
    return invalidBudget()
  }

  const fractionDigits = currencyFractionDigits(input.currency)
  const oneCurrencyUnitMinor = 10 ** fractionDigits
  if (input.dailyBudgetMinor < oneCurrencyUnitMinor) return invalidBudget()

  const cpcBidCeilingMinor = Math.min(
    input.dailyBudgetMinor,
    Math.max(oneCurrencyUnitMinor, Math.floor(input.dailyBudgetMinor / 10)),
  )

  return {
    currency: input.currency,
    dailyBudgetMinor: input.dailyBudgetMinor,
    budgetCapMinor: input.budgetCapMinor,
    currencyFractionDigits: fractionDigits,
    cpcBidCeilingMinor,
    cpcBidCeilingMicros: googleAdsMicrosFromMinorUnits(cpcBidCeilingMinor, input.currency),
  }
}

export function parseGoogleAdsPublishPlan(value: unknown): GoogleAdsPublishPlan {
  const parsed = googleAdsPublishPlanSchema.safeParse(value)
  if (!parsed.success) return invalidPlan()

  const plan = parsed.data
  if (
    !isCleanText(plan.brand) ||
    !isCleanText(plan.sectorLabel) ||
    plan.services.some((value) => !isCleanText(value)) ||
    plan.keywords.some((value) => !isCleanText(value)) ||
    plan.negativeKeywords.some((value) => !isCleanText(value)) ||
    plan.cities.some((value) => !isCleanText(value)) ||
    plan.modelPolicyEvidence === 'explicit'
  ) {
    return invalidPlan()
  }

  const headlines = cleanDistinctLines(plan.adCopy.headlines, 30, true)
  const descriptions = cleanDistinctLines(plan.adCopy.descriptions, 90, false)
  if (evaluateCopyPolicy([...headlines, ...descriptions]).verdict !== 'allowed') return invalidPlan()
  secureHttpsUrl(plan.finalUrl)
  displayPaths(plan.adCopy.displayUrl, plan.finalUrl)
  return plan
}

export function buildGoogleAdsMutateRequest(input: {
  customerId: string
  requestId: string
  planJson: unknown
  dailyBudgetMinor: number
  budgetCapMinor: number
  currency: string
  validateOnly: boolean
  geoTargetResourceNames?: string[]
}): GoogleAdsMutateRequest {
  const customerId = input.customerId.replaceAll('-', '')
  if (!/^\d{6,20}$/.test(customerId) || !/^[A-Za-z0-9_-]{8,128}$/.test(input.requestId)) return invalidPlan()
  if (
    !Number.isSafeInteger(input.budgetCapMinor) ||
    input.budgetCapMinor <= 0 ||
    input.dailyBudgetMinor > input.budgetCapMinor
  ) {
    return invalidBudget()
  }

  const plan = parseGoogleAdsPublishPlan(input.planJson)
  if (!plan.euPoliticalDeclarationConfirmed) {
    throw new GoogleAdsError('eu_political_declaration_required')
  }
  const approvalSummary = buildGoogleAdsApprovalSummary({
    currency: input.currency,
    dailyBudgetMinor: input.dailyBudgetMinor,
    budgetCapMinor: input.budgetCapMinor,
  })
  const dailyBudgetMicros = googleAdsMicrosFromMinorUnits(input.dailyBudgetMinor, input.currency)
  const customerResource = `customers/${customerId}`
  const budgetResource = `${customerResource}/campaignBudgets/-1`
  const campaignResource = `${customerResource}/campaigns/-2`
  const adGroupResource = `${customerResource}/adGroups/-3`
  const paths = displayPaths(plan.adCopy.displayUrl, plan.finalUrl)
  const geoTargets = input.geoTargetResourceNames ?? (plan.cities.length === 0
    ? [`geoTargetConstants/${COUNTRY_GEO_TARGET_IDS[plan.country]}`]
    : [])
  if (
    geoTargets.length === 0 ||
    geoTargets.some((resourceName) => !/^geoTargetConstants\/\d{1,20}$/.test(resourceName))
  ) {
    return invalidPlan()
  }
  const requestMarker = `req-${input.requestId.replace(/[^A-Za-z0-9]/g, '').slice(0, 16)}`
  const campaignPrefix = `${plan.brand} - ${plan.sectorLabel || plan.sector}`
  const campaignName = `${campaignPrefix.slice(0, 120 - requestMarker.length - 3).trim()} - ${requestMarker}`
  const adGroupName = `${plan.brand} - Search`.slice(0, 120)
  const operations: GoogleAdsMutateOperation[] = [
    {
      campaignBudgetOperation: {
        create: {
          resourceName: budgetResource,
          name: `${campaignName} budget`,
          amountMicros: dailyBudgetMicros,
          deliveryMethod: 'STANDARD',
          explicitlyShared: false,
        },
      },
    },
    {
      campaignOperation: {
        create: {
          resourceName: campaignResource,
          name: campaignName,
          advertisingChannelType: 'SEARCH',
          status: 'PAUSED',
          campaignBudget: budgetResource,
          targetSpend: { cpcBidCeilingMicros: approvalSummary.cpcBidCeilingMicros },
          networkSettings: {
            targetGoogleSearch: true,
            targetSearchNetwork: false,
            targetContentNetwork: false,
            targetPartnerSearchNetwork: false,
          },
          geoTargetTypeSetting: {
            positiveGeoTargetType: 'PRESENCE',
            negativeGeoTargetType: 'PRESENCE',
          },
          containsEuPoliticalAdvertising: plan.euPoliticalAdvertising === 'yes'
            ? 'CONTAINS_EU_POLITICAL_ADVERTISING'
            : 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
        },
      },
    },
    {
      adGroupOperation: {
        create: {
          resourceName: adGroupResource,
          campaign: campaignResource,
          name: adGroupName,
          type: 'SEARCH_STANDARD',
          status: 'ENABLED',
        },
      },
    },
    ...geoTargets.map((geoTargetConstant) => ({
      campaignCriterionOperation: {
        create: {
          campaign: campaignResource,
          location: { geoTargetConstant },
        },
      },
    })),
    {
      campaignCriterionOperation: {
        create: {
          campaign: campaignResource,
          language: { languageConstant: `languageConstants/${LANGUAGE_CONSTANT_IDS[plan.language]}` },
        },
      },
    },
    ...plan.keywords.map((text) => ({
      adGroupCriterionOperation: {
        create: {
          adGroup: adGroupResource,
          status: 'ENABLED',
          keyword: { text, matchType: 'PHRASE' },
        },
      },
    })),
    ...plan.negativeKeywords.map((text) => ({
      adGroupCriterionOperation: {
        create: {
          adGroup: adGroupResource,
          status: 'ENABLED',
          negative: true,
          keyword: { text, matchType: 'PHRASE' },
        },
      },
    })),
    {
      adGroupAdOperation: {
        create: {
          adGroup: adGroupResource,
          status: 'ENABLED',
          ad: {
            finalUrls: [plan.finalUrl],
            responsiveSearchAd: {
              headlines: plan.adCopy.headlines.map((text) => ({ text })),
              descriptions: plan.adCopy.descriptions.map((text) => ({ text })),
              ...paths,
            },
          },
        },
      },
    },
  ]

  return {
    mutateOperations: operations,
    partialFailure: false,
    validateOnly: input.validateOnly,
  }
}

export function readGoogleAdsCampaignId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const response = payload as { mutateOperationResponses?: unknown; mutate_operation_responses?: unknown }
  const rawResponses = response.mutateOperationResponses ?? response.mutate_operation_responses
  if (!Array.isArray(rawResponses)) return null
  const campaignOperation = rawResponses[1]
  if (!campaignOperation || typeof campaignOperation !== 'object' || Array.isArray(campaignOperation)) return null
  const result = campaignOperation as { campaignResult?: unknown; campaign_result?: unknown }
  const campaignResult = result.campaignResult ?? result.campaign_result
  if (!campaignResult || typeof campaignResult !== 'object' || Array.isArray(campaignResult)) return null
  const resource = campaignResult as { resourceName?: unknown; resource_name?: unknown }
  const resourceName = resource.resourceName ?? resource.resource_name
  if (typeof resourceName !== 'string') return null
  const match = /^customers\/\d{6,20}\/campaigns\/(\d{1,20})$/.exec(resourceName)
  return match?.[1] ?? null
}
