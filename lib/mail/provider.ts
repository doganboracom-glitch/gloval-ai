import { mockMailProvider } from './mock-provider'
import type { MailProvider } from './types'

/**
 * Mail provider registry. Mirrors `getPaymentProvider()` in `lib/payments` so
 * the swap-in point for a real service is where a reader would expect it.
 *
 * To connect a real provider: implement `MailProvider` in e.g.
 * `lib/mail/mailcow.ts`, register it below, and set `MAIL_PROVIDER=mailcow`.
 * No route, action or component needs to change.
 */
const providers: Record<string, MailProvider> = {
  mock: mockMailProvider,
}

export function getMailProvider(): MailProvider {
  const id = process.env.MAIL_PROVIDER?.trim() || 'mock'
  // Fall back to the mock rather than breaking the mail screens outright if an
  // unknown id is configured.
  return providers[id] ?? mockMailProvider
}

/** True when a concrete (non-mock) provider is wired up. */
export function isRealMailProvider(): boolean {
  return getMailProvider().id !== 'mock'
}

export * from './types'
