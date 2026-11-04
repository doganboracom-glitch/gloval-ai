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

function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null
  try {
    const base64 = value.replaceAll('-', '+').replaceAll('_', '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    return Uint8Array.from(globalThis.atob(padded), (character) => character.charCodeAt(0))
  } catch {
    return null
  }
}

function keyConfigForVersion(keyVersion: string, env: ReferralIbanEncryptionEnvironment) {
  if (!/^v[1-9]\d*$/u.test(keyVersion)) return null
  const keyName = `REFERRAL_IBAN_ENC_KEY_${keyVersion.toUpperCase()}`
  const keyValue = env[keyName]
  const keyBytes = keyValue ? decodeKey(keyValue) : null
  return keyBytes ? { keyVersion, keyBytes } : null
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

export type ReferralIbanDecryptionResult =
  | { ok: true; iban: string }
  | { ok: false; reason: 'missing_key' | 'crypto_unavailable' | 'invalid_ciphertext' }

export async function decryptReferralIban(
  ciphertext: unknown,
  keyVersion: unknown,
  env: ReferralIbanEncryptionEnvironment = process.env,
): Promise<ReferralIbanDecryptionResult> {
  if (typeof ciphertext !== 'string' || ciphertext.length > 4096 || typeof keyVersion !== 'string') {
    return { ok: false, reason: 'invalid_ciphertext' }
  }
  const config = keyConfigForVersion(keyVersion, env)
  if (!config) return { ok: false, reason: 'missing_key' }

  const parts = ciphertext.split('.')
  if (parts.length !== 2) return { ok: false, reason: 'invalid_ciphertext' }
  const iv = decodeBase64Url(parts[0])
  const encrypted = decodeBase64Url(parts[1])
  if (!iv || iv.length !== 12 || !encrypted || encrypted.length < 16) {
    return { ok: false, reason: 'invalid_ciphertext' }
  }

  const cryptoApi = globalThis.crypto
  if (!cryptoApi?.subtle) return { ok: false, reason: 'crypto_unavailable' }
  try {
    const key = await cryptoApi.subtle.importKey('raw', config.keyBytes, { name: 'AES-GCM' }, false, [
      'decrypt',
    ])
    const additionalData = new TextEncoder().encode(`gloval/referral/iban/${config.keyVersion}`)
    const plaintext = await cryptoApi.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData },
      key,
      encrypted,
    )
    const iban = normalizeTurkishIban(new TextDecoder('utf-8', { fatal: true }).decode(plaintext))
    return iban ? { ok: true, iban } : { ok: false, reason: 'invalid_ciphertext' }
  } catch {
    return { ok: false, reason: 'crypto_unavailable' }
  }
}
