import { createAdminClient } from '@/lib/supabase/admin'
import { getDomainRegistrarProvider } from '../provider'
import { decryptAuthCode, encryptAuthCode } from '../transfer-crypto'
import {
  isContactProbeCapable,
  RegistrarError,
  type DomainContact,
  type DomainContactRole,
} from '../types'
import { contactFingerprint, maskEmail } from './fingerprint'
import {
  backupTtlMs,
  evaluateStartPolicy,
  isProbeContactType,
  isProbeDomainAllowed,
  isProbeEnabled,
  isRegistrantProbeEnabled,
  maxReadbacks,
  nextReadbackAt,
  readbackPhase,
  roleForContactType,
  type ProbeContactType,
  type StartInput,
  type StartPolicyError,
} from './policy'

/**
 * Admin-only registrar verification harness. It answers one question with real
 * evidence: does a single-role WHOIS contact change work at the registrar, and
 * does it stay applied (or get reverted) over the following days?
 *
 * Hard rules: nothing runs unless the flag is on; only allow-listed domains;
 * the original contact is stored encrypted and only for a bounded window;
 * the event log holds hashes and masked values, never contact data.
 */

const RUN_COLUMNS =
  'id, domain, contact_type, status, started_by, registrant_confirmed, test_contact_email_masked, backup_saved_at, backup_expires_at, backup_purged_at, submitted_at, readbacks_done, next_readback_at, readback_lease_until, registrar_cancelable, error_code, note, created_at, updated_at, finished_at'

const RESTORING_STALE_MS = 5 * 60 * 1000

export type ProbeRun = {
  id: string
  domain: string
  contact_type: ProbeContactType
  status: string
  started_by: string | null
  registrant_confirmed: boolean
  test_contact_email_masked: string | null
  backup_saved_at: string | null
  backup_expires_at: string | null
  backup_purged_at: string | null
  submitted_at: string | null
  readbacks_done: number
  next_readback_at: string | null
  readback_lease_until: string | null
  registrar_cancelable: boolean | null
  error_code: string | null
  note: string | null
  created_at: string
  updated_at: string
  finished_at: string | null
}

export type ProbeError =
  | StartPolicyError
  | 'not_found'
  | 'invalid_state'
  | 'run_already_active'
  | 'registrar_unavailable'
  | 'domain_not_at_registrar'
  | 'contact_missing'
  | 'backup_unavailable'
  | 'backup_expired'
  | 'test_email_mismatch'
  | 'note_required'
  | 'submit_failed'
  | 'restore_failed'
  | 'db_error'

export type ProbeResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: ProbeError; detail?: string }

const fail = (error: ProbeError, detail?: string): { ok: false; error: ProbeError; detail?: string } => ({
  ok: false,
  error,
  ...(detail ? { detail } : {}),
})

type EventInput = {
  event: string
  phase?: string
  apiOperation?: string
  apiStatus?: string
  durationMs?: number
  fingerprint?: string | null
  actorId?: string | null
  meta?: Record<string, string | number | boolean | null>
}

async function logEvent(runId: string, e: EventInput): Promise<void> {
  const { error } = await createAdminClient()
    .from('domain_registrar_probe_events')
    .insert({
      run_id: runId,
      event: e.event,
      phase: e.phase ?? null,
      api_operation: e.apiOperation ?? null,
      api_status: e.apiStatus ?? null,
      duration_ms: e.durationMs ?? null,
      contact_fingerprint: e.fingerprint ?? null,
      actor_id: e.actorId ?? null,
      meta: e.meta ?? {},
    })
  if (error) console.log('[registrar-probe] event insert failed:', error.code)
}

type RunWithBackup = ProbeRun & { backup_enc: string | null }

async function loadRun(runId: string): Promise<RunWithBackup | null> {
  const { data } = await createAdminClient()
    .from('domain_registrar_probe_runs')
    .select(`${RUN_COLUMNS}, backup_enc`)
    .eq('id', runId)
    .maybeSingle()
  return (data as RunWithBackup | null) ?? null
}

function registrarOrNull() {
  const provider = getDomainRegistrarProvider()
  return provider && provider.live && isContactProbeCapable(provider) ? provider : null
}

function readBackup(run: RunWithBackup): DomainContact | null {
  if (!run.backup_enc) return null
  const plain = decryptAuthCode(run.backup_enc)
  if (!plain) return null
  try {
    return JSON.parse(plain) as DomainContact
  } catch {
    return null
  }
}

function apiStatusOf(error: unknown): string {
  return error instanceof RegistrarError ? error.code : 'UNEXPECTED'
}

/** Re-checks the live gates on every mutating step, so turning the flag off stops an in-flight run. */
function gateError(run: Pick<ProbeRun, 'domain' | 'contact_type' | 'registrant_confirmed'>): ProbeError | null {
  if (!isProbeEnabled()) return 'probe_disabled'
  if (!isProbeDomainAllowed(run.domain)) return 'domain_not_allowed'
  if (run.contact_type === 'registrant' && (!isRegistrantProbeEnabled() || !run.registrant_confirmed)) {
    return 'registrant_probe_disabled'
  }
  return null
}

export async function startProbeRun(
  input: StartInput & { actorId: string },
): Promise<ProbeResult<{ run: ProbeRun }>> {
  const policy = evaluateStartPolicy(input)
  if (!policy.ok) return fail(policy.error)

  const registrar = registrarOrNull()
  if (!registrar) return fail('registrar_unavailable')

  const role = roleForContactType(policy.contactType)
  let original: DomainContact | null
  try {
    if (!(await registrar.getManagedDetails(policy.domain))) return fail('domain_not_at_registrar')
    original = (await registrar.getContacts(policy.domain))[role]
  } catch (error) {
    return fail('registrar_unavailable', apiStatusOf(error))
  }
  if (!original) return fail('contact_missing')

  const backupEnc = encryptAuthCode(JSON.stringify(original))
  if (!backupEnc) return fail('backup_unavailable')

  const now = new Date()
  const admin = createAdminClient()
  const { data: inserted, error: insertError } = await admin
    .from('domain_registrar_probe_runs')
    .insert({
      domain: policy.domain,
      contact_type: policy.contactType,
      started_by: input.actorId,
      registrant_confirmed: policy.contactType === 'registrant',
      registrant_approval_note: policy.registrantApprovalNote,
      test_contact_email_masked: maskEmail(policy.testEmail),
      backup_enc: backupEnc,
      backup_saved_at: now.toISOString(),
      backup_expires_at: new Date(now.getTime() + backupTtlMs(policy.contactType)).toISOString(),
    })
    .select('id')
    .single()
  if (insertError || !inserted) return fail(insertError?.code === '23505' ? 'run_already_active' : 'db_error')

  const { data: run, error: saveError } = await admin
    .from('domain_registrar_probe_runs')
    .update({ status: 'backup_saved' })
    .eq('id', inserted.id)
    .eq('status', 'created')
    .select(RUN_COLUMNS)
    .single()
  if (saveError || !run) return fail('db_error')

  await logEvent(inserted.id, {
    event: 'backup_saved',
    phase: 'backup',
    fingerprint: contactFingerprint(original),
    actorId: input.actorId,
    meta: { contact_type: policy.contactType },
  })
  return { ok: true, run: run as ProbeRun }
}

export async function submitProbeChange(input: {
  runId: string
  actorId: string
  testEmail: string
}): Promise<ProbeResult<{ run: ProbeRun; applied: boolean | null }>> {
  const run = await loadRun(input.runId)
  if (!run) return fail('not_found')
  if (run.status !== 'backup_saved') return fail('invalid_state', run.status)

  const blocked = gateError(run)
  if (blocked) return fail(blocked)

  const testEmail = input.testEmail.trim().toLowerCase()
  if (maskEmail(testEmail) !== run.test_contact_email_masked) return fail('test_email_mismatch')

  if (!run.backup_expires_at || new Date(run.backup_expires_at).getTime() <= Date.now()) return fail('backup_expired')
  const original = readBackup(run)
  if (!original) return fail('backup_unavailable')

  const registrar = registrarOrNull()
  if (!registrar) return fail('registrar_unavailable')

  const role: DomainContactRole = roleForContactType(run.contact_type)
  const submittedAt = new Date()
  const firstReadback = nextReadbackAt(submittedAt, 0, run.contact_type)

  const { data: claimed } = await createAdminClient()
    .from('domain_registrar_probe_runs')
    .update({
      status: 'change_submitted',
      submitted_at: submittedAt.toISOString(),
      next_readback_at: firstReadback?.toISOString() ?? null,
    })
    .eq('id', run.id)
    .eq('status', 'backup_saved')
    .select('id')
    .maybeSingle()
  if (!claimed) return fail('invalid_state', 'raced')

  const started = Date.now()
  let applied: boolean | null = null
  let apiStatus = 'ok'
  try {
    applied = (await registrar.updateContactRole(run.domain, role, { ...original, email: testEmail })).changed
  } catch (error) {
    apiStatus = apiStatusOf(error)
  }
  await logEvent(run.id, {
    event: 'change_submitted',
    phase: 'submit',
    apiOperation: 'SaveContacts',
    apiStatus,
    durationMs: Date.now() - started,
    actorId: input.actorId,
    meta: { applied },
  })

  let immediate: string | null = null
  try {
    immediate = contactFingerprint((await registrar.getContacts(run.domain))[role])
  } catch {
    immediate = null
  }
  await logEvent(run.id, {
    event: 'readback',
    phase: 'immediate_readback',
    apiOperation: 'GetContacts',
    apiStatus: immediate ? 'ok' : 'error',
    fingerprint: immediate,
    actorId: input.actorId,
    meta: { matches_original: immediate !== null && immediate === contactFingerprint(original) },
  })

  const updated = await loadRun(run.id)
  if (apiStatus !== 'ok') {
    await createAdminClient()
      .from('domain_registrar_probe_runs')
      .update({ error_code: apiStatus })
      .eq('id', run.id)
    return fail('submit_failed', apiStatus)
  }
  return { ok: true, run: stripBackup(updated ?? run), applied }
}

function stripBackup(run: RunWithBackup): ProbeRun {
  const { backup_enc: _backup, ...rest } = run
  return rest
}

export async function restoreProbeRun(input: { runId: string; actorId: string }): Promise<ProbeResult<{ run: ProbeRun }>> {
  const run = await loadRun(input.runId)
  if (!run) return fail('not_found')

  const restorable =
    ['change_submitted', 'observing', 'restore_failed'].includes(run.status) ||
    (run.status === 'restoring' && Date.now() - new Date(run.updated_at).getTime() > RESTORING_STALE_MS)
  if (!restorable) return fail('invalid_state', run.status)

  const original = readBackup(run)
  if (!original) {
    await logEvent(run.id, { event: 'restore_blocked', phase: 'restore', apiStatus: 'backup_missing', actorId: input.actorId })
    return fail('backup_unavailable')
  }
  const registrar = registrarOrNull()
  if (!registrar) return fail('registrar_unavailable')

  const admin = createAdminClient()
  if (run.status !== 'restoring') {
    const { data: claimed } = await admin
      .from('domain_registrar_probe_runs')
      .update({ status: 'restoring' })
      .eq('id', run.id)
      .eq('status', run.status)
      .select('id')
      .maybeSingle()
    if (!claimed) return fail('invalid_state', 'raced')
  } else {
    await admin.from('domain_registrar_probe_runs').update({ note: run.note }).eq('id', run.id)
  }

  const role = roleForContactType(run.contact_type)
  const started = Date.now()
  let apiStatus = 'ok'
  let verified = false
  try {
    await registrar.updateContactRole(run.domain, role, original, { skipValidation: true })
    verified = contactFingerprint((await registrar.getContacts(run.domain))[role]) === contactFingerprint(original)
  } catch (error) {
    apiStatus = apiStatusOf(error)
  }

  await logEvent(run.id, {
    event: verified ? 'restored' : 'restore_failed',
    phase: 'restore',
    apiOperation: 'SaveContacts',
    apiStatus: verified ? 'ok' : apiStatus === 'ok' ? 'not_verified' : apiStatus,
    durationMs: Date.now() - started,
    fingerprint: contactFingerprint(original),
    actorId: input.actorId,
  })

  // The backup is deliberately kept after a successful restore: a registrar may apply the
  // pending test change later (after approvals), and the read-backs need it to restore again.
  const finished = verified && run.readbacks_done >= maxReadbacks(run.contact_type)
  const { error } = await admin
    .from('domain_registrar_probe_runs')
    .update({ status: verified ? 'restored' : 'restore_failed', error_code: verified ? null : apiStatus })
    .eq('id', run.id)
  if (error) return fail('db_error')
  if (finished) await admin.from('domain_registrar_probe_runs').update({ status: 'completed' }).eq('id', run.id)

  const after = await loadRun(run.id)
  if (!verified) return fail('restore_failed', apiStatus)
  return { ok: true, run: stripBackup(after ?? run) }
}

export async function abortProbeRun(input: { runId: string; actorId: string; note?: string }): Promise<ProbeResult<{ run: ProbeRun }>> {
  const run = await loadRun(input.runId)
  if (!run) return fail('not_found')
  if (!['created', 'backup_saved', 'restore_failed'].includes(run.status)) return fail('invalid_state', run.status)

  const note = input.note?.trim() ?? ''
  if (run.status === 'restore_failed' && note.length < 10) return fail('note_required')

  const { data, error } = await createAdminClient()
    .from('domain_registrar_probe_runs')
    .update({
      status: 'aborted',
      note: note ? note.slice(0, 1000) : run.note,
      ...(run.status === 'restore_failed' ? {} : { backup_enc: null, backup_purged_at: new Date().toISOString() }),
    })
    .eq('id', run.id)
    .eq('status', run.status)
    .select(RUN_COLUMNS)
    .maybeSingle()
  if (error || !data) return fail('invalid_state', 'raced')
  await logEvent(run.id, { event: 'aborted', phase: 'manual', actorId: input.actorId })
  return { ok: true, run: data as ProbeRun }
}

export async function listProbeRuns(limit = 50): Promise<ProbeRun[]> {
  const { data } = await createAdminClient()
    .from('domain_registrar_probe_runs')
    .select(RUN_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as ProbeRun[]
}

export async function getProbeRun(runId: string): Promise<{ run: ProbeRun; events: unknown[] } | null> {
  const run = await loadRun(runId)
  if (!run) return null
  const { data } = await createAdminClient()
    .from('domain_registrar_probe_events')
    .select('id, event, phase, api_operation, api_status, duration_ms, contact_fingerprint, actor_id, meta, created_at')
    .eq('run_id', runId)
    .order('created_at', { ascending: true })
  return { run: stripBackup(run), events: data ?? [] }
}

async function readbackOne(runId: string): Promise<'done' | 'skipped' | 'error'> {
  const run = await loadRun(runId)
  const registrar = registrarOrNull()
  if (!run || !registrar) return 'skipped'

  const index = run.readbacks_done
  const phase = readbackPhase(run.contact_type, index)
  if (!phase || !run.submitted_at) return 'skipped'

  const role = roleForContactType(run.contact_type)
  const started = Date.now()
  let fingerprint: string | null = null
  let apiStatus = 'ok'
  try {
    fingerprint = contactFingerprint((await registrar.getContacts(run.domain))[role])
  } catch (error) {
    apiStatus = apiStatusOf(error)
  }

  if (apiStatus !== 'ok') {
    await logEvent(run.id, { event: 'readback', phase, apiOperation: 'GetContacts', apiStatus, durationMs: Date.now() - started })
    return 'error'
  }

  const original = readBackup(run)
  await logEvent(run.id, {
    event: 'readback',
    phase,
    apiOperation: 'GetContacts',
    apiStatus: 'ok',
    durationMs: Date.now() - started,
    fingerprint,
    meta: {
      index,
      matches_original: original ? fingerprint === contactFingerprint(original) : null,
    },
  })

  const done = index + 1
  const next = nextReadbackAt(new Date(run.submitted_at), done, run.contact_type)
  const status = run.status === 'change_submitted' ? 'observing' : run.status
  const { error } = await createAdminClient()
    .from('domain_registrar_probe_runs')
    .update({
      readbacks_done: done,
      next_readback_at: next?.toISOString() ?? null,
      readback_lease_until: null,
      status,
    })
    .eq('id', run.id)
    .eq('readbacks_done', index)
  if (error) return 'error'

  if (!next && status === 'restored') {
    await createAdminClient().from('domain_registrar_probe_runs').update({ status: 'completed' }).eq('id', run.id)
  }
  return 'done'
}

export type ProbeSweepResult = { readbacks: number; errors: number; purgedBackups: number; flagged: number }

/** Cron entry: runs due read-backs, flags unrestored runs whose backup is about to be purged, then purges expired backups. */
export async function runProbeSweep(options: { deadlineMs: number }): Promise<ProbeSweepResult> {
  const admin = createAdminClient()
  const result: ProbeSweepResult = { readbacks: 0, errors: 0, purgedBackups: 0, flagged: 0 }

  const { data: claimed } = await admin.rpc('claim_due_registrar_probe_readbacks', { p_limit: 5 })
  for (const runId of (claimed ?? []) as string[]) {
    if (Date.now() >= options.deadlineMs) break
    const outcome = await readbackOne(runId)
    if (outcome === 'done') result.readbacks += 1
    else if (outcome === 'error') result.errors += 1
  }

  const { data: expiring } = await admin
    .from('domain_registrar_probe_runs')
    .select('id, status')
    .not('backup_enc', 'is', null)
    .lte('backup_expires_at', new Date().toISOString())
    .in('status', ['change_submitted', 'observing', 'restoring', 'restore_failed'])
  for (const row of (expiring ?? []) as { id: string; status: string }[]) {
    await logEvent(row.id, { event: 'backup_expired_unrestored', phase: 'manual', meta: { status: row.status } })
    result.flagged += 1
  }

  const { data: purged } = await admin.rpc('purge_registrar_probe_backups')
  result.purgedBackups = typeof purged === 'number' ? purged : 0
  return result
}

export { isProbeContactType }
