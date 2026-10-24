import { createAdminClient } from '@/lib/supabase/admin'
import {
  SAMPLE_ATTESTATION_VERSION,
  type SampleItemFinding,
  type SampleSectionFinding,
} from '@/lib/sample-content'

/**
 * Persistent owner approvals of AI-generated sample content. The table is
 * service_role only (scripts/059-content-attestations.sql) and holds no
 * readable content: just who, when, which item kind and the content digest.
 */

/**
 * Values the `item_kind` CHECK in the database accepts
 * (scripts/059 plus scripts/073). A test keeps this list, the SQL and the kinds
 * the gate can produce in sync, because a kind outside the CHECK makes every
 * approval of that kind fail to store.
 */
export const ATTESTATION_ITEM_KINDS = [
  'testimonials',
  'stats',
  'pricing',
  'discount',
  'badge',
  'trust',
  'product',
  'info',
  'contact',
] as const

/** Digests already approved for this project under the current statement version. */
export async function loadAttestedDigests(
  projectId: string,
  statementVersion: string = SAMPLE_ATTESTATION_VERSION,
): Promise<Set<string>> {
  try {
    const { data, error } = await createAdminClient()
      .from('content_attestations')
      .select('content_digest')
      .eq('project_id', projectId)
      .eq('statement_version', statementVersion)
    if (error) throw error
    return new Set((data ?? []).map((row) => row.content_digest as string))
  } catch (err) {
    // Fail closed: with no readable attestations the gate asks again.
    console.log('[v0] attestation lookup failed, treating as none:', err)
    return new Set()
  }
}

/** Writes one attestation per approved item. Throws when it cannot be stored. */
export async function recordAttestations(input: {
  projectId: string
  userId: string
  approvals: Array<{ sectionType: string; item: SampleItemFinding }>
  /** Defaults to the sample-content statement; detected contact values use their own. */
  statementVersion?: string
}): Promise<void> {
  if (input.approvals.length === 0) return
  const rows = input.approvals.map(({ sectionType, item }) => ({
    project_id: input.projectId,
    attested_by: input.userId,
    section_type: sectionType,
    item_kind: item.detected ? 'contact' : item.kind,
    content_digest: item.id,
    statement_version: input.statementVersion ?? SAMPLE_ATTESTATION_VERSION,
  }))
  const { error } = await createAdminClient()
    .from('content_attestations')
    .upsert(rows, { onConflict: 'project_id,content_digest,statement_version', ignoreDuplicates: true })
  if (error) {
    console.log('[v0] attestation write failed:', error.message)
    throw new Error('ATTESTATION_FAILED')
  }
}

/** Flat list of the findings whose id the owner approved in this request. */
export function selectApproved(
  findings: SampleSectionFinding[],
  approvedIds: ReadonlySet<string>,
): Array<{ sectionType: string; item: SampleItemFinding }> {
  return findings.flatMap((section) =>
    section.items.filter((item) => approvedIds.has(item.id)).map((item) => ({ sectionType: section.sectionType, item })),
  )
}
