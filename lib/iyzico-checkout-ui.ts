export const IYZICO_IFRAME_FALLBACK_DELAY_MS = 12_000

const IN_APP_BROWSER_USER_AGENT =
  /(Instagram|FBAN|FBAV|FB_IAB|FB4A|WhatsApp|Line\/|TikTok|Snapchat|Twitter|LinkedInApp|MicroMessenger|KAKAOTALK|; wv\))/i

export type IyzicoCheckoutMessage = {
  source: 'gloval-payment'
  status: 'success' | 'failed' | 'error'
}

export function buildIyzicoIframeSrc(paymentPageUrl: string) {
  const hashIndex = paymentPageUrl.indexOf('#')
  const baseUrl = hashIndex === -1 ? paymentPageUrl : paymentPageUrl.slice(0, hashIndex)
  const hash = hashIndex === -1 ? '' : paymentPageUrl.slice(hashIndex)

  if (/[?&]iframe=true(?:&|$)/.test(baseUrl)) return paymentPageUrl

  const separator = baseUrl.includes('?') ? (/[?&]$/.test(baseUrl) ? '' : '&') : '?'
  return `${baseUrl}${separator}iframe=true${hash}`
}

export function shouldUseTopLevelIyzicoCheckout(userAgent: string, viewportWidth: number) {
  return viewportWidth < 640 || IN_APP_BROWSER_USER_AGENT.test(userAgent)
}

export function redirectIyzicoCheckoutToTopLevel(
  paymentPageUrl: string,
  userAgent: string,
  viewportWidth: number,
  navigate: (url: string) => void,
) {
  if (!shouldUseTopLevelIyzicoCheckout(userAgent, viewportWidth)) return false
  navigate(paymentPageUrl)
  return true
}

export function isTrustedIyzicoCheckoutMessage(
  event: MessageEvent<unknown>,
  expectedOrigin: string,
  expectedSource: MessageEventSource | null,
): event is MessageEvent<IyzicoCheckoutMessage> {
  if (!expectedSource || event.origin !== expectedOrigin || event.source !== expectedSource) return false
  if (!event.data || typeof event.data !== 'object') return false

  const payload = event.data as Record<string, unknown>
  return (
    payload.source === 'gloval-payment' &&
    (payload.status === 'success' || payload.status === 'failed' || payload.status === 'error')
  )
}
