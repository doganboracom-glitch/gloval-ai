import 'server-only'
import { normalizeTurkishIban } from '@/lib/referrals/partner-core'

export type ReferralIbanEncryptionEnvironment = {
  [key: string]: string | undefined
  REFERRAL_IBAN_ENC_ACTIVE_VERSION?: string
}

export type ReferralIbanEncryptionResult =
  | { ok: true; ciphertext: string; keyVersion: string; last4: string }
  | { ok: false; reason: 'invalid_iban' | 'missing_key' | 'crypto_unavailable' }

function decodeKey(value: string): Uint8Array | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  if (/^[0-9a-f]{64}$/iu.test(trimmed)) {
    const bytes = new Uint8Array(32)
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Number.parseInt(trimmed.slice(index * 2, index * 2 + 2), 16)
    }
    return bytes
  }

  const base64 = trimmed.replaceAll('-', '+').replaceAll('_', '/')
  if (/^[A-Za-z0-9+/]+={0,2}$/u.test(base64)) {
    try {
      const decoded = Uint8Array.from(globalThis.atob(base64), (character) => character.charCodeAt(0))
      if (decoded.length === 32) return decoded
    } catch {
      // Try the supported raw 32-byte form below.
    }
  }

  const raw = new TextEncoder().encode(trimmed)
  return raw.length === 32 ? raw : null
}

function activeKeyConfig(env: ReferralIbanEncryptionEnvironment) {
  const requestedVersion = env.REFERRAL_IBAN_ENC_ACTIVE_VERSION?.trim()
  const match = requestedVersion ? /^v?([1-9]\d*)$/iu.exec(requestedVersion) : null
  if (!match) return null

  const keyVersion = `v${match[1]}`
  const keyName = `REFERRAL_IBAN_ENC_KEY_${keyVersion.toUpperCase()}`
  const keyBytes = env[keyName] ? decodeKey(env[keyName] as string) : null
  return keyBytes ? { keyVersion, keyBytes } : null
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return globalThis.btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

export async function encryptReferralIban(
  value: unknown,
  env: ReferralIbanEncryptionEnvironment = process.env,
): Promise<ReferralIbanEncryptionResult> {
  const iban = normalizeTurkishIban(value)
  if (!iban) return { ok: false, reason: 'invalid_iban' }

  const config = activeKeyConfig(env)
  const cryptoApi = globalThis.crypto
  if (!config) return { ok: false, reason: 'missing_key' }
  if (!cryptoApi?.subtle || !cryptoApi.getRandomValues) {
    return { ok: false, reason: 'crypto_unavailable' }
  }

  try {
    const key = await cryptoApi.subtle.importKey('raw', config.keyBytes, { name: 'AES-GCM' }, false, [
      'encrypt',
    ])
    const iv = cryptoApi.getRandomValues(new Uint8Array(12))
    const additionalData = new TextEncoder().encode(`gloval/referral/iban/${config.keyVersion}`)
    const encrypted = await cryptoApi.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData },
      key,
      new TextEncoder().encode(iban),
    )

    return {
      ok: true,
      ciphertext: `${encodeBase64Url(iv)}.${encodeBase64Url(new Uint8Array(encrypted))}`,
      keyVersion: config.keyVersion,
      last4: iban.slice(-4),
    }
  } catch {
    return { ok: false, reason: 'crypto_unavailable' }
  }
}
