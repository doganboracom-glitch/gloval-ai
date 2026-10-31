import { timingSafeEqual } from 'node:crypto'

export function isAuthorizedCronRequest(authorizationHeader: string | null, secret: string | undefined): boolean {
  if (!authorizationHeader || !secret) return false

  const expected = Buffer.from(`Bearer ${secret}`, 'utf8')
  const actual = Buffer.from(authorizationHeader, 'utf8')
  if (actual.length !== expected.length) return false

  return timingSafeEqual(actual, expected)
}
