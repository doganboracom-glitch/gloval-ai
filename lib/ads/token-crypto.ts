import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * AES-256-GCM envelope for ad-platform refresh tokens.
 *
 *   v<keyVersion>:<iv>:<authTag>:<ciphertext>      (base64url parts)
 *
 * - The key version travels with the ciphertext, so rotation is: add
 *   ADS_TOKEN_ENC_KEY_V<n+1>, switch ADS_TOKEN_ENC_ACTIVE_VERSION, re-encrypt
 *   rows whose `token_key_version` is old, then drop the old key.
 * - `context` (user, platform, account) is bound as additional authenticated
 *   data, so a ciphertext copied onto another connection row fails to decrypt.
 * - Plaintext and keys are never logged and never put in error messages.
 */

export type AdsTokenKeyring = {
  activeVersion: number
  /** key version -> 32-byte key */
  keys: ReadonlyMap<number, Buffer>
}

export type AdsTokenContext = {
  userId: string
  platform: string
  externalAccountId: string
}

export class AdsTokenCryptoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdsTokenCryptoError'
  }
}

const KEY_BYTES = 32
const IV_BYTES = 12
const ENVELOPE = /^v(\d{1,4}):([A-Za-z0-9_-]+):([A-Za-z0-9_-]+):([A-Za-z0-9_-]+)$/
const KEY_ENV_PREFIX = 'ADS_TOKEN_ENC_KEY_V'
const ACTIVE_ENV = 'ADS_TOKEN_ENC_ACTIVE_VERSION'

function aad(context: AdsTokenContext, version: number): Buffer {
  return Buffer.from(
    JSON.stringify([version, context.userId, context.platform, context.externalAccountId]),
    'utf8',
  )
}

function parseKey(raw: string, name: string): Buffer {
  const key = Buffer.from(raw.trim(), 'base64')
  if (key.length !== KEY_BYTES) {
    throw new AdsTokenCryptoError(`${name} must be a base64-encoded 32-byte key`)
  }
  return key
}

/** Builds the keyring from the environment. Throws when the active key is not configured. */
export function loadAdsTokenKeyring(
  env: Readonly<Record<string, string | undefined>> = process.env,
): AdsTokenKeyring {
  const activeRaw = env[ACTIVE_ENV]?.trim()
  if (!activeRaw || !/^\d{1,4}$/.test(activeRaw) || Number(activeRaw) < 1) {
    throw new AdsTokenCryptoError(`${ACTIVE_ENV} must be a positive integer`)
  }
  const activeVersion = Number(activeRaw)

  const keys = new Map<number, Buffer>()
  for (const [name, value] of Object.entries(env)) {
    const match = name.startsWith(KEY_ENV_PREFIX) ? /^(\d{1,4})$/.exec(name.slice(KEY_ENV_PREFIX.length)) : null
    if (!match || !value) continue
    keys.set(Number(match[1]), parseKey(value, name))
  }

  if (!keys.has(activeVersion)) {
    throw new AdsTokenCryptoError(`${KEY_ENV_PREFIX}${activeVersion} is not configured`)
  }
  return { activeVersion, keys }
}

export function encryptAdsToken(
  plaintext: string,
  context: AdsTokenContext,
  keyring: AdsTokenKeyring,
): { ciphertext: string; keyVersion: number } {
  if (!plaintext) throw new AdsTokenCryptoError('refusing to encrypt an empty token')
  const key = keyring.keys.get(keyring.activeVersion)
  if (!key) throw new AdsTokenCryptoError('active key is missing from the keyring')

  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(aad(context, keyring.activeVersion))
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  const ciphertext = [
    `v${keyring.activeVersion}`,
    iv.toString('base64url'),
    tag.toString('base64url'),
    body.toString('base64url'),
  ].join(':')
  return { ciphertext, keyVersion: keyring.activeVersion }
}

export function decryptAdsToken(
  ciphertext: string,
  context: AdsTokenContext,
  keyring: AdsTokenKeyring,
): string {
  const match = ENVELOPE.exec(ciphertext)
  if (!match) throw new AdsTokenCryptoError('malformed token envelope')
  const version = Number(match[1])
  const key = keyring.keys.get(version)
  if (!key) throw new AdsTokenCryptoError(`no key for version ${version}`)

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(match[2], 'base64url'))
    decipher.setAAD(aad(context, version))
    decipher.setAuthTag(Buffer.from(match[3], 'base64url'))
    const body = Buffer.concat([decipher.update(Buffer.from(match[4], 'base64url')), decipher.final()])
    return body.toString('utf8')
  } catch {
    throw new AdsTokenCryptoError('token could not be decrypted')
  }
}

/** Key version stored in an envelope, or null when it is malformed. */
export function adsTokenKeyVersion(ciphertext: string): number | null {
  const match = ENVELOPE.exec(ciphertext)
  return match ? Number(match[1]) : null
}

/** True when the envelope was written with a key older than the active one. */
export function adsTokenNeedsRotation(ciphertext: string, keyring: AdsTokenKeyring): boolean {
  const version = adsTokenKeyVersion(ciphertext)
  return version !== null && version !== keyring.activeVersion
}
