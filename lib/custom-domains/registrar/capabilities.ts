/**
 * What the registrar is allowed to change for a customer, as observed in real
 * DomainNameAPI OTE tests. Pure constants (no server imports) so the UI and the
 * server read the same truth.
 *
 *  - nameserverChange: ModifyNameServer answered `API_403`.
 *  - transferLockChange: DisableTheftProtectionLock answered `OK` but the lock
 *    state read back unchanged, so a success cannot be trusted.
 *
 * Both stay `false` until DomainNameAPI confirms the behaviour and a new OTE
 * test proves it. The adapter methods are intentionally left in place; they are
 * simply not reachable while these flags are off.
 */
export const REGISTRAR_CAPABILITIES = {
  nameserverChange: false,
  transferLockChange: false,
} as const

export type RegistrarCapability = keyof typeof REGISTRAR_CAPABILITIES
