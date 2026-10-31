import { fold } from '@/lib/visual-subjects'
import type { SiteSnapshot } from '@/lib/ads/scan/scan-site'
import { HOST_STEMS, POLICY_CATEGORIES, type PolicyCategory, type PolicySeverity } from './policy-terms'

/**
 * Deterministic ad-policy check. It runs in code, before and after any model, and
 * a model can only ever make the outcome stricter, never looser.
 *
 * Matching: text is NFKC-normalised (full-width / compatibility forms collapse to
 * plain letters), folded with Turkish rules and stripped of diacritics, then every
 * term is matched as a WHOLE WORD (`(?<![a-z0-9])term(?![a-z0-9])`), never as a
 * substring, so "tur" can never fire inside "olustur" (see lib/visual-subjects.ts).
 * A term ending in `*` also matches suffixed forms (`silahlar`). Host names are the
 * one exception: they have no word breaks, so a short list of blocked-category
 * stems is matched as a substring of the host.
 *
 * Thresholds: a hit in a PROMINENT field (host, title, meta description, site name,
 * headings, navigation) decides on its own. Hits only in running body text need
 * repetition (blocked: 3, restricted: 2), so an incidental mention (a law firm
 * writing about drug cases in one paragraph) does not condemn a whole site.
 */

export type { PolicyCategory, PolicySeverity } from './policy-terms'
export type PolicyVerdict = 'allowed' | 'restricted' | 'blocked'

export type PolicyFinding = {
  category: PolicyCategory
  severity: PolicySeverity
  prominentHits: number
  bodyHits: number
}

export type PolicyResult = {
  verdict: PolicyVerdict
  blocked: PolicyCategory[]
  restricted: PolicyCategory[]
  findings: PolicyFinding[]
}

export type PolicyInput = {
  hosts?: string[]
  /** Fields where one hit is enough. */
  prominent?: string[]
  /** Running text where hits must repeat. */
  body?: string[]
}

const BODY_THRESHOLD: Record<PolicySeverity, number> = { blocked: 3, restricted: 2 }

function normalizeForPolicy(input: string): string {
  return fold(input.normalize('NFKC'))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function termPattern(term: string): string {
  const prefix = term.endsWith('*')
  const body = escapeRegExp(prefix ? term.slice(0, -1) : term)
  return prefix ? `${body}[a-z0-9]*` : body
}

type CompiledCategory = {
  category: PolicyCategory
  severity: PolicySeverity
  pattern: RegExp
  reviewPattern: RegExp | null
}

let compiled: CompiledCategory[] | null = null
function compiledCategories(): CompiledCategory[] {
  compiled ??= POLICY_CATEGORIES.map(({ category, severity, terms, reviewTerms = [] }) => ({
    category,
    severity,
    pattern: new RegExp(`(?<![a-z0-9])(?:${terms.map(termPattern).join('|')})(?![a-z0-9])`, 'g'),
    reviewPattern: reviewTerms.length
      ? new RegExp(`(?<![a-z0-9])(?:${reviewTerms.map(termPattern).join('|')})(?![a-z0-9])`, 'g')
      : null,
  }))
  return compiled
}

function countHits(pattern: RegExp, text: string): number {
  if (!text) return 0
  pattern.lastIndex = 0
  return text.match(pattern)?.length ?? 0
}

export function evaluatePolicy(input: PolicyInput): PolicyResult {
  const hosts = (input.hosts ?? []).map(normalizeForPolicy)
  const prominent = normalizeForPolicy((input.prominent ?? []).join(' | '))
  const body = normalizeForPolicy((input.body ?? []).join(' | '))

  const findings: PolicyFinding[] = []
  for (const { category, severity, pattern, reviewPattern } of compiledCategories()) {
    let prominentHits = countHits(pattern, prominent)
    for (const host of hosts) {
      if (HOST_STEMS.some((entry) => entry.category === category && host.includes(entry.stem))) prominentHits++
    }
    const bodyHits = countHits(pattern, body)
    if (prominentHits >= 1 || bodyHits >= BODY_THRESHOLD[severity]) {
      findings.push({ category, severity, prominentHits, bodyHits })
      continue
    }

    if (reviewPattern) {
      const reviewProminentHits = countHits(reviewPattern, prominent)
      const reviewBodyHits = countHits(reviewPattern, body)
      if (reviewProminentHits >= 1 || reviewBodyHits >= BODY_THRESHOLD.restricted) {
        findings.push({ category, severity: 'restricted', prominentHits: reviewProminentHits, bodyHits: reviewBodyHits })
      }
    }
  }

  const blocked = findings.filter((f) => f.severity === 'blocked').map((f) => f.category)
  const restricted = findings.filter((f) => f.severity === 'restricted').map((f) => f.category)
  const verdict: PolicyVerdict = blocked.length > 0 ? 'blocked' : restricted.length > 0 ? 'restricted' : 'allowed'
  return { verdict, blocked, restricted, findings }
}

/** Policy check of a scanned site (host(s), title, headings, navigation and body text). */
export function evaluateSnapshotPolicy(snapshot: SiteSnapshot): PolicyResult {
  return evaluatePolicy({
    hosts: [snapshot.host, snapshot.finalHost],
    prominent: [
      snapshot.title,
      snapshot.description,
      snapshot.siteName,
      ...snapshot.organizationNames,
      ...snapshot.headings,
      ...snapshot.navLabels,
    ],
    body: [snapshot.text],
  })
}

/** Policy check of generated ad copy (headlines, descriptions, keywords): every string is prominent. */
export function evaluateCopyPolicy(strings: string[]): PolicyResult {
  return evaluatePolicy({ prominent: strings })
}
