import 'server-only'
import { decryptSecret } from '@/lib/crypto'

export type StoredSecrets = Record<string, Record<string, string>>

export class SecretsUnreadableError extends Error {
  constructor() {
    super('Stored payment secrets could not be decrypted.')
    this.name = 'SecretsUnreadableError'
  }
}

/**
 * Decrypts the stored secrets. A present-but-unreadable blob (wrong key,
 * corruption, bad JSON) THROWS instead of reading as "no secrets": returning
 * `{}` there would let the next save silently overwrite the owner's real
 * credentials. Nothing from the ciphertext or plaintext is logged by callers.
 */
export function readStoredSecrets(encrypted: string | null): StoredSecrets {
  if (!encrypted) return {}
  try {
    const parsed: unknown = JSON.parse(decryptSecret(encrypted))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new SecretsUnreadableError()
    }
    return parsed as StoredSecrets
  } catch {
    throw new SecretsUnreadableError()
  }
}
