export type LegacyAddOnsSearchParams = Record<string, string | string[] | undefined>

const BILLING_ADD_ONS_DESTINATION = '/billing#ek-paketler'

export function buildLegacyAddOnsRedirect(
  searchParams: LegacyAddOnsSearchParams,
  authenticated: boolean,
): string {
  const query = new URLSearchParams()

  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string') {
      query.append(key, value)
    } else if (Array.isArray(value)) {
      for (const item of value) query.append(key, item)
    }
  }

  const serializedQuery = query.toString()
  const destination = serializedQuery
    ? `/billing?${serializedQuery}#ek-paketler`
    : BILLING_ADD_ONS_DESTINATION

  if (authenticated) return destination

  const loginQuery = new URLSearchParams({ next: destination })
  return `/auth/login?${loginQuery.toString()}`
}
