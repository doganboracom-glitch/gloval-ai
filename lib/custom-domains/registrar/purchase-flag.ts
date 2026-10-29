import { isProductionRuntime } from './test-mode'

type FlagEnv = Record<string, string | undefined>

/**
 * Launch kill-switch for every flow that takes NEW money for a registrar
 * product (buy a domain, transfer one in).
 *
 * In a production deployment these flows are closed unless
 * `DOMAIN_PURCHASE_ENABLED` is explicitly `true` (quotes/case/whitespace
 * tolerated), so a missing or mistyped value fails closed. Preview and local
 * runs are unaffected. Connecting a domain the customer already owns, and
 * finishing orders that were already paid (`finalizeDomainOrder`, settlement,
 * reconciliation), never consult this flag.
 */
export function isDomainPurchaseEnabled(env: FlagEnv = process.env): boolean {
  if (!isProductionRuntime({ VERCEL_ENV: env.VERCEL_ENV, NODE_ENV: env.NODE_ENV })) return true
  let value = (env.DOMAIN_PURCHASE_ENABLED ?? '').trim()
  const quote = value[0]
  if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) {
    value = value.slice(1, -1).trim()
  }
  return value.toLowerCase() === 'true'
}
