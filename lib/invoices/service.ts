import 'server-only'
import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { BILLING_PROFILE_COLUMNS, isBillingProfileRowComplete, type BillingProfileDatabaseRow } from '@/lib/billing-profile-store'
import { recordInvoiceAudit } from '@/lib/invoices/audit'
import {
  enqueueInvoiceReadyEmail,
  hasActiveInvoiceEmail,
  resolveInvoiceRecipient,
  type InvoiceEmailQueueResult,
} from '@/lib/email-outbox'
import { deriveInvoiceEmailStatus, type InvoiceEmailEvent } from '@/lib/invoices/email-status'
import {
  INVOICE_BUCKET,
  INVOICE_ELIGIBLE_KINDS,
  INVOICE_PAGE_SIZE,
  INVOICE_SCAN_LIMIT,
  INVOICE_SIGNED_URL_SECONDS,
} from '@/lib/invoices/constants'
import { buildInvoicesCsv } from '@/lib/invoices/csv'
import { applyInvoiceFilters, countByStatus, inScope, isValidDateInput, paginate } from '@/lib/invoices/filter'
import {
  archiveStoragePath,
  downloadFileName,
  inspectPdf,
  invoiceStoragePath,
  isInvoiceStoragePath,
  sanitizeUploadedFileName,
  sha256Hex,
} from '@/lib/invoices/pdf'
import { getInvoiceProvider } from '@/lib/invoices/provider'
import { classifyPayment, expectsInvoice, isInvoiceEligible } from '@/lib/invoices/scope'
import { buildBillingSnapshot } from '@/lib/invoices/snapshot'
import { transactionNumberFor } from '@/lib/invoices/transaction-number'
import type {
  AdminInvoiceRow,
  InvoiceActionError,
  InvoiceFilters,
  InvoiceListResult,
  InvoiceRecordSummary,
} from '@/lib/invoices/types'

type Actor = { userId: string; email: string }
export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: InvoiceActionError }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type TransactionRow = {
  id: string
  user_id: string | null
  kind: string
  amount_cents: number
  currency: string | null
  status: string
  provider: string | null
  provider_ref: string | null
  description: string | null
  idempotency_key: string | null
  created_at: string
}

type InvoiceRow = {
  id: string
  billing_transaction_id: string
  status: 'uploaded' | 'not_required'
  invoice_number: string | null
  invoice_date: string | null
  file_name: string | null
  file_path?: string | null
  source: string
  not_required_reason: string | null
  updated_at: string
  user_id?: string | null
}

const TX_COLUMNS =
  'id, user_id, kind, amount_cents, currency, status, provider, provider_ref, description, idempotency_key, created_at'
const INVOICE_SUMMARY_COLUMNS = 'id, billing_transaction_id, status, invoice_number, invoice_date, file_name, source, not_required_reason, updated_at'

function summarize(row: InvoiceRow): InvoiceRecordSummary {
  return {
    id: row.id,
    status: row.status,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    fileName: row.file_name,
    source: row.source,
    notRequiredReason: row.not_required_reason,
    updatedAt: row.updated_at,
  }
}

function toRow(
  tx: TransactionRow,
  invoice: InvoiceRow | null,
  who: { email: string; fullName: string } | undefined,
): AdminInvoiceRow {
  return {
    transactionId: tx.id,
    transactionNumber: transactionNumberFor(tx),
    createdAt: tx.created_at,
    userId: tx.user_id,
    email: who?.email ?? '',
    fullName: who?.fullName ?? '',
    provider: tx.provider ?? '',
    category: classifyPayment(tx.idempotency_key),
    description: tx.description ?? '',
    amountKurus: tx.amount_cents,
    currency: tx.currency ?? 'TRY',
    expectsInvoice: expectsInvoice({ provider: tx.provider, amount_cents: tx.amount_cents }),
    invoice: invoice ? summarize(invoice) : null,
    profileComplete: null,
  }
}

async function loadPeople(userIds: string[]): Promise<Map<string, { email: string; fullName: string }>> {
  const admin = createAdminClient()
  const people = new Map<string, { email: string; fullName: string }>()
  for (let index = 0; index < userIds.length; index += 100) {
    const chunk = userIds.slice(index, index + 100)
    const { data } = await admin.from('profiles').select('id, email, full_name').in('id', chunk)
    for (const row of (data ?? []) as Array<{ id: string; email: string | null; full_name: string | null }>) {
      people.set(row.id, { email: row.email ?? '', fullName: row.full_name ?? '' })
    }
  }
  return people
}

async function loadAllRows(): Promise<{ rows: AdminInvoiceRow[]; truncated: boolean } | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('billing_transactions')
    .select(TX_COLUMNS)
    .eq('status', 'succeeded')
    .in('kind', [...INVOICE_ELIGIBLE_KINDS])
    .gte('amount_cents', 0)
    .order('created_at', { ascending: false })
    .limit(INVOICE_SCAN_LIMIT)
  if (error) {
    console.error('[invoices] list failed:', error.message)
    return null
  }
  const transactions = (data ?? []) as TransactionRow[]
  if (transactions.length === 0) return { rows: [], truncated: false }

  const invoiceByTx = new Map<string, InvoiceRow>()
  for (let index = 0; index < transactions.length; index += 200) {
    const ids = transactions.slice(index, index + 200).map((tx) => tx.id)
    const { data: invoices, error: invoiceError } = await admin
      .from('invoices')
      .select(INVOICE_SUMMARY_COLUMNS)
      .in('billing_transaction_id', ids)
    if (invoiceError) {
      console.error('[invoices] invoice lookup failed:', invoiceError.message)
      return null
    }
    for (const invoice of (invoices ?? []) as InvoiceRow[]) invoiceByTx.set(invoice.billing_transaction_id, invoice)
  }

  const userIds = [...new Set(transactions.map((tx) => tx.user_id).filter((id): id is string => Boolean(id)))]
  const people = await loadPeople(userIds)
  return {
    rows: transactions.map((tx) => toRow(tx, invoiceByTx.get(tx.id) ?? null, tx.user_id ? people.get(tx.user_id) : undefined)),
    truncated: transactions.length >= INVOICE_SCAN_LIMIT,
  }
}

async function enrichProfileCompleteness(rows: AdminInvoiceRow[]): Promise<AdminInvoiceRow[]> {
  const userIds = [...new Set(rows.map((row) => row.userId).filter((id): id is string => Boolean(id)))]
  if (userIds.length === 0) return rows
  const { data } = await createAdminClient().from('billing_profiles').select(BILLING_PROFILE_COLUMNS).in('user_id', userIds)
  const complete = new Map<string, boolean>()
  for (const profile of (data ?? []) as BillingProfileDatabaseRow[]) {
    complete.set(profile.user_id, isBillingProfileRowComplete(profile))
  }
  return rows.map((row) => ({ ...row, profileComplete: row.userId ? (complete.get(row.userId) ?? false) : null }))
}

/** Adds the delivery state of the "invoice ready" email to uploaded rows; on any read error the badge is simply omitted. */
async function enrichEmailStatus(rows: AdminInvoiceRow[]): Promise<AdminInvoiceRow[]> {
  const invoiceIds = rows.map((row) => row.invoice?.id).filter((id): id is string => Boolean(id && rows.find((r) => r.invoice?.id === id)?.invoice?.status === 'uploaded'))
  if (invoiceIds.length === 0) return rows
  const admin = createAdminClient()
  const [invoices, events] = await Promise.all([
    admin.from('invoices').select('id, file_sha256').in('id', invoiceIds),
    admin
      .from('email_events')
      .select('invoice_id, status, attachment_state, file_sha256, sent_at, created_at')
      .eq('kind', 'invoice_ready')
      .in('invoice_id', invoiceIds),
  ])
  if (invoices.error || events.error) {
    console.error('[invoices] email status lookup failed:', invoices.error?.message ?? events.error?.message)
    return rows
  }
  const shaById = new Map(((invoices.data ?? []) as Array<{ id: string; file_sha256: string | null }>).map((row) => [row.id, row.file_sha256]))
  const eventsById = new Map<string, InvoiceEmailEvent[]>()
  for (const event of (events.data ?? []) as Array<InvoiceEmailEvent & { invoice_id: string }>) {
    const list = eventsById.get(event.invoice_id) ?? []
    list.push(event)
    eventsById.set(event.invoice_id, list)
  }
  return rows.map((row) => {
    const id = row.invoice?.id
    if (!id || row.invoice?.status !== 'uploaded') return row
    return { ...row, emailStatus: deriveInvoiceEmailStatus(eventsById.get(id) ?? [], shaById.get(id) ?? null) }
  })
}

export async function listInvoiceRows(filters: InvoiceFilters): Promise<InvoiceListResult> {
  const empty: InvoiceListResult = {
    available: false,
    rows: [],
    total: 0,
    page: 1,
    pageSize: INVOICE_PAGE_SIZE,
    counts: { pending: 0, uploaded: 0, not_required: 0, total: 0 },
    truncated: false,
  }
  const all = await loadAllRows()
  if (!all) return empty
  const scoped = all.rows.filter((row) => inScope(row, filters.showTest))
  const filtered = applyInvoiceFilters(all.rows, filters)
  const { items, page } = paginate(filtered, filters.page)
  return {
    available: true,
    rows: await enrichEmailStatus(await enrichProfileCompleteness(items)),
    total: filtered.length,
    page,
    pageSize: INVOICE_PAGE_SIZE,
    counts: countByStatus(scoped),
    truncated: all.truncated,
  }
}

export async function exportInvoiceRows(filters: InvoiceFilters): Promise<AdminInvoiceRow[] | null> {
  const all = await loadAllRows()
  return all ? applyInvoiceFilters(all.rows, { ...filters, page: 1 }) : null
}

export async function exportInvoicesCsv(actor: Actor, filters: InvoiceFilters): Promise<Result<{ csv: string; count: number }>> {
  const rows = await exportInvoiceRows(filters)
  if (!rows) return { ok: false, error: 'unavailable' }
  const audited = await recordInvoiceAudit({
    actor,
    action: 'invoice.export_csv',
    detail: { count: rows.length, status: filters.status, category: filters.category, showTest: filters.showTest, from: filters.from, to: filters.to },
  })
  if (!audited) return { ok: false, error: 'audit_failed' }
  return { ok: true, csv: buildInvoicesCsv(rows), count: rows.length }
}

function todayInIstanbul(): string {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function validateInvoiceNumber(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  // eslint-disable-next-line no-control-regex
  if (value.length < 1 || value.length > 64 || /[\u0000-\u001f\u007f]/.test(value)) return null
  return value
}

export function validateInvoiceDate(raw: unknown): string | null {
  if (typeof raw !== 'string' || !isValidDateInput(raw)) return null
  const tomorrow = new Date(Date.parse(`${todayInIstanbul()}T00:00:00Z`) + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return raw > tomorrow ? null : raw
}

async function loadEligibleTransaction(id: string): Promise<TransactionRow | null> {
  const { data } = await createAdminClient().from('billing_transactions').select(TX_COLUMNS).eq('id', id).maybeSingle()
  const tx = data as TransactionRow | null
  return tx && isInvoiceEligible(tx) ? tx : null
}

async function loadProfile(userId: string | null): Promise<BillingProfileDatabaseRow | null> {
  if (!userId) return null
  const { data } = await createAdminClient().from('billing_profiles').select(BILLING_PROFILE_COLUMNS).eq('user_id', userId).maybeSingle()
  return (data as BillingProfileDatabaseRow | null) ?? null
}

export type SaveInvoiceInput = {
  actor: Actor
  transactionId: string
  invoiceNumber: unknown
  invoiceDate: unknown
  fileBytes: Uint8Array
  fileName: unknown
  /** Replace only: take a fresh copy of the customer's current billing profile. */
  refreshSnapshot: boolean
  /** Queue the "invoice ready" email after the invoice is saved. */
  sendEmail?: boolean
}

export type InvoiceEmailOutcome = 'skipped' | InvoiceEmailQueueResult

function mapWriteError(message: string): InvoiceActionError {
  if (message.includes('invoices_number_uidx')) return 'number_taken'
  if (message.includes('invoices_billing_tx_uidx')) return 'conflict'
  return 'save_failed'
}

/** Creates the invoice for a payment, or replaces the PDF and details of an existing one. */
export async function saveInvoice(
  input: SaveInvoiceInput,
): Promise<Result<{ invoiceId: string; replaced: boolean; email: InvoiceEmailOutcome }>> {
  if (!UUID.test(input.transactionId)) return { ok: false, error: 'invalid_input' }
  const invoiceNumber = validateInvoiceNumber(input.invoiceNumber)
  if (!invoiceNumber) return { ok: false, error: 'invalid_number' }
  const invoiceDate = validateInvoiceDate(input.invoiceDate)
  if (!invoiceDate) return { ok: false, error: 'invalid_date' }
  const inspected = inspectPdf(input.fileBytes)
  if (!inspected.ok) return { ok: false, error: inspected.error }

  const tx = await loadEligibleTransaction(input.transactionId)
  if (!tx) return { ok: false, error: 'not_eligible' }

  const admin = createAdminClient()
  const { data: existingData } = await admin
    .from('invoices')
    .select('id, status, file_path, billing_snapshot, invoice_number')
    .eq('billing_transaction_id', tx.id)
    .maybeSingle()
  const existing = existingData as { id: string; status: string; file_path: string | null; billing_snapshot: unknown; invoice_number: string | null } | null

  const { data: clash } = await admin
    .from('invoices')
    .select('id')
    .eq('status', 'uploaded')
    .ilike('invoice_number', invoiceNumber.replace(/[\\%_]/g, (char) => `\\${char}`))
    .limit(5)
  if (((clash ?? []) as Array<{ id: string }>).some((row) => row.id !== existing?.id)) {
    return { ok: false, error: 'number_taken' }
  }

  const sha256 = await sha256Hex(input.fileBytes)
  const filePath = invoiceStoragePath(tx.user_id, randomUUID())
  const { error: uploadError } = await admin.storage
    .from(INVOICE_BUCKET)
    .upload(filePath, input.fileBytes, { contentType: 'application/pdf', upsert: false })
  if (uploadError) {
    console.error('[invoices] storage upload failed:', uploadError.message)
    return { ok: false, error: 'storage_failed' }
  }

  let keepSnapshot = false
  let invoiceId: string
  try {
    keepSnapshot = Boolean(existing?.status === 'uploaded' && existing.billing_snapshot && !input.refreshSnapshot)
    const snapshot = keepSnapshot
      ? existing?.billing_snapshot
      : buildBillingSnapshot(await loadProfile(tx.user_id), (await loadPeople(tx.user_id ? [tx.user_id] : [])).get(tx.user_id ?? '')?.email ?? null)

    const issued = await getInvoiceProvider().issue({
      billingTransactionId: tx.id,
      invoiceNumber,
      invoiceDate,
      pdf: input.fileBytes,
      fileName: downloadFileName(invoiceNumber),
    })

    const fields = {
      status: 'uploaded' as const,
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      amount_kurus: tx.amount_cents,
      currency: /^[A-Z]{3}$/.test(tx.currency ?? '') ? (tx.currency as string) : 'TRY',
      billing_snapshot: snapshot,
      file_path: filePath,
      file_name: sanitizeUploadedFileName(input.fileName),
      file_size: input.fileBytes.length,
      file_sha256: sha256,
      source: issued.source,
      provider_ref: issued.providerRef,
      not_required_reason: null,
      uploaded_by: input.actor.userId,
    }

    if (existing) {
      const { error } = await admin.from('invoices').update(fields).eq('id', existing.id)
      if (error) {
        await admin.storage.from(INVOICE_BUCKET).remove([filePath])
        return { ok: false, error: mapWriteError(error.message) }
      }
      invoiceId = existing.id
    } else {
      const { data, error } = await admin
        .from('invoices')
        .insert({ ...fields, user_id: tx.user_id, billing_transaction_id: tx.id })
        .select('id')
        .single()
      if (error || !data) {
        await admin.storage.from(INVOICE_BUCKET).remove([filePath])
        return { ok: false, error: mapWriteError(error?.message ?? '') }
      }
      invoiceId = (data as { id: string }).id
    }
  } catch (error) {
    // Anything thrown after the upload (profile lookup, provider) must not leave an orphan file; the previous file is untouched.
    console.error('[invoices] save failed after upload:', error instanceof Error ? error.message : error)
    await admin.storage.from(INVOICE_BUCKET).remove([filePath])
    return { ok: false, error: 'save_failed' }
  }

  if (existing?.file_path && existing.file_path !== filePath) {
    const { error } = await admin.storage.from(INVOICE_BUCKET).remove([existing.file_path])
    if (error) console.error('[invoices] old file cleanup failed:', error.message)
  }

  const replaced = existing?.status === 'uploaded'
  await recordInvoiceAudit({
    actor: input.actor,
    action: replaced ? 'invoice.replace' : 'invoice.upload',
    invoiceId,
    billingTransactionId: tx.id,
    detail: {
      invoiceNumber,
      invoiceDate,
      fileSize: input.fileBytes.length,
      sha256,
      category: classifyPayment(tx.idempotency_key),
      snapshotRefreshed: !keepSnapshot,
      previousStatus: existing?.status ?? null,
      emailRequested: Boolean(input.sendEmail),
    },
  })

  // The invoice is already saved: an email problem is reported, never rolled back.
  const email: InvoiceEmailOutcome = input.sendEmail
    ? await enqueueInvoiceReadyEmail({ invoiceId, userId: tx.user_id, fileSha256: sha256 })
    : 'skipped'
  return { ok: true, invoiceId, replaced, email }
}

/** Sends the "invoice ready" email again. The audit row is written first; no audit, no email. */
export async function resendInvoiceEmail(actor: Actor, transactionId: unknown): Promise<Result<{ status: 'queued' }>> {
  if (typeof transactionId !== 'string' || !UUID.test(transactionId)) return { ok: false, error: 'invalid_input' }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('invoices')
    .select('id, status, user_id, invoice_number, file_sha256, billing_transaction_id')
    .eq('billing_transaction_id', transactionId)
    .maybeSingle()
  if (error) return { ok: false, error: 'unavailable' }
  const invoice = data as {
    id: string
    status: string
    user_id: string | null
    invoice_number: string | null
    file_sha256: string | null
    billing_transaction_id: string
  } | null
  if (!invoice || invoice.status !== 'uploaded' || !invoice.file_sha256) return { ok: false, error: 'not_found' }

  if ((await resolveInvoiceRecipient(invoice.user_id)) === 'no_recipient') return { ok: false, error: 'no_recipient' }
  try {
    if (await hasActiveInvoiceEmail(invoice.id)) return { ok: false, error: 'email_in_progress' }
  } catch {
    return { ok: false, error: 'unavailable' }
  }

  const audited = await recordInvoiceAudit({
    actor,
    action: 'invoice.email_resend',
    invoiceId: invoice.id,
    billingTransactionId: invoice.billing_transaction_id,
    detail: { invoiceNumber: invoice.invoice_number, sha256: invoice.file_sha256 },
  })
  if (!audited) return { ok: false, error: 'audit_failed' }

  const queued = await enqueueInvoiceReadyEmail({
    invoiceId: invoice.id,
    userId: invoice.user_id,
    fileSha256: invoice.file_sha256,
    resend: true,
  })
  if (queued === 'queued') return { ok: true, status: 'queued' }
  if (queued === 'in_progress') return { ok: false, error: 'email_in_progress' }
  if (queued === 'no_recipient') return { ok: false, error: 'no_recipient' }
  return { ok: false, error: 'unavailable' }
}

export type MarkNotRequiredResult = {
  marked: number
  skipped: Array<{ transactionId: string; reason: 'not_found' | 'not_eligible' | 'already_invoiced' | 'unchanged' | 'save_failed' }>
}

export async function markNotRequired(
  actor: Actor,
  transactionIds: unknown,
  reasonRaw: unknown,
): Promise<Result<MarkNotRequiredResult>> {
  const reason = typeof reasonRaw === 'string' ? reasonRaw.trim() : ''
  if (reason.length < 3 || reason.length > 500) return { ok: false, error: 'invalid_reason' }
  if (!Array.isArray(transactionIds)) return { ok: false, error: 'invalid_input' }
  const ids = [...new Set(transactionIds.filter((id): id is string => typeof id === 'string' && UUID.test(id)))]
  if (ids.length === 0 || ids.length !== new Set(transactionIds).size || ids.length > 100) {
    return { ok: false, error: 'invalid_input' }
  }

  const admin = createAdminClient()
  const [{ data: txData }, { data: invoiceData }] = await Promise.all([
    admin.from('billing_transactions').select(TX_COLUMNS).in('id', ids),
    admin.from('invoices').select('id, billing_transaction_id, status').in('billing_transaction_id', ids),
  ])
  const transactions = new Map(((txData ?? []) as TransactionRow[]).map((tx) => [tx.id, tx]))
  const invoices = new Map(((invoiceData ?? []) as Array<{ id: string; billing_transaction_id: string; status: string }>).map((row) => [row.billing_transaction_id, row]))

  const skipped: MarkNotRequiredResult['skipped'] = []
  let marked = 0
  for (const id of ids) {
    const tx = transactions.get(id)
    if (!tx) {
      skipped.push({ transactionId: id, reason: 'not_found' })
      continue
    }
    if (!isInvoiceEligible(tx)) {
      skipped.push({ transactionId: id, reason: 'not_eligible' })
      continue
    }
    const current = invoices.get(id)
    if (current) {
      skipped.push({ transactionId: id, reason: current.status === 'uploaded' ? 'already_invoiced' : 'unchanged' })
      continue
    }
    const { data, error } = await admin
      .from('invoices')
      .insert({
        user_id: tx.user_id,
        billing_transaction_id: tx.id,
        status: 'not_required',
        amount_kurus: tx.amount_cents,
        currency: /^[A-Z]{3}$/.test(tx.currency ?? '') ? (tx.currency as string) : 'TRY',
        not_required_reason: reason,
        uploaded_by: actor.userId,
      })
      .select('id')
      .single()
    if (error || !data) {
      console.error('[invoices] mark not required failed:', error?.message)
      skipped.push({ transactionId: id, reason: 'save_failed' })
      continue
    }
    marked += 1
    await recordInvoiceAudit({
      actor,
      action: 'invoice.mark_not_required',
      invoiceId: (data as { id: string }).id,
      billingTransactionId: tx.id,
      detail: { reason, provider: tx.provider, category: classifyPayment(tx.idempotency_key), bulk: ids.length > 1 },
    })
  }
  return { ok: true, marked, skipped }
}

/**
 * Turns an uploaded invoice back into "not required" (a wrong or test upload).
 * Order: audit row (refused without it; it carries the previous number, hash
 * and archive path), then the PDF is moved to `_archived/<invoice_id>-<ts>.pdf`
 * in the same private bucket (never deleted, never signed), then the row is
 * updated. A failed move leaves the row untouched; a failed update moves the
 * PDF back.
 */
export async function convertUploadedToNotRequired(
  actor: Actor,
  transactionId: unknown,
  reasonRaw: unknown,
): Promise<Result> {
  const reason = typeof reasonRaw === 'string' ? reasonRaw.trim() : ''
  if (reason.length < 3 || reason.length > 500) return { ok: false, error: 'invalid_reason' }
  if (typeof transactionId !== 'string' || !UUID.test(transactionId)) return { ok: false, error: 'invalid_input' }

  const admin = createAdminClient()
  const { data } = await admin
    .from('invoices')
    .select('id, status, invoice_number, invoice_date, file_path, file_sha256')
    .eq('billing_transaction_id', transactionId)
    .maybeSingle()
  const current = data as {
    id: string
    status: string
    invoice_number: string | null
    invoice_date: string | null
    file_path: string | null
    file_sha256: string | null
  } | null
  if (!current || current.status !== 'uploaded') return { ok: false, error: 'not_found' }

  const archivePath = isInvoiceStoragePath(current.file_path) ? archiveStoragePath(current.id, Date.now() / 1000) : null
  const auditBase = { actor, action: 'invoice.mark_not_required' as const, invoiceId: current.id, billingTransactionId: transactionId }

  // 1. Audit first: without the trail (previous number, hash, archive path) nothing changes.
  const audited = await recordInvoiceAudit({
    ...auditBase,
    detail: {
      reason,
      outcome: 'attempt',
      previousStatus: 'uploaded',
      previousInvoiceNumber: current.invoice_number,
      previousInvoiceDate: current.invoice_date,
      previousSha256: current.file_sha256,
      archivePath,
      bulk: false,
    },
  })
  if (!audited) return { ok: false, error: 'audit_failed' }

  // 2. Move the PDF into the server-only archive. A failure aborts with the row untouched.
  if (archivePath && current.file_path) {
    const { error: moveError } = await admin.storage.from(INVOICE_BUCKET).move(current.file_path, archivePath)
    if (moveError) {
      console.error('[invoices] archive move failed:', moveError.message)
      await recordInvoiceAudit({ ...auditBase, detail: { reason, outcome: 'aborted_archive_failed', archivePath } })
      return { ok: false, error: 'storage_failed' }
    }
  }

  // 3. Only now change the row. If that fails, put the PDF back so the row and its file agree again.
  const { data: updated, error } = await admin
    .from('invoices')
    .update({
      status: 'not_required',
      not_required_reason: reason,
      invoice_number: null,
      invoice_date: null,
      file_path: null,
      file_name: null,
      file_size: null,
      file_sha256: null,
      billing_snapshot: null,
      source: 'manual',
      provider_ref: null,
      uploaded_by: actor.userId,
    })
    .eq('id', current.id)
    .eq('status', 'uploaded')
    .select('id')
  if (error || !updated || updated.length === 0) {
    console.error('[invoices] convert to not required failed:', error?.message)
    let restored = archivePath === null
    if (archivePath && current.file_path) {
      const { error: restoreError } = await admin.storage.from(INVOICE_BUCKET).move(archivePath, current.file_path)
      restored = !restoreError
      if (restoreError) console.error('[invoices] archive restore failed:', restoreError.message)
    }
    await recordInvoiceAudit({
      ...auditBase,
      detail: { reason, outcome: restored ? 'aborted_save_failed' : 'aborted_save_failed_file_in_archive', archivePath },
    })
    return { ok: false, error: 'save_failed' }
  }
  return { ok: true }
}

export type ReopenResult = {
  reopened: number
  skipped: Array<{ transactionId: string; reason: 'not_found' | 'audit_failed' | 'save_failed' }>
}

/**
 * Sends "not required" payments back to Pending. Pending means "no invoices
 * row", so this deletes the row, and only a `not_required` one: an uploaded
 * invoice is refused up front (nothing in the request changes) and the
 * database trigger enforces the same rule. Per row: the audit entry is written
 * first (previous reason and payment id; no identity data), and if it cannot be
 * written processing stops and nothing more is deleted. The delete is
 * conditional on status so a row uploaded in the meantime survives.
 */
export async function reopenNotRequired(actor: Actor, transactionIds: unknown): Promise<Result<ReopenResult>> {
  if (!Array.isArray(transactionIds)) return { ok: false, error: 'invalid_input' }
  const ids = transactionIds.filter((id): id is string => typeof id === 'string' && UUID.test(id))
  if (ids.length === 0 || ids.length !== transactionIds.length || new Set(ids).size !== ids.length || ids.length > 100) {
    return { ok: false, error: 'invalid_input' }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('invoices')
    .select('id, billing_transaction_id, status, not_required_reason')
    .in('billing_transaction_id', ids)
  if (error) {
    console.error('[invoices] reopen lookup failed:', error.message)
    return { ok: false, error: 'unavailable' }
  }
  const rows = (data ?? []) as Array<{ id: string; billing_transaction_id: string; status: string; not_required_reason: string | null }>
  if (rows.some((row) => row.status !== 'not_required')) return { ok: false, error: 'not_reopenable' }
  const byTransaction = new Map(rows.map((row) => [row.billing_transaction_id, row]))

  const skipped: ReopenResult['skipped'] = []
  let reopened = 0
  let halted = false
  for (const id of ids) {
    if (halted) {
      skipped.push({ transactionId: id, reason: 'audit_failed' })
      continue
    }
    const row = byTransaction.get(id)
    if (!row) {
      skipped.push({ transactionId: id, reason: 'not_found' })
      continue
    }
    const auditBase = { actor, action: 'invoice.reopen' as const, invoiceId: row.id, billingTransactionId: id }
    const audited = await recordInvoiceAudit({
      ...auditBase,
      detail: { outcome: 'attempt', previousReason: row.not_required_reason, billingTransactionId: id, bulk: ids.length > 1 },
    })
    if (!audited) {
      halted = true
      skipped.push({ transactionId: id, reason: 'audit_failed' })
      continue
    }
    const { data: deleted, error: deleteError } = await admin
      .from('invoices')
      .delete()
      .eq('id', row.id)
      .eq('status', 'not_required')
      .select('id')
    if (deleteError || !deleted || deleted.length === 0) {
      console.error('[invoices] reopen delete failed:', deleteError?.message)
      await recordInvoiceAudit({ ...auditBase, detail: { outcome: 'aborted_delete_failed', billingTransactionId: id } })
      skipped.push({ transactionId: id, reason: 'save_failed' })
      continue
    }
    reopened += 1
  }
  if (reopened === 0 && halted) return { ok: false, error: 'audit_failed' }
  return { ok: true, reopened, skipped }
}

async function signedUrlFor(filePath: string | null, invoiceNumber: string | null) {
  if (!isInvoiceStoragePath(filePath)) return null
  const { data, error } = await createAdminClient()
    .storage.from(INVOICE_BUCKET)
    .createSignedUrl(filePath, INVOICE_SIGNED_URL_SECONDS, { download: downloadFileName(invoiceNumber ?? 'belge') })
  if (error || !data?.signedUrl) {
    console.error('[invoices] sign failed:', error?.message)
    return null
  }
  return data.signedUrl
}

export async function createAdminDownload(actor: Actor, invoiceId: string): Promise<Result<{ url: string }>> {
  if (!UUID.test(invoiceId)) return { ok: false, error: 'invalid_input' }
  const { data } = await createAdminClient()
    .from('invoices')
    .select('id, billing_transaction_id, status, invoice_number, file_path')
    .eq('id', invoiceId)
    .maybeSingle()
  const invoice = data as { id: string; billing_transaction_id: string; status: string; invoice_number: string | null; file_path: string | null } | null
  if (!invoice || invoice.status !== 'uploaded' || !isInvoiceStoragePath(invoice.file_path)) return { ok: false, error: 'not_found' }
  const audited = await recordInvoiceAudit({
    actor,
    action: 'invoice.download_admin',
    invoiceId: invoice.id,
    billingTransactionId: invoice.billing_transaction_id,
  })
  if (!audited) return { ok: false, error: 'audit_failed' }
  const url = await signedUrlFor(invoice.file_path, invoice.invoice_number)
  return url ? { ok: true, url } : { ok: false, error: 'storage_failed' }
}

/**
 * `invoice` must come from a query made with the customer's own session, so
 * row level security has already proven ownership; the explicit user check is
 * a second guard, and the path is read server-side with the service role only
 * after both agree.
 */
export async function createCustomerDownload(
  actor: Actor,
  invoice: { id: string; user_id: string | null; billing_transaction_id: string; status: string },
): Promise<Result<{ url: string }>> {
  if (invoice.user_id !== actor.userId || invoice.status !== 'uploaded') return { ok: false, error: 'not_found' }
  const { data } = await createAdminClient()
    .from('invoices')
    .select('invoice_number, file_path, user_id')
    .eq('id', invoice.id)
    .maybeSingle()
  const row = data as { invoice_number: string | null; file_path: string | null; user_id: string | null } | null
  if (!row || row.user_id !== actor.userId) return { ok: false, error: 'not_found' }
  // No servable file means nothing is handed out, so nothing is audited as a download either.
  if (!isInvoiceStoragePath(row.file_path)) return { ok: false, error: 'not_found' }
  const audited = await recordInvoiceAudit({
    actor,
    action: 'invoice.download_customer',
    invoiceId: invoice.id,
    billingTransactionId: invoice.billing_transaction_id,
  })
  if (!audited) return { ok: false, error: 'audit_failed' }
  const url = await signedUrlFor(row.file_path, row.invoice_number)
  return url ? { ok: true, url } : { ok: false, error: 'storage_failed' }
}
