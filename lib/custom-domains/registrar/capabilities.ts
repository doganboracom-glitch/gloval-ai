import 'server-only'

import { REGISTRAR_PUBLIC_CAPABILITIES } from './capabilities-public'

/** Server-side capability defaults. Transfer-lock writes require an explicit flag. */
export const REGISTRAR_CAPABILITIES = REGISTRAR_PUBLIC_CAPABILITIES

export type RegistrarCapability = keyof typeof REGISTRAR_CAPABILITIES | 'transferLockChange'

export function isTransferLockChangeEnabled(): boolean {
  return process.env.DOMAIN_TRANSFER_LOCK_CHANGE_ENABLED === '1'
}

export function isRegistrarCapabilityEnabled(capability: RegistrarCapability): boolean {
  return capability === 'transferLockChange'
    ? isTransferLockChangeEnabled()
    : REGISTRAR_CAPABILITIES[capability]
}
