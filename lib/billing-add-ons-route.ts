export type LegacyAddOnsSearchParams = Record<string, string | string[] | undefined>

export const ADD_ON_PAYMENT_RETURN_PARAM = 'addonPayment'
export const ADD_ON_PAYMENT_RETURN_VALUE = 'return'
export const ADD_ON_PAYMENT_RETURN_QUERY = `${ADD_ON_PAYMENT_RETURN_PARAM}=${ADD_ON_PAYMENT_RETURN_VALUE}`

export function isAddOnPaymentReturn(searchParams: {
  addonPayment?: string
  payment?: string
}): boolean {
  return searchParams.addonPayment === ADD_ON_PAYMENT_RETURN_VALUE
}

const BILLING_ADD_ONS_DESTINATION = '/billing#ek-paketler'

export function buildLegacyAddOnsRedirect(
  searchParams: LegacyAddOnsSearchParams,
  authenticated: boolean,
): string {
  const query = new URLSearchParams()
  const hasLegacyPaymentReturn = searchParams.payment !== undefined

  for (const [key, value] of Object.entries(searchParams)) {
    if (key === 'payment') continue
    if (typeof value === 'string') {
      query.append(key, value)
    } else if (Array.isArray(value)) {
      for (const item of value) query.append(key, item)
    }
  }

  if (hasLegacyPaymentReturn && !query.has(ADD_ON_PAYMENT_RETURN_PARAM)) {
    query.set(ADD_ON_PAYMENT_RETURN_PARAM, ADD_ON_PAYMENT_RETURN_VALUE)
  }

  const serializedQuery = query.toString()
  const destination = serializedQuery
    ? `/billing?${serializedQuery}#ek-paketler`
    : BILLING_ADD_ONS_DESTINATION

  if (authenticated) return destination

  const loginQuery = new URLSearchParams({ next: destination })
  return `/auth/login?${loginQuery.toString()}`
}
