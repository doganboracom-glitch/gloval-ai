/**
 * Capabilities exposed to customers. Nameserver writes use the existing
 * ModifyNameServer adapter and are read back before success is reported; the
 * server additionally requires ownership, an active unexpired registration,
 * and a per-user rate-limit reservation. Provider refusals remain generic.
 * Transfer-lock updates stay disabled because the provider did not reflect the
 * change in its read-back.
 */
export const REGISTRAR_CAPABILITIES = {
  nameserverChange: true,
  transferLockChange: false,
} as const

export type RegistrarCapability = keyof typeof REGISTRAR_CAPABILITIES
