import { customerOrderStatus, type CustomerOrderStatusInput } from '@/lib/customer-order-status'

export type OrderStatusInput = CustomerOrderStatusInput

export type OrderStatusCopy = {
  title: string
  description: string
  icon: 'success' | 'pending' | 'failed'
}

/** Order-page headline and text; derived from the shared `customerOrderStatus`. */
export function orderStatusCopy(input: OrderStatusInput, language: 'tr' | 'en' = 'tr'): OrderStatusCopy {
  const { title, description, icon } = customerOrderStatus(input, language)
  return { title, description, icon }
}

export function safeStoreContactHref(baseUrl: string | null, hasContactSection: boolean, email: string | null, slug: string): string | null {
  if (hasContactSection && baseUrl) {
    try {
      const url = new URL(baseUrl)
      const isGlovalTenant = url.hostname === `${slug}.gloval.site` || url.hostname.endsWith('.gloval.site')
      if (!isGlovalTenant || isSafeStoreBaseUrl(baseUrl, slug)) {
        return `${baseUrl.replace(/\/$/, '')}/#contact`
      }
    } catch {
      // Fall through to the store email when the configured URL is malformed.
    }
  }
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return `mailto:${email}`
  return null
}

export function isSafeStoreBaseUrl(value: string, slug: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === `${slug}.gloval.site`
  } catch {
    return false
  }
}
