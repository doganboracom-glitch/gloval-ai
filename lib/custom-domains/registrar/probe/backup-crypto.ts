import { decryptAuthCode, encryptAuthCode } from '../transfer-crypto'
import type { DomainContact } from '../types'

/**
 * Key-derivation label for the registrar-probe contact backup. It is mixed into
 * the key (HMAC-SHA256 over DOMAIN_TRANSFER_SECRET), so a backup can not be opened
 * with the key used for EPP codes and vice versa. Changing it orphans every backup,
 * so it is versioned.
 */
export const PROBE_BACKUP_KEY_LABEL = 'gloval/registrar-probe/contact-backup/v1'

/**
 * AES-256-GCM. The ciphertext carries no expiry: the bounded lifetime is the
 * `backup_expires_at` column (24 hours, 7 days for registrant runs, enforced by the
 * drp_backup_window CHECK), `submitProbeChange` refuses an expired backup, and
 * `purge_registrar_probe_backups()` nulls `backup_enc` once it has passed.
 */
export function encryptContactBackup(contact: DomainContact): string | null {
  return encryptAuthCode(JSON.stringify(contact), PROBE_BACKUP_KEY_LABEL)
}

export function decryptContactBackup(payload: string): DomainContact | null {
  const plain = decryptAuthCode(payload, PROBE_BACKUP_KEY_LABEL)
  if (!plain) return null
  try {
    return JSON.parse(plain) as DomainContact
  } catch {
    return null
  }
}
