import { ROBOTS_PRODUCT_TOKEN } from './config'

/**
 * robots.txt handling per RFC 9309.
 *
 * Availability (decided by the fetcher): 2xx -> parse; 4xx -> everything allowed;
 * 5xx / network error / timeout / blocked address -> everything disallowed.
 */

export type RobotsRules = { isAllowed(pathAndQuery: string): boolean }

export const ALLOW_ALL: RobotsRules = { isAllowed: () => true }
export const DISALLOW_ALL: RobotsRules = { isAllowed: () => false }

const MAX_LINES = 10_000
const MAX_LINE_LENGTH = 2048
const MAX_RULES = 2000

type Rule = { allow: boolean; pattern: string }
type Group = { agents: string[]; rules: Rule[] }

function normalizeAgent(value: string): string {
  return value.toLowerCase().trim().split('/')[0].trim()
}

/**
 * Prefix match where `*` matches any run of characters and a trailing `$`
 * anchors the end. Greedy left-to-right search, no regex: patterns come from a
 * hostile file and must not be able to cause catastrophic backtracking.
 */
export function matchRobotsPattern(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$')
  const body = anchored ? pattern.slice(0, -1) : pattern
  const parts = body.split('*')
  if (!path.startsWith(parts[0])) return false
  if (parts.length === 1) return anchored ? path === parts[0] : true

  let position = parts[0].length
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]
    const last = i === parts.length - 1
    if (last && anchored) return path.length - part.length >= position && path.endsWith(part)
    const index = path.indexOf(part, position)
    if (index === -1) return false
    position = index + part.length
  }
  return true
}

export function parseRobots(text: string): RobotsRules {
  const groups: Group[] = []
  let current: Group | null = null
  let previousWasAgent = false

  const lines = text.split(/\r\n|\r|\n/, MAX_LINES)
  for (const rawLine of lines) {
    const line = rawLine.slice(0, MAX_LINE_LENGTH).replace(/#.*$/, '').trim()
    const colon = line.indexOf(':')
    if (colon <= 0) continue
    const field = line.slice(0, colon).trim().toLowerCase()
    const value = line.slice(colon + 1).trim()

    if (field === 'user-agent') {
      if (!current || !previousWasAgent) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(normalizeAgent(value))
      previousWasAgent = true
    } else if (field === 'allow' || field === 'disallow') {
      previousWasAgent = false
      if (current && value && current.rules.length < MAX_RULES) {
        current.rules.push({ allow: field === 'allow', pattern: value })
      }
    }
  }

  const specific = groups.filter((group) => group.agents.includes(ROBOTS_PRODUCT_TOKEN))
  const applicable = specific.length > 0 ? specific : groups.filter((group) => group.agents.includes('*'))
  const rules = applicable.flatMap((group) => group.rules)

  return {
    isAllowed(pathAndQuery: string): boolean {
      const path = pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`
      let bestLength = -1
      let allowed = true
      for (const rule of rules) {
        if (!matchRobotsPattern(rule.pattern, path)) continue
        const length = rule.pattern.length
        // Longest match wins; on a tie the less restrictive (allow) rule wins.
        if (length > bestLength || (length === bestLength && rule.allow)) {
          bestLength = length
          allowed = rule.allow
        }
      }
      return allowed
    },
  }
}

const INDEX_BLOCKING_DIRECTIVES = new Set(['noindex', 'none', 'noai'])

/** True when a comma separated robots directive list (meta tag or header) forbids using the page. */
export function directivesForbidUse(tokens: string[]): boolean {
  return tokens.some((token) => INDEX_BLOCKING_DIRECTIVES.has(token))
}

/**
 * X-Robots-Tag: `noindex`, `none, noai`, or bot scoped as `otherbot: noindex`.
 * Directives apply when unscoped or scoped to this scanner; other bots' scopes are ignored.
 */
export function headerForbidsUse(value: string | null): boolean {
  if (!value) return false
  const applying: string[] = []
  let scope: string | null = null
  for (const part of value.split(',')) {
    let directive = part.trim().toLowerCase()
    const scoped = /^([a-z0-9_*-]+)\s*:\s*(.+)$/.exec(directive)
    if (scoped && !INDEX_BLOCKING_DIRECTIVES.has(scoped[1]) && scoped[1] !== 'unavailable_after') {
      scope = scoped[1]
      directive = scoped[2].trim()
    }
    if (scope === null || scope === ROBOTS_PRODUCT_TOKEN || scope === '*') applying.push(directive)
  }
  return directivesForbidUse(applying)
}
