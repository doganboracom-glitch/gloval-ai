import { decideRegistrarMode, isProductionRuntime } from '@/lib/custom-domains/registrar/test-mode'

/**
 * Decides which iyzico + DomainNameAPI pairings a domain purchase may run on.
 *
 * Normal production is LIVE iyzico + LIVE DomainNameAPI. Every other pairing
 * is refused in production, with one explicit exception: a controlled E2E test
 * (sandbox iyzico + DomainNameAPI OTE) that is only reachable while
 * `DOMAIN_E2E_TEST_MODE` is explicitly `true`. Outside production nothing here
 * changes behavior.
 *
 * Pure on purpose: callers hand in already-classified inputs, so the whole
 * decision matrix is unit-testable without env or network access.
 */

export const IYZICO_SANDBOX_BASE = 'https://sandbox-api.iyzipay.com'
export const IYZICO_LIVE_BASE = 'https://api.iyzipay.com'
export const IYZICO_SANDBOX_KEY_PREFIX = 'sandbox-'

/** Order id prefix every domain purchase uses as its iyzico conversationId. */
export const DOMAIN_PURCHASE_ORDER_PREFIX = 'domreg_'

export type IyzicoHostKind = 'sandbox' | 'live' | 'missing' | 'unsupported'
export type IyzicoCredentialKind = 'sandbox' | 'live' | 'missing'
export type RegistrarKind = 'live' | 'test' | 'mock' | 'none'

export type DomainStackInput = {
  production: boolean
  iyzicoHost: IyzicoHostKind
  iyzicoCredentials: IyzicoCredentialKind
  registrar: RegistrarKind
  e2eFlag: boolean
}

export type DomainStackReason =
  | 'iyzico_not_configured'
  | 'registrar_not_configured'
  | 'mock_registrar_in_production'
  | 'live_iyzico_with_test_registrar'
  | 'sandbox_iyzico_with_live_registrar'
  | 'e2e_flag_off'
  | 'e2e_requires_sandbox_credentials'

export type DomainStackVerdict =
  | { allowed: true; mode: 'normal' | 'e2e_test' | 'non_production' }
  | { allowed: false; reason: DomainStackReason }

/** Only an explicit `true` (quotes/case/whitespace tolerated) enables the E2E test mode. */
export function isDomainE2ETestModeEnabled(raw: string | undefined = process.env.DOMAIN_E2E_TEST_MODE): boolean {
  let value = (raw ?? '').trim()
  const quote = value[0]
  if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) {
    value = value.slice(1, -1).trim()
  }
  return value.toLowerCase() === 'true'
}

export function classifyIyzicoHost(raw: string | undefined): IyzicoHostKind {
  const configured = raw?.trim().replace(/\/$/, '')
  if (!configured) return 'missing'
  if (configured === IYZICO_SANDBOX_BASE) return 'sandbox'
  if (configured === IYZICO_LIVE_BASE) return 'live'
  return 'unsupported'
}

export function classifyIyzicoCredentials(
  apiKey: string | undefined,
  secretKey: string | undefined,
): IyzicoCredentialKind {
  const key = apiKey?.trim()
  const secret = secretKey?.trim()
  if (!key || !secret) return 'missing'
  return key.startsWith(IYZICO_SANDBOX_KEY_PREFIX) || secret.startsWith(IYZICO_SANDBOX_KEY_PREFIX)
    ? 'sandbox'
    : 'live'
}

export function evaluateDomainPaymentStack(input: DomainStackInput): DomainStackVerdict {
  if (!input.production) return { allowed: true, mode: 'non_production' }

  if (input.registrar === 'none') return { allowed: false, reason: 'registrar_not_configured' }
  if (input.registrar === 'mock') return { allowed: false, reason: 'mock_registrar_in_production' }
  if (input.iyzicoHost === 'missing' || input.iyzicoHost === 'unsupported') {
    return { allowed: false, reason: 'iyzico_not_configured' }
  }

  if (input.iyzicoHost === 'live') {
    return input.registrar === 'live'
      ? { allowed: true, mode: 'normal' }
      : { allowed: false, reason: 'live_iyzico_with_test_registrar' }
  }

  // Sandbox iyzico from here on.
  if (input.registrar === 'live') return { allowed: false, reason: 'sandbox_iyzico_with_live_registrar' }
  if (!input.e2eFlag) return { allowed: false, reason: 'e2e_flag_off' }
  if (input.iyzicoCredentials !== 'sandbox') return { allowed: false, reason: 'e2e_requires_sandbox_credentials' }
  return { allowed: true, mode: 'e2e_test' }
}

type StackEnv = Record<string, string | undefined>

/** Mirrors the selection in `registrar/provider.ts`, without instantiating the provider. */
export function classifyRegistrarFromEnv(env: StackEnv): RegistrarKind {
  const username = env.DOMAINNAMEAPI_USERNAME?.trim()
  const apiKey = env.DOMAINNAMEAPI_API_KEY?.trim()
  if (username && apiKey) {
    const decision = decideRegistrarMode(env.DOMAINNAMEAPI_TEST_MODE, {
      VERCEL_ENV: env.VERCEL_ENV,
      NODE_ENV: env.NODE_ENV,
    })
    if (decision.kind === 'test') return 'test'
    if (decision.kind === 'live') return 'live'
    return 'none'
  }
  return env.DOMAIN_REGISTRAR_MOCK === 'true' ? 'mock' : 'none'
}

export function readDomainStackInput(env: StackEnv = process.env): DomainStackInput {
  return {
    production: isProductionRuntime({ VERCEL_ENV: env.VERCEL_ENV, NODE_ENV: env.NODE_ENV }),
    iyzicoHost: classifyIyzicoHost(env.IYZICO_BASE_URL),
    iyzicoCredentials: classifyIyzicoCredentials(env.IYZICO_API_KEY, env.IYZICO_SECRET_KEY),
    registrar: classifyRegistrarFromEnv(env),
    e2eFlag: isDomainE2ETestModeEnabled(env.DOMAIN_E2E_TEST_MODE),
  }
}

export function evaluateDomainPaymentStackFromEnv(env: StackEnv = process.env): DomainStackVerdict {
  return evaluateDomainPaymentStack(readDomainStackInput(env))
}

/**
 * True when production may use the sandbox iyzico host for a domain purchase.
 * `domainPurchase` MUST be derived server-side (a `domreg_` order or a looked-up
 * domain order), never from client input, so plan subscriptions and every other
 * production payment keep the live-only rule.
 */
export function mayUseSandboxIyzicoInProduction(domainPurchase: boolean, env: StackEnv = process.env): boolean {
  if (!domainPurchase) return false
  const verdict = evaluateDomainPaymentStackFromEnv(env)
  return verdict.allowed && verdict.mode === 'e2e_test'
}
