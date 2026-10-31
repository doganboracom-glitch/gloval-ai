import type { PlannerOutput } from '@/lib/ads/planner'
import type { AdCopyOutput } from '@/lib/ads/ad-copy'
import type { ScanDeps, ScanActor } from '@/lib/ads/scan-orchestrator'
import type { AdsUsageRow } from '@/lib/ads/usage-events'
import type { SiteSnapshot } from '@/lib/ads/scan/scan-site'

export const SNAPSHOT: SiteSnapshot = {
  host: 'ornekmutfak.com',
  finalHost: 'ornekmutfak.com',
  language: 'tr',
  title: 'Örnek Mutfak | Ankara mutfak dolabı',
  description: 'Ankara için ölçüye özel mutfak dolabı üretimi ve montajı.',
  siteName: 'Örnek Mutfak',
  organizationNames: ['Örnek Mutfak'],
  headings: ['Ölçüye özel mutfak dolabı', 'Ankara montaj hizmeti'],
  navLabels: ['Ürünler', 'Hakkımızda', 'İletişim'],
  text: 'Örnek Mutfak Ankara merkezli atölyesinde ölçüye özel mutfak dolabı, ankastre set ve montaj hizmeti sunar. 15 yıllık deneyim.',
  pages: [{ path: '/', title: 'Ana sayfa' }],
}

export const PLANNER_OUTPUT: PlannerOutput = {
  brand: 'Örnek Mutfak',
  sector: 'manufacturing',
  sectorLabel: 'Mutfak dolabı üretimi',
  services: ['Ölçüye özel mutfak dolabı', 'Ankastre set', 'Montaj hizmeti'],
  language: 'tr',
  policyCategory: 'none',
  policyEvidence: 'none',
  policyEvidenceQuote: '',
  competitiveness: 'medium',
  keywords: ['mutfak dolabı', 'ölçüye özel mutfak', 'ankara mutfak dolabı', 'mutfak montajı'],
  negativeKeywords: ['ikinci el', 'ücretsiz'],
  country: 'TR',
  cities: ['Ankara', 'İzmir'],
}

export const COPY_OUTPUT: AdCopyOutput = {
  headlines: ['Ölçüye Özel Mutfak Dolabı', 'Ankara Mutfak Dolabı', 'Örnek Mutfak Atölyesi', 'Profesyonel Montaj', 'Ankastre Set Çözümleri'],
  descriptions: [
    'Ankara atölyemizde ölçünüze göre mutfak dolabı üretimi.',
    'Ankastre set ve montaj hizmetiyle mutfağınızı yenileyin.',
    'Teklif için bize ulaşın.',
  ],
  path1: 'mutfak',
  path2: 'dolap',
}

export const USER_ACTOR: ScanActor = { kind: 'user', userId: 'user-1', planCode: 'free', ip: '203.0.113.5' }
export const ANON_ACTOR: ScanActor = { kind: 'anon', anonId: 'A'.repeat(22), ip: '203.0.113.0/24' }

export type FakeCalls = {
  reserve: number
  release: number
  reservePolicy: number
  releasePolicy: number
  policyAlerts: Array<{ cap: number; used: number }>
  charge: number
  refund: number
  generate: Array<{ system: string; prompt: string }>
  usage: AdsUsageRow[]
  alerts: Array<'half' | 'full'>
}

export function makeDeps(overrides: Partial<ScanDeps> = {}): { deps: ScanDeps; calls: FakeCalls } {
  const calls: FakeCalls = {
    reserve: 0,
    release: 0,
    reservePolicy: 0,
    releasePolicy: 0,
    policyAlerts: [],
    charge: 0,
    refund: 0,
    generate: [],
    usage: [],
    alerts: [],
  }
  const deps: ScanDeps = {
    now: () => 1_000_000,
    rateLimit: () => ({ allowed: true, retryAfterMs: 0 }),
    subjectsFor: () => ({ subjects: ['s'], limits: [1], anonSubjectHash: 'hash' }),
    reserveFree: async () => {
      calls.reserve++
      return { allowed: true, alreadyReserved: false }
    },
    releaseFree: async () => {
      calls.release++
      return true
    },
    reservePolicyAttempt: async () => {
      calls.reservePolicy++
      return { allowed: true, alreadyReserved: false }
    },
    releasePolicyAttempt: async () => {
      calls.releasePolicy++
      return true
    },
    policyBlockCap: () => 60,
    readGlobalPolicyBlockUsed: async () => 1,
    notifyPolicyBlockCap: async (cap, used) => {
      calls.policyAlerts.push({ cap, used })
    },
    charge: async () => {
      calls.charge++
      return { ok: true, balance: 10, alreadyCharged: false, chargedAmount: 2, reason: 'ok' }
    },
    refund: async () => {
      calls.refund++
      return { refunded: true, balance: 12, refundedAmount: 2 }
    },
    scanSite: async () => ({ ok: true, snapshot: SNAPSHOT }),
    resolveModel: (flow) => ({ model: `test/${flow}` }) as ReturnType<ScanDeps['resolveModel']>,
    generate: (async (args: { system: string; prompt: string; schema: unknown }) => {
      calls.generate.push({ system: args.system, prompt: args.prompt })
      const isPlanner = calls.generate.length === 1
      return { object: isPlanner ? PLANNER_OUTPUT : COPY_OUTPUT, usage: { inputTokens: 1000, outputTokens: 500 } }
    }) as unknown as ScanDeps['generate'],
    writeUsage: async (row) => {
      calls.usage.push(row)
    },
    anonCap: () => 100,
    readGlobalAnonUsed: async () => 1,
    notifyAnonCap: async (level) => {
      calls.alerts.push(level)
    },
    ...overrides,
  }
  return { deps, calls }
}
