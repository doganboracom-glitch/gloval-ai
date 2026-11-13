/** Pure validation and copy for the admin site handover screen; the DB enforces the same rules again. */

export const MIN_REASON_LENGTH = 10
export const MAX_IDEMPOTENCY_KEY_LENGTH = 80

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value.trim())
}

export function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export type ProjectHandoverForm = {
  projectId: string
  fromUserId: string
  toEmail: string
  reason: string
  idempotencyKey: string
  ack: boolean
  forceQuota: boolean
}

export type ProjectHandoverFormError =
  | 'bad_project'
  | 'bad_owner'
  | 'bad_email'
  | 'reason_required'
  | 'ack_required'
  | 'bad_key'

export function validateProjectHandoverForm(
  raw: Record<string, unknown>,
): { ok: true; form: ProjectHandoverForm } | { ok: false; code: ProjectHandoverFormError } {
  const projectId = typeof raw.projectId === 'string' ? raw.projectId.trim() : ''
  if (!isUuid(projectId)) return { ok: false, code: 'bad_project' }
  const fromUserId = typeof raw.fromUserId === 'string' ? raw.fromUserId.trim() : ''
  if (!isUuid(fromUserId)) return { ok: false, code: 'bad_owner' }
  const toEmail = normalizeEmail(raw.toEmail)
  if (!looksLikeEmail(toEmail)) return { ok: false, code: 'bad_email' }
  const reason = typeof raw.reason === 'string' ? raw.reason.trim() : ''
  if (reason.length < MIN_REASON_LENGTH) return { ok: false, code: 'reason_required' }
  if (raw.ack !== true) return { ok: false, code: 'ack_required' }
  const idempotencyKey = typeof raw.idempotencyKey === 'string' ? raw.idempotencyKey.trim() : ''
  if (!idempotencyKey || idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) return { ok: false, code: 'bad_key' }
  return {
    ok: true,
    form: { projectId, fromUserId, toEmail, reason, idempotencyKey, ack: true, forceQuota: raw.forceQuota === true },
  }
}

const MESSAGES: Record<string, string> = {
  forbidden: 'Bu işlem için yönetici yetkisi gerekir.',
  bad_project: 'Geçerli bir site seçilmedi.',
  bad_owner: 'Mevcut sahip bilgisi eksik; özeti yeniden getirin.',
  bad_email: 'Geçerli bir hedef e-posta girin.',
  reason_required: 'Devir nedenini en az 10 karakterle yazın.',
  ack_required: 'Devri onaylamanız gerekir.',
  bad_key: 'İşlem anahtarı geçersiz; özeti yeniden getirin.',
  bad_request: 'İstek geçersiz.',
  not_found: 'Site bulunamadı.',
  same_owner: 'Site zaten bu hesabın.',
  owner_changed: 'Sitenin sahibi bu arada değişti. Özeti yeniden getirin.',
  target_invalid: 'Hedef hesap bulunamadı, profili yok ya da kapalı.',
  domain_attached: 'Siteye başka bir hesaba ait alan adı bağlı. Önce alan adı devrini veya ayırmayı yapın.',
  quota_exceeded: 'Hedef hesabın site hakkı dolu. Zorla devir için kota aşımını onaylayın.',
  idempotency_key_reuse: 'Bu işlem anahtarı başka bir devirde kullanılmış. Özeti yeniden getirin.',
  rpc_failed: 'Devir tamamlanamadı. Hiçbir veri taşınmadı; tekrar deneyin.',
}

export function projectHandoverErrorMessage(code: string): string {
  return MESSAGES[code] ?? MESSAGES.rpc_failed
}

export const WARNING_LABELS: Record<string, string> = {
  published: 'Site yayında; devirden sonra hedef hesabın yayın hakkını kullanır.',
  quota_exceeded: 'Hedef hesabın site hakkı dolu; devir için kota aşımı onayı gerekir.',
  target_site_full: 'Hedef hesabın yayın hakkı dolu; site taslak olduğu için devredilir, ancak yayınlanamaz.',
  ecommerce_plan_missing: 'Mağaza sitesi, hedef hesapta e-ticaret hakkı yok.',
  target_unconfirmed: 'Hedef e-posta henüz doğrulanmamış; hesap giriş yapamayabilir.',
}

export const BLOCKER_LABELS: Record<string, string> = {
  not_found: 'Site bulunamadı.',
  same_owner: 'Site zaten bu hesabın.',
  target_invalid: 'Hedef hesap bulunamadı, profili yok ya da kapalı.',
  domain_attached: 'Siteye başka bir hesaba ait alan adı bağlı; önce alan adı devri/ayırma gerekir.',
}
