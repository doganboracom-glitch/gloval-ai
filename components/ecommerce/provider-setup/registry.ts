import type { ProviderSetupConfig } from '@/lib/payment-providers/types'
import { iyzicoProvider } from '@/components/ecommerce/provider-setup/providers/iyzico'

/**
 * Every payment provider an owner can connect. The settings window builds its
 * provider tabs from this list; a new provider is one new config added here.
 */
export const PAYMENT_PROVIDERS: readonly ProviderSetupConfig[] = [iyzicoProvider]

export function getPaymentProvider(id: string): ProviderSetupConfig | undefined {
  return PAYMENT_PROVIDERS.find((provider) => provider.id === id)
}
