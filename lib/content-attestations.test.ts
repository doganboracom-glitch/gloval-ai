import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb } from '@/lib/__fixtures__/fake-db'
import { buildSampleSections, buildSampleSite } from '@/lib/__fixtures__/sample-site'
import { loadAttestedDigests, recordAttestations, selectApproved } from '@/lib/content-attestations'
import { SAMPLE_ATTESTATION_VERSION, collectSampleFindings, unresolvedSampleFindings } from '@/lib/sample-content'
import type { Section } from '@/lib/website-schema'

vi.mock('@/lib/supabase/admin', async () => {
  const { fakeDb } = await import('@/lib/__fixtures__/fake-db')
  return { createAdminClient: () => fakeDb.client() }
})

const PROJECT = 'project-1'
const USER = 'user-1'

function approvalsFor(site = buildSampleSite()) {
  const findings = collectSampleFindings(site)
  const ids = new Set(findings.flatMap((s) => s.items.map((i) => i.id)))
  return selectApproved(findings, ids)
}

beforeEach(() => {
  fakeDb.reset()
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('recordAttestations', () => {
  it('stores one row per approved item with only ids, kind, digest and version', async () => {
    const approvals = approvalsFor()
    await recordAttestations({ projectId: PROJECT, userId: USER, approvals })

    const rows = fakeDb.rows('content_attestations')
    expect(rows).toHaveLength(approvals.length)
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(
        ['attested_by', 'content_digest', 'id', 'item_kind', 'project_id', 'section_type', 'statement_version'].sort(),
      )
      expect(row.statement_version).toBe(SAMPLE_ATTESTATION_VERSION)
      expect(row.project_id).toBe(PROJECT)
      expect(row.attested_by).toBe(USER)
    }
  })

  it('keeps no personal data or claim text anywhere in the stored rows', async () => {
    await recordAttestations({ projectId: PROJECT, userId: USER, approvals: approvalsFor() })
    const stored = JSON.stringify(fakeDb.rows('content_attestations'))
    for (const text of ['Ayşe', 'Yılmaz', 'Harika hizmet', '10 yıl', '₺499', 'Ürün A', '500+', 'owner@example.com']) {
      expect(stored).not.toContain(text)
    }
  })

  it('does not write a duplicate for the same digest and statement version', async () => {
    const approvals = approvalsFor()
    await recordAttestations({ projectId: PROJECT, userId: USER, approvals })
    await recordAttestations({ projectId: PROJECT, userId: USER, approvals })
    expect(fakeDb.rows('content_attestations')).toHaveLength(approvals.length)
  })

  it('treats the same digest in another project as a separate approval', async () => {
    const approvals = approvalsFor()
    await recordAttestations({ projectId: PROJECT, userId: USER, approvals })
    await recordAttestations({ projectId: 'project-2', userId: USER, approvals })
    expect(fakeDb.rows('content_attestations')).toHaveLength(approvals.length * 2)
  })

  it('writes nothing for an empty approval list', async () => {
    await recordAttestations({ projectId: PROJECT, userId: USER, approvals: [] })
    expect(fakeDb.writes).toEqual([])
  })

  it('throws ATTESTATION_FAILED when the row cannot be stored', async () => {
    fakeDb.attestationWriteError = 'permission denied'
    await expect(recordAttestations({ projectId: PROJECT, userId: USER, approvals: approvalsFor() })).rejects.toThrow(
      'ATTESTATION_FAILED',
    )
  })
})

describe('loadAttestedDigests', () => {
  it('returns this project’s digests for the current statement version only', async () => {
    const approvals = approvalsFor()
    await recordAttestations({ projectId: PROJECT, userId: USER, approvals })
    fakeDb.rows('content_attestations').push(
      { project_id: PROJECT, content_digest: 'old-version-digest', statement_version: 'sample-content-v0' },
      { project_id: 'project-2', content_digest: 'other-project-digest', statement_version: SAMPLE_ATTESTATION_VERSION },
    )
    const digests = await loadAttestedDigests(PROJECT)
    expect(digests).toEqual(new Set(approvals.map((a) => a.item.id)))
  })

  it('fails closed to an empty set when the lookup errors', async () => {
    await recordAttestations({ projectId: PROJECT, userId: USER, approvals: approvalsFor() })
    fakeDb.attestationReadError = true
    expect((await loadAttestedDigests(PROJECT)).size).toBe(0)
  })
})

describe('approval validity', () => {
  it('stays valid for identical content and lapses when the claim text changes', async () => {
    const site = buildSampleSite()
    await recordAttestations({ projectId: PROJECT, userId: USER, approvals: approvalsFor(site) })
    const attested = await loadAttestedDigests(PROJECT)
    expect(unresolvedSampleFindings(site, attested)).toEqual([])

    const edited = buildSampleSite(
      buildSampleSections().map((s) =>
        s.type === 'pricing' ? { ...s, plans: s.plans.map((p) => ({ ...p, price: '₺999' })) } : s,
      ) as Section[],
    )
    const unresolved = unresolvedSampleFindings(edited, attested)
    expect(unresolved.map((f) => f.sectionType)).toEqual(['pricing'])
  })

  it('selectApproved only returns findings whose id was approved', () => {
    const findings = collectSampleFindings(buildSampleSite())
    const first = findings[0].items[0].id
    const picked = selectApproved(findings, new Set([first, 'not-a-real-digest']))
    expect(picked.map((p) => p.item.id)).toEqual([first])
  })
})
