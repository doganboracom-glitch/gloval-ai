import { DEFAULT_VAT_BPS, getFixedRates, parseVatPercentToBps } from './calc'
import type { PricingContext } from './order'

/**
 * Server-only pricing inputs. Nothing here comes from the client.
 *  - VAT: 20% by default; `DOMAIN_VAT_RATE_PERCENT` may override it (e.g. "20").
 *    A set-but-invalid value -> `vatBps: null`, which fails every quote closed.
 *  - FX: a manual constant, 1 USD = 50 TRY (`fixed_manual_rate`). This is NOT
 *    the market rate. No external rate API and no `fx_rates` lookup is used;
 *    EUR and every other currency have no rate, so they are PRICING_UNAVAILABLE.
 */
export async function loadPricingContext(): Promise<PricingContext> {
  const raw = process.env.DOMAIN_VAT_RATE_PERCENT?.trim()
  const vatBps = raw ? parseVatPercentToBps(raw) : DEFAULT_VAT_BPS
  return { vatBps, rates: getFixedRates(new Date()) }
}
