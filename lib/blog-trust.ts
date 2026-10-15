import { sampleDigest } from '@/lib/sample-content'

/**
 * Content-trust checks for blog posts. A post body must never carry invented
 * statistics, testimonials or sources: the owner either removes them or
 * explicitly approves each one at publish time (same contract as the site's
 * sample-content gate). Pure and heuristic on purpose: it flags, the owner decides.
 */

export type BlogClaimKind = 'statistic' | 'testimonial' | 'source'

export type BlogClaimFinding = {
  /** Digest of the claim text; changes when the claim changes (like sample finding ids). */
  id: string
  kind: BlogClaimKind
  /** Short excerpt shown in the approval dialog. */
  excerpt: string
}

type Rule = { kind: BlogClaimKind; pattern: RegExp }

const RULES: readonly Rule[] = [
  { kind: 'statistic', pattern: /%\s?\d{1,3}(?:[.,]\d+)?|\d{1,3}(?:[.,]\d+)?\s?%/gu },
  { kind: 'statistic', pattern: /\byüzde\s+\d{1,3}\b/giu },
  {
    kind: 'statistic',
    pattern: /\byüzde\s+(?:sıfır|bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on|yirmi|otuz|kırk|elli|altmış|yetmiş|seksen|doksan|yüz)(?![\p{L}])/giu,
  },
  { kind: 'statistic', pattern: /\b\d{1,3}\s+percent\b/giu },
  { kind: 'statistic', pattern: /\b\d{1,3}(?:[.,]\d{3})+\+?\s+(?:müşteri|kullanıcı|hasta|satış|proje|mutlu|customers?|users?|clients?)/giu },
  { kind: 'statistic', pattern: /\b\d{1,2}\s?\/\s?10\b/gu },
  {
    kind: 'testimonial',
    pattern: /[“"«][^”"»\n]{20,300}[”"»]\s*[-–—]\s*\p{Lu}[\p{L}.]+(?:\s+\p{Lu}[\p{L}.]*)?/gu,
  },
  { kind: 'testimonial', pattern: /\bmüşterimiz\b[^.\n]{0,80}\b(?:dedi|diyor|söyledi)\b/giu },
  { kind: 'testimonial', pattern: /\bour (?:customer|client)\b[^.\n]{0,80}\b(?:said|says)\b/giu },
  { kind: 'source', pattern: /\b(?:kaynak|kaynaklar|source|sources)\s*:/giu },
  { kind: 'source', pattern: /\baraştırma(?:ya|lara|lar)?\s+göre\b/giu },
  { kind: 'source', pattern: /\baccording to (?:a |the )?(?:study|research|survey|report)\b/giu },
  { kind: 'source', pattern: /\((?:\p{Lu}[\p{L}&.\- ]{1,40}),?\s*(?:19|20)\d{2}\)/gu },
  { kind: 'source', pattern: /\b(?:study|survey|research|araştırma)\s+(?:by|from|yapan)\s+\p{Lu}[\p{L}]+/giu },
]

const EXCERPT_MAX = 90

function excerptOf(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > EXCERPT_MAX ? `${clean.slice(0, EXCERPT_MAX - 1)}…` : clean
}

/** Every unverified claim in `body`, de-duplicated by digest, in document order. */
export function detectUnverifiedClaims(body: string): BlogClaimFinding[] {
  const seen = new Map<string, { at: number; finding: BlogClaimFinding }>()
  for (const rule of RULES) {
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags)
    for (const match of body.matchAll(pattern)) {
      const text = match[0]
      const id = sampleDigest('blog', [rule.kind, text.toLowerCase().trim()])
      if (seen.has(id)) continue
      seen.set(id, { at: match.index ?? 0, finding: { id, kind: rule.kind, excerpt: excerptOf(text) } })
    }
  }
  return [...seen.values()].sort((a, b) => a.at - b.at).map((entry) => entry.finding)
}

/** Findings the owner has not approved. Approval ids that match nothing are ignored. */
export function unresolvedClaims(body: string, approvedIds: Iterable<string> | undefined): BlogClaimFinding[] {
  const approved = new Set(approvedIds ?? [])
  return detectUnverifiedClaims(body).filter((finding) => !approved.has(finding.id))
}
