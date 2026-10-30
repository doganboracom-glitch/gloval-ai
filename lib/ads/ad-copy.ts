import { z } from 'zod'
import { fold } from '@/lib/visual-subjects'
import { evaluateCopyPolicy } from '@/lib/ads/policy'
import { isCleanText, type AdsPlan } from '@/lib/ads/planner'
import type { SiteSnapshot } from '@/lib/ads/scan/scan-site'

/**
 * Stage 2 of a scan: Responsive Search Ad text. The model only sees the
 * validated plan (never the raw page text). Every line is re-checked in code:
 * Google's character limits, no URL / phone / markup, no exclamation mark in
 * headlines, no invented numbers (prices, discounts) and the ad copy policy.
 */

export const HEADLINE_MAX = 30
export const DESCRIPTION_MAX = 90
export const PATH_MAX = 15
export const MAX_HEADLINES = 15
export const MAX_DESCRIPTIONS = 4
export const MIN_HEADLINES = 3
export const MIN_DESCRIPTIONS = 2

export const adCopyOutputSchema = z.object({
  headlines: z.array(z.string().max(120)).max(30),
  descriptions: z.array(z.string().max(300)).max(10),
  path1: z.string().max(40),
  path2: z.string().max(40),
})
export type AdCopyOutput = z.infer<typeof adCopyOutputSchema>

export type AdCopy = {
  headlines: string[]
  descriptions: string[]
  displayUrl: string
  /** Lines dropped for breaking a rule; the orchestrator regenerates once when too few survive. */
  rejected: number
}

const NUMBER = /\d+(?:[.,]\d+)?/g

function numbersIn(value: string): string[] {
  return value.match(NUMBER) ?? []
}

function slug(value: string): string {
  return fold(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, PATH_MAX)
    .replace(/-+$/g, '')
}

function pathPart(value: string): string {
  return slug(value)
}

export function validateAdCopy(raw: AdCopyOutput, plan: AdsPlan, snapshot: SiteSnapshot): AdCopy {
  const pageText = [snapshot.title, snapshot.description, snapshot.text, ...snapshot.headings].join(' ')
  const pageNumbers = new Set(numbersIn(pageText))
  let rejected = 0

  const accept = (value: string, max: number, headline: boolean): string | null => {
    const line = value.replace(/\s+/g, ' ').trim()
    if (!line || line.length > max) return null
    if (!isCleanText(line)) return null
    if (headline && line.includes('!')) return null
    if (numbersIn(line).some((n) => !pageNumbers.has(n))) return null
    return line
  }

  const collect = (values: string[], max: number, limit: number, headline: boolean): string[] => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const value of values) {
      const line = accept(value, max, headline)
      const key = line ? fold(line) : ''
      if (!line || seen.has(key)) {
        rejected++
        continue
      }
      seen.add(key)
      out.push(line)
    }
    return out.slice(0, limit)
  }

  let headlines = collect(raw.headlines, HEADLINE_MAX, MAX_HEADLINES, true)
  let descriptions = collect(raw.descriptions, DESCRIPTION_MAX, MAX_DESCRIPTIONS, false)

  const policy = evaluateCopyPolicy([...headlines, ...descriptions])
  if (policy.verdict !== 'allowed') {
    const flagged = (line: string) => evaluateCopyPolicy([line]).verdict !== 'allowed'
    const before = headlines.length + descriptions.length
    headlines = headlines.filter((line) => !flagged(line))
    descriptions = descriptions.filter((line) => !flagged(line))
    rejected += before - headlines.length - descriptions.length
  }

  const path1 = pathPart(raw.path1) || pathPart(plan.sector === 'other' ? plan.services[0] ?? '' : plan.sectorLabel)
  const path2 = pathPart(raw.path2)
  const host = snapshot.finalHost
  const displayUrl = ['https://' + host, path1, path1 ? path2 : ''].filter(Boolean).join('/')

  return { headlines, descriptions, displayUrl, rejected }
}

export function adCopyIsSufficient(copy: AdCopy): boolean {
  return copy.headlines.length >= MIN_HEADLINES && copy.descriptions.length >= MIN_DESCRIPTIONS
}

export const AD_COPY_SYSTEM = [
  'You write Google Search responsive ad text for a small business, from a short validated brief.',
  'Write in the language given in the brief. Plain, honest, specific to the services.',
  'Hard rules: each headline at most 30 characters, each description at most 90 characters.',
  'No exclamation marks in headlines. No URLs, phone numbers, emails or HTML. No prices, percentages, discounts or numbers at all, no guarantees, no superlatives you cannot prove, no claims about results.',
  'path1 and path2 are two short lowercase words for the display URL (letters, digits, hyphen, at most 15 characters).',
  'Give 10 to 15 distinct headlines and 3 to 4 descriptions.',
].join('\n')

export function buildAdCopyPrompt(plan: AdsPlan): string {
  const lines = [
    `Language: ${plan.language === 'tr' ? 'Turkish' : 'English'}`,
    `Brand: ${plan.brand}`,
    `Sector: ${plan.sectorLabel || plan.sector}`,
    `Services: ${plan.services.join('; ')}`,
    `Keywords: ${plan.keywords.slice(0, 10).join('; ')}`,
    plan.cities.length ? `Cities: ${plan.cities.join('; ')}` : '',
  ].filter(Boolean)
  return `${lines.join('\n')}\n\nWrite the ad text JSON.`
}
