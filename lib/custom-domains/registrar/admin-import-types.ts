export type AdminDomainImportError =
  | 'invalid_domain'
  | 'registrar_unavailable'
  | 'domain_not_owned'
  | 'domain_not_active'
  | 'expiry_unavailable'
  | 'domain_expired'
  | 'invalid_email'
  | 'target_not_found'
  | 'target_not_confirmed'
  | 'target_inactive'
  | 'reason_required'
  | 'rate_limited'
  | 'domain_exists'
  | 'domain_linked'
  | 'order_active'
  | 'import_pending'
  | 'second_admin_required'
  | 'request_not_found'
  | 'request_closed'
  | 'idempotency_conflict'
  | 'unavailable'

export type ExpiresAtSource = 'provider_explicit' | 'assumed_istanbul'

export type RegistrarImportPreview = {
  domain: string
  expiresAt: string
  expiresAtSource: ExpiresAtSource
  nameservers: string[]
}

export type PreviewAdminDomainImportResult =
  | { ok: true; preview: RegistrarImportPreview }
  | { ok: false; error: AdminDomainImportError }

export type AdminDomainImportResult =
  | {
      ok: true
      status: 'pending_approval' | 'imported'
      requestId: string
      domain: string
      orderId?: string
      customDomainId?: string
      requiresSecondAdmin: boolean
      replayed?: boolean
    }
  | { ok: false; error: AdminDomainImportError }

export type PendingAdminDomainImport = {
  id: string
  domain: string
  targetEmail: string
  requestedByEmail: string
  reason: string
  createdAt: string
  expiresAt: string
  nameservers: string[]
}

export type PendingAdminDomainImportsResult = {
  ready: boolean
  items: PendingAdminDomainImport[]
}
