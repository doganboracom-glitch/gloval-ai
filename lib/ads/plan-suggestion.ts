import { z } from 'zod'
import {
  DESCRIPTION_MAX,
  HEADLINE_MAX,
  MAX_DESCRIPTIONS,
  MAX_HEADLINES,
  MIN_DESCRIPTIONS,
  MIN_HEADLINES,
} from '@/lib/ads/ad-copy'
import { MAX_DAILY_SPEND_FACTOR } from '@/lib/ads/budget'
import { parseGoogleAdsPublishPlan } from '@/lib/ads/google-ads-publish-plan'
import { evaluateCopyPolicy } from '@/lib/ads/policy'
import { isCleanText, PLAN_COUNTRIES, PLAN_SECTORS } from '@/lib/ads/planner'
import { fold } from '@/lib/visual-subjects'

/**
 * Turns a public scan result into the Google Ads workspace form, and enforces
 * Google Ads length/count rules plus the server budget ceiling in code. It is
 * pure: the caller passes the account currency and the server cap, so this runs
 * the same way in a route and in tests.
 */

const MAX_BRAND = 80
const MAX_SECTOR_LABEL = 60
const MAX_SERVICE = 60
const MAX_SERVICES = 6
const MAX_KEYWORD = 80
const MIN_KEYWORDS = 3
const MAX_KEYWORDS = 20
const MAX_NEGATIVE_KEYWORDS = 8
const MAX_CITY = 40
const MAX_CITIES = 5
const MAX_DISPLAY_PATHS = 2
const MAX_DISPLAY_PATH = 15
const HOST_PATTERN = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/

/**
 * Rough TRY -> account currency factors, used only to seed an editable
 * suggestion. They are not a price quote; the UI tells the user to review it.
 */
const APPROX_PER_TRY: Record<string, number> = { TRY: 1, USD: 0.03, EUR: 0.028, GBP: 0.024, AED: 0.11 }
const FALLBACK_DAILY_MAJOR = 10

const text = (max: number) => z.string().max(max)

export const scanResultInputSchema = z.object({
  host: text(253).min(1),
  plan: z.object({
    brand: text(200),
    sector: text(40),
    sectorLabel: text(200),
    services: z.array(text(200)).max(30),
    language: z.enum(['tr', 'en']),
    country: text(10),
    cities: z.array(text(100)).max(30),
    keywords: z.array(text(200)).max(80),
    negativeKeywords: z.array(text(200)).max(40),
  }),
  ad: z.object({
    headlines: z.array(text(300)).max(40),
    descriptions: z.array(text(500)).max(20),
    displayUrl: text(2048),
  }),
  budget: z.object({ daily: z.number().positive().max(10_000_000) }),
  restricted: z.array(text(40)).max(20),
})

export type ScanResultInput = z.infer<typeof scanResultInputSchema>

export type SuggestedPlan = {
  brand: string
  sector: (typeof PLAN_SECTORS)[number]
  sectorLabel: string
  services: string[]
  language: 'tr' | 'en'
  keywords: string[]
  negativeKeywords: string[]
  country: (typeof PLAN_COUNTRIES)[number]
  cities: string[]
  modelPolicyCategory: string | null
  modelPolicyEvidence: 'none' | 'ambiguous'
  aiRecommendedDailyBudgetMinor?: number | null
  euPoliticalAdvertising: 'no'
  euPoliticalDeclarationConfirmed: false
  finalUrl: string
  adCopy: { headlines: string[]; descriptions: string[]; displayUrl: string }
}

export type SuggestedBudget = {
  currency: string
  dailyMinor: number
  capMinor: number
  serverCapMinor: number | null
  /** True when the amount was converted from TRY with a rough factor. */
  approximate: boolean
}

export type PlanSuggestion = {
  plan: SuggestedPlan
  budget: SuggestedBudget | null
  budgetIssue: 'budget_sanity_ceiling_exceeded' | null
  adjustments: { headlinesDropped: number; descriptionsDropped: number; toppedUp: boolean }
}

export type PlanSuggestionResult =
  | { ok: true; suggestion: PlanSuggestion }
  | { ok: false; error: 'invalid_request' | 'invalid_publish_plan' | 'ad_copy_insufficient' | 'keywords_insufficient' }

export function currencyDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
  } catch {
    return 2
  }
}

function squash(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

type LineRules = { max: number; limit: number; headline?: boolean }

/** Keeps only lines that satisfy Google's limits and the copy rules; counts the rest as dropped. */
export function sanitizeLines(values: readonly string[], rules: LineRules): { lines: string[]; dropped: number } {
  const seen = new Set<string>()
  const lines: string[] = []
  let dropped = 0
  for (const value of values) {
    const line = squash(value)
    const key = fold(line)
    const acceptable =
      line.length > 0 &&
      line.length <= rules.max &&
      isCleanText(line) &&
      !(rules.headline && line.includes('!')) &&
      evaluateCopyPolicy([line]).verdict === 'allowed' &&
      !seen.has(key)
    if (!acceptable) {
      dropped++
      continue
    }
    seen.add(key)
    lines.push(line)
  }
  if (lines.length > rules.limit) dropped += lines.length - rules.limit
  return { lines: lines.slice(0, rules.limit), dropped }
}

function cleanDisplayUrl(value: string, host: string): string {
  const fallback = `https://${host}`
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== host) return fallback
    const segments = url.pathname.split('/').filter(Boolean)
    if (segments.length > MAX_DISPLAY_PATHS || segments.some((segment) => segment.length > MAX_DISPLAY_PATH)) return fallback
    return [fallback, ...segments].join('/')
  } catch {
    return fallback
  }
}

function topUpHeadlines(current: string[], input: ScanResultInput, brand: string, services: string[]): string[] {
  const candidates = [brand, ...services, `${brand} ${input.plan.sectorLabel}`, input.host]
  return sanitizeLines([...current, ...candidates], { max: HEADLINE_MAX, limit: MAX_HEADLINES, headline: true }).lines
}

function topUpDescriptions(current: string[], input: ScanResultInput, brand: string): string[] {
  const isTr = input.plan.language === 'tr'
  const candidates = isTr
    ? [`${brand} hakkında bilgi almak için ${input.host} adresini ziyaret edin.`, `${brand} ile tanışın. Ayrıntılar ${input.host} sitesinde.`]
    : [`Visit ${input.host} to learn more about ${brand}.`, `Meet ${brand}. Details are on ${input.host}.`]
  return sanitizeLines([...current, ...candidates], { max: DESCRIPTION_MAX, limit: MAX_DESCRIPTIONS }).lines
}

export function suggestDailyBudget(input: {
  scanDailyTry: number
  currency: string
  serverCapMinor: number | null
}): SuggestedBudget {
  const unit = 10 ** currencyDigits(input.currency)
  const factor = APPROX_PER_TRY[input.currency]
  const approximate = input.currency !== 'TRY'
  const wantedMajor = factor === undefined ? FALLBACK_DAILY_MAJOR : input.scanDailyTry * factor
  const wantedDaily = Math.max(unit, Math.round(wantedMajor * unit))
  const wantedCap = Math.max(wantedDaily, wantedDaily * MAX_DAILY_SPEND_FACTOR)
  return {
    currency: input.currency,
    dailyMinor: wantedDaily,
    capMinor: wantedCap,
    serverCapMinor: input.serverCapMinor,
    approximate,
  }
}

export function buildPlanSuggestion(
  raw: unknown,
  options: { currency: string | null; serverCapMinor: number | null },
): PlanSuggestionResult {
  const parsed = scanResultInputSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'invalid_request' }
  const input = parsed.data
  const host = input.host.toLowerCase()
  if (!HOST_PATTERN.test(host)) return { ok: false, error: 'invalid_request' }

  const brand = squash(input.plan.brand).slice(0, MAX_BRAND).trim() || host
  const sectorLabel = squash(input.plan.sectorLabel).slice(0, MAX_SECTOR_LABEL).trim()
  const sector = PLAN_SECTORS.find((value) => value === input.plan.sector) ?? 'services'
  const country = PLAN_COUNTRIES.find((value) => value === input.plan.country) ?? 'TR'

  const services = sanitizeLines(input.plan.services, { max: MAX_SERVICE, limit: MAX_SERVICES }).lines
  if (services.length === 0) services.push(...sanitizeLines([sectorLabel || brand], { max: MAX_SERVICE, limit: 1 }).lines)

  const keywordPool = [...input.plan.keywords, ...(input.plan.keywords.length < MIN_KEYWORDS ? [brand, ...services] : [])]
  const keywords = sanitizeLines(keywordPool, { max: MAX_KEYWORD, limit: MAX_KEYWORDS }).lines
  if (keywords.length < MIN_KEYWORDS) return { ok: false, error: 'keywords_insufficient' }
  const negatives = sanitizeLines(input.plan.negativeKeywords, { max: MAX_KEYWORD, limit: MAX_NEGATIVE_KEYWORDS }).lines
  const cities = sanitizeLines(input.plan.cities, { max: MAX_CITY, limit: MAX_CITIES }).lines

  const headlineResult = sanitizeLines(input.ad.headlines, { max: HEADLINE_MAX, limit: MAX_HEADLINES, headline: true })
  const descriptionResult = sanitizeLines(input.ad.descriptions, { max: DESCRIPTION_MAX, limit: MAX_DESCRIPTIONS })
  let headlines = headlineResult.lines
  let descriptions = descriptionResult.lines
  let toppedUp = false
  if (headlines.length < MIN_HEADLINES) {
    headlines = topUpHeadlines(headlines, input, brand, services)
    toppedUp = true
  }
  if (descriptions.length < MIN_DESCRIPTIONS) {
    descriptions = topUpDescriptions(descriptions, input, brand)
    toppedUp = true
  }
  if (headlines.length < MIN_HEADLINES || descriptions.length < MIN_DESCRIPTIONS) {
    return { ok: false, error: 'ad_copy_insufficient' }
  }

  const restricted = input.restricted[0]
  const plan: SuggestedPlan = {
    brand,
    sector,
    sectorLabel,
    services,
    language: input.plan.language,
    keywords,
    negativeKeywords: negatives,
    country,
    cities,
    modelPolicyCategory: restricted ?? 'none',
    modelPolicyEvidence: restricted ? 'ambiguous' : 'none',
    euPoliticalAdvertising: 'no',
    euPoliticalDeclarationConfirmed: false,
    finalUrl: `https://${host}`,
    adCopy: { headlines, descriptions, displayUrl: cleanDisplayUrl(input.ad.displayUrl, host) },
  }

  try {
    parseGoogleAdsPublishPlan(plan)
  } catch {
    return { ok: false, error: 'invalid_publish_plan' }
  }

  const budget = options.currency
    ? suggestDailyBudget({ scanDailyTry: input.budget.daily, currency: options.currency, serverCapMinor: options.serverCapMinor })
    : null
  const budgetIssue = budget && options.serverCapMinor !== null && budget.dailyMinor > options.serverCapMinor
    ? 'budget_sanity_ceiling_exceeded'
    : null
  if (budget) plan.aiRecommendedDailyBudgetMinor = budget.dailyMinor
  return {
    ok: true,
    suggestion: {
      plan,
      budget,
      budgetIssue,
      adjustments: {
        headlinesDropped: headlineResult.dropped,
        descriptionsDropped: descriptionResult.dropped,
        toppedUp,
      },
    },
  }
}
