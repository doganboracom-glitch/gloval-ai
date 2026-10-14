/**
 * Pure readiness rules for a store's card provider. No I/O imports so it can
 * be unit-tested; the database reads are injected by the caller.
 *
 * Three distinct "not ready" causes, each shown differently to the owner:
 * - `unreadable`: stored credentials could not be read/decrypted
 * - not tested (default): keys missing or the connection test has not passed
 * - `infrastructure`: connection is tested but the platform database is
 *   missing the order columns (a platform problem the owner cannot fix)
 */
export type CardReadiness = {
  ready: boolean
  unreadable: boolean
  infrastructure: boolean
}

export type CredentialState =
  | { ok: true; tested: boolean }
  | { ok: false; reason: 'not_configured' | 'unreadable' }

/**
 * `columnsReady` is only awaited once the connection test has passed, so an
 * untested store is always reported as "not tested" (the owner's next step),
 * never as an infrastructure fault.
 */
export async function resolveIyzicoReadiness(
  loaded: CredentialState,
  columnsReady: () => Promise<boolean>,
): Promise<CardReadiness> {
  if (!loaded.ok) {
    return { ready: false, unreadable: loaded.reason === 'unreadable', infrastructure: false }
  }
  if (!loaded.tested) {
    return { ready: false, unreadable: false, infrastructure: false }
  }
  if (!(await columnsReady())) {
    return { ready: false, unreadable: false, infrastructure: true }
  }
  return { ready: true, unreadable: false, infrastructure: false }
}
