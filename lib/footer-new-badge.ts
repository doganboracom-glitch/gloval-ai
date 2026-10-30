/**
 * Last moment (Istanbul time) the "Yeni" badge next to the footer's domain
 * search link is shown: 60 days after the link was promoted (2026-10-29).
 * After this instant the badge disappears on its own — no deploy needed.
 */
export const DOMAIN_LINK_NEW_UNTIL = '2026-12-28T23:59:59+03:00'

function isBefore(untilIso: string, now: Date): boolean {
  const until = Date.parse(untilIso)
  return Number.isFinite(until) && now.getTime() <= until
}

export function isDomainLinkNewBadgeActive(now: Date = new Date()): boolean {
  return isBefore(DOMAIN_LINK_NEW_UNTIL, now)
}
