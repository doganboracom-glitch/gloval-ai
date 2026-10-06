import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/**
 * Encrypts the inbound-transfer EPP code while it waits for payment.
 * Fails closed: without DOMAIN_TRANSFER_SECRET no code is ever stored, so
 * inbound transfers are simply unavailable rather than stored in plaintext.
 */

function key(): Buffer | null {
  const secret = process.env.DOMAIN_TRANSFER_SECRET?.trim()
  if (!secret || secret.length < 16) return null
  return createHash('sha256').update(secret).digest()
}

export function isTransferSecretConfigured(): boolean {
  return key() !== null
}

export function encryptAuthCode(plain: string): string | null {
  const k = key()
  if (!k) return null
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', k, iv)
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString('base64')).join('.')
}

export function decryptAuthCode(payload: string): string | null {
  const k = key()
  if (!k) return null
  try {
    const [iv, tag, body] = payload.split('.').map((p) => Buffer.from(p, 'base64'))
    const decipher = createDecipheriv('aes-256-gcm', k, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
