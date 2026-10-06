import { mockMailProvider } from './mock-provider'
import { isMailcowConfigured, mailcowProvider } from './mailcow-provider'
import type { MailProvider } from './types'

const providers: Record<string, MailProvider> = {
  mock: mockMailProvider,
  mailcow: mailcowProvider,
}

export function getMailProvider(): MailProvider {
  const configuredProvider = process.env.MAIL_PROVIDER?.trim()
  const id = configuredProvider || (isMailcowConfigured() ? 'mailcow' : 'mock')
  return providers[id] ?? mockMailProvider
}

export function isRealMailProvider(): boolean {
  return getMailProvider().id !== 'mock'
}

export * from './types'
