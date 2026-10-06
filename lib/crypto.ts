import 'server-only'
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto'

/**
 * Symmetric encryption for provider payment secrets stored in the database.
 * AES-256-GCM with a per-record random IV and auth tag. The key is derived
 * from a stable server-side secret so ciphertext survives deploys.
 *
 * These helpers are server-only; the plaintext secret never leaves the server
 * and is never returned to the client.
 */

const ALGO = 'aes-256-gcm'

function getKey(): Buffer {
  // Prefer a dedicated key; fall back to the stable Supabase JWT secret so the
  // feature works out of the box without extra configuration.
  const seed =
    process.env.PAYMENT_ENCRYPTION_KEY ||
    process.env.SUPABASE_JWT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!seed) {
    throw new Error('No encryption seed available for payment secrets.')
  }
  // Derive a 32-byte key. Static salt is acceptable here since the seed itself
  // is high-entropy and secret.
  return scryptSync(seed, 'gloval-payments-v1', 32)
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, getKey(), iv)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  // Store as iv:tag:ciphertext, all base64.
  return [
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':')
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(':')
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed encrypted payload.')
  }
  const decipher = createDecipheriv(
    ALGO,
    getKey(),
    Buffer.from(ivB64, 'base64'),
  )
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}
