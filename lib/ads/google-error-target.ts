import { googleAdsOperationMapForPlan } from '@/lib/ads/google-ads-publish-plan'

/**
 * Resolves a Google Ads error `fieldPath` (e.g. `mutate_operations[7].ad_group_criterion_operation.create.keyword.text`)
 * back to the plan item that operation carried, so the UI can name the exact keyword, headline or description.
 */

export type GoogleErrorPlanTarget =
  | { kind: 'keyword' | 'negativeKeyword' | 'headline' | 'description' | 'geoTarget'; itemIndex: number; text: string }
  | { kind: 'budget' | 'campaign' | 'adGroup' | 'language' | 'ad' }

type PlanLike = {
  keywords?: unknown
  negativeKeywords?: unknown
  cities?: unknown
  adCopy?: unknown
}

const OPERATION_INDEX = /mutate_?operations\[(\d+)\]/i
const HEADLINE_INDEX = /headlines\[(\d+)\]/i
const DESCRIPTION_INDEX = /descriptions\[(\d+)\]/i

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function resolveGoogleErrorTarget(fieldPath: string | undefined, plan: PlanLike): GoogleErrorPlanTarget | null {
  if (!fieldPath) return null
  const match = OPERATION_INDEX.exec(fieldPath)
  if (!match) return null
  const operationIndex = Number(match[1])
  const adCopy = plan.adCopy && typeof plan.adCopy === 'object' ? plan.adCopy as Record<string, unknown> : {}
  const keywords = strings(plan.keywords)
  const negativeKeywords = strings(plan.negativeKeywords)
  const cities = [...new Set(strings(plan.cities))]

  const entry = googleAdsOperationMapForPlan({ keywords, negativeKeywords, cities }).find((item) => item.index === operationIndex)
  if (!entry) return null

  switch (entry.kind) {
    case 'keyword': {
      const text = keywords[entry.itemIndex]
      return text ? { kind: 'keyword', itemIndex: entry.itemIndex, text } : null
    }
    case 'negativeKeyword': {
      const text = negativeKeywords[entry.itemIndex]
      return text ? { kind: 'negativeKeyword', itemIndex: entry.itemIndex, text } : null
    }
    case 'geoTarget': {
      const text = cities[entry.itemIndex]
      return text ? { kind: 'geoTarget', itemIndex: entry.itemIndex, text } : { kind: 'campaign' }
    }
    case 'ad': {
      const headline = HEADLINE_INDEX.exec(fieldPath)
      if (headline) {
        const text = strings(adCopy.headlines)[Number(headline[1])]
        if (text) return { kind: 'headline', itemIndex: Number(headline[1]), text }
      }
      const description = DESCRIPTION_INDEX.exec(fieldPath)
      if (description) {
        const text = strings(adCopy.descriptions)[Number(description[1])]
        if (text) return { kind: 'description', itemIndex: Number(description[1]), text }
      }
      return { kind: 'ad' }
    }
    default:
      return { kind: entry.kind }
  }
}

const TARGET_LABELS: Record<GoogleErrorPlanTarget['kind'], readonly [string, string]> = {
  keyword: ['Anahtar kelime', 'Keyword'],
  negativeKeyword: ['Hariç tutulan anahtar kelime', 'Negative keyword'],
  headline: ['Başlık', 'Headline'],
  description: ['Açıklama', 'Description'],
  geoTarget: ['Hedef konum', 'Target location'],
  budget: ['Bütçe', 'Budget'],
  campaign: ['Kampanya', 'Campaign'],
  adGroup: ['Reklam grubu', 'Ad group'],
  language: ['Dil hedefi', 'Language target'],
  ad: ['Reklam', 'Ad'],
}

export function googleErrorTargetLabel(kind: GoogleErrorPlanTarget['kind'], isTr: boolean): string {
  return TARGET_LABELS[kind][isTr ? 0 : 1]
}

/** Removes the first line that matches `text` (case-insensitive) from a one-item-per-line textarea value. */
export function removeLineFromText(value: string, text: string): string {
  const needle = text.trim().toLowerCase()
  let removed = false
  return value
    .split('\n')
    .filter((line) => {
      if (!removed && line.trim().toLowerCase() === needle) {
        removed = true
        return false
      }
      return true
    })
    .join('\n')
}
