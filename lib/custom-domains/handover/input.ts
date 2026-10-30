import type { ReleaseMode } from './notice-copy'

/** Pure validation for the handover admin forms; the DB enforces the same rules again. */

export const MIN_REASON_LENGTH = 10
export const MIN_CONSENT_NOTE_LENGTH = 10
export const MIN_TICKET_LENGTH = 3

export function normalizeDomainInput(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function normalizeEmailInput(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export type HandoverFormError =
  | 'bad_domain'
  | 'bad_email'
  | 'reason_required'
  | 'giver_waiver_required'
  | 'giver_waiver_ticket_required'
  | 'confirm_mismatch'
  | 'ack_required'

export type HandoverForm = {
  domain: string
  toEmail: string
  reason: string
  giverWaiverConfirmed: boolean
  giverWaiverTicket: string
  confirmDomain: string
  idempotencyKey: string
  mailboxCountUnknownAck: boolean
}

export function validateHandoverForm(raw: Record<string, unknown>): { ok: true; form: HandoverForm } | { ok: false; code: HandoverFormError } {
  const domain = normalizeDomainInput(raw.domain)
  if (!domain || !domain.includes('.')) return { ok: false, code: 'bad_domain' }
  const toEmail = normalizeEmailInput(raw.toEmail)
  if (!toEmail.includes('@')) return { ok: false, code: 'bad_email' }
  const reason = typeof raw.reason === 'string' ? raw.reason.trim() : ''
  if (reason.length < MIN_REASON_LENGTH) return { ok: false, code: 'reason_required' }
  if (raw.giverWaiverConfirmed !== true && raw.giverWaiverConfirmed !== 'true' && raw.giverWaiverConfirmed !== 'on') {
    return { ok: false, code: 'giver_waiver_required' }
  }
  const giverWaiverTicket = typeof raw.giverWaiverTicket === 'string' ? raw.giverWaiverTicket.trim() : ''
  if (giverWaiverTicket.length < MIN_TICKET_LENGTH) return { ok: false, code: 'giver_waiver_ticket_required' }
  if (normalizeDomainInput(raw.confirmDomain) !== domain) return { ok: false, code: 'confirm_mismatch' }
  const idempotencyKey = typeof raw.idempotencyKey === 'string' ? raw.idempotencyKey.trim() : ''
  if (!idempotencyKey || idempotencyKey.length > 80) return { ok: false, code: 'ack_required' }
  return {
    ok: true,
    form: {
      domain,
      toEmail,
      reason,
      giverWaiverConfirmed: true,
      giverWaiverTicket,
      confirmDomain: domain,
      idempotencyKey,
      mailboxCountUnknownAck: raw.mailboxCountUnknownAck === true || raw.mailboxCountUnknownAck === 'on',
    },
  }
}

/** The `p_meta` sent to `handover_registrar_domain`. The waiver flag is a JSON boolean, never a string. */
export function buildHandoverMeta(form: HandoverForm, mailboxCount: number | null): Record<string, unknown> {
  return {
    giver_waiver_confirmed: true,
    giver_waiver_ticket: form.giverWaiverTicket,
    mailbox_count_at_handover: mailboxCount,
    mailbox_count_unknown_acknowledged: mailboxCount === null ? form.mailboxCountUnknownAck : false,
  }
}

export type ReleaseFormError = 'bad_release_mode' | 'consent_note_required' | 'confirm_mismatch' | 'ack_required'

export function validateReleaseForm(raw: Record<string, unknown>, domain: string):
  | { ok: true; mode: ReleaseMode; consentNote: string | null; idempotencyKey: string }
  | { ok: false; code: ReleaseFormError } {
  const mode = raw.mode
  if (mode !== 'empty_handover' && mode !== 'keep_mailboxes_with_consent') return { ok: false, code: 'bad_release_mode' }
  const note = typeof raw.consentNote === 'string' ? raw.consentNote.trim() : ''
  if (mode === 'keep_mailboxes_with_consent' && note.length < MIN_CONSENT_NOTE_LENGTH) {
    return { ok: false, code: 'consent_note_required' }
  }
  if (normalizeDomainInput(raw.confirmDomain) !== normalizeDomainInput(domain)) return { ok: false, code: 'confirm_mismatch' }
  if (raw.ack !== true && raw.ack !== 'on') return { ok: false, code: 'ack_required' }
  const idempotencyKey = typeof raw.idempotencyKey === 'string' ? raw.idempotencyKey.trim() : ''
  if (!idempotencyKey || idempotencyKey.length > 80) return { ok: false, code: 'ack_required' }
  return { ok: true, mode, consentNote: mode === 'keep_mailboxes_with_consent' ? note : null, idempotencyKey }
}

/** Turkish admin messages for every error code the screen can show. */
export const HANDOVER_ERROR_TR: Record<string, string> = {
  bad_domain: 'Geçerli bir alan adı girin.',
  bad_email: 'Geçerli bir e-posta girin.',
  reason_required: 'Gerekçe en az 10 karakter olmalı.',
  giver_waiver_required: 'Devreden tarafın yazılı beyanı onaylanmadan devir yapılamaz.',
  giver_waiver_ticket_required: 'Destek talebi numarası zorunlu.',
  confirm_mismatch: 'Onay için yazılan alan adı eşleşmiyor.',
  ack_required: 'Onay kutusu işaretlenmeli.',
  domain_not_found: 'Alan adı bulunamadı.',
  owner_changed: 'Alan adının sahibi bu arada değişti; sayfayı yenileyin.',
  already_owned_by_target: 'Alan adı zaten bu kullanıcıda.',
  target_not_found: 'Hedef kullanıcı bulunamadı.',
  target_email_mismatch: 'Hedef kullanıcının e-postası eşleşmiyor.',
  target_unconfirmed: 'Hedef kullanıcının e-postası doğrulanmamış.',
  target_banned: 'Hedef kullanıcı yasaklı.',
  not_registrar_domain: 'Yalnızca registrar alan adları devredilebilir.',
  no_order: 'Alan adının siparişi yok (transfer-in alan adları kapsam dışı).',
  domain_not_active: 'Alan adı aktif değil.',
  domain_expired: 'Alan adının süresi dolmuş.',
  order_not_active: 'Sipariş aktif değil.',
  order_domain_mismatch: 'Sipariş ile alan adı uyuşmuyor.',
  order_owner_mismatch: 'Sipariş sahibi ile alan adı sahibi uyuşmuyor.',
  open_job: 'Bu alan adı için açık sipariş/transfer/yenileme var.',
  idempotency_key_reuse: 'Bu işlem anahtarı başka bir işlemde kullanılmış; sayfayı yenileyin.',
  not_held: 'Alan adı karantinada değil.',
  handover_mismatch: 'Karantina bu devire ait değil.',
  bad_release_mode: 'Geçersiz teslim modu.',
  consent_note_required: 'Eski sahibin yazılı onayını içeren not en az 10 karakter olmalı.',
  mailbox_count_unknown: 'Kutu sayısı okunamadı; Mailcow’u yeniden okuyun.',
  mailboxes_not_cleared: 'Alan adında hâlâ e-posta kutusu var; önce Mailcow’dan elle silin.',
  mailbox_count_stale: 'Kutu sayısı eskidi; Mailcow’u yeniden okuyun.',
  second_admin_required: 'Bu işlem için ikinci bir adminin onay talebi gerekiyor.',
  second_admin_same_person: 'Talebi oluşturan kişi onaylayamaz.',
  request_mismatch: 'Talep ile seçilen mod/not uyuşmuyor.',
  forbidden: 'Yetkiniz yok.',
  rpc_failed: 'İşlem tamamlanamadı; tekrar deneyin.',
}

export function handoverErrorMessage(code: string): string {
  return HANDOVER_ERROR_TR[code] ?? 'İşlem tamamlanamadı.'
}

export const WAIVER_LABEL =
  'Devreden taraf kendi verilerini yedeklediğini ve devir sonrası alan adı üzerinde hak talep etmeyeceğini yazılı beyan etti (destek talebi no: ...)'

export function isHandoverSubmitEnabled(input: {
  canHandover: boolean
  waiver: boolean
  ticket: string
  reason: string
  confirmDomain: string
  domain: string
  mailboxUnknown: boolean
  mailboxUnknownAck: boolean
  pending: boolean
}): boolean {
  return (
    input.canHandover &&
    input.waiver &&
    input.ticket.trim().length >= 3 &&
    input.reason.trim().length >= 10 &&
    input.confirmDomain.trim().toLowerCase() === input.domain &&
    (!input.mailboxUnknown || input.mailboxUnknownAck) &&
    !input.pending
  )
}

