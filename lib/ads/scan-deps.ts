import 'server-only'

import { generateStructured } from '@/lib/ai-structured'
import { checkRateLimit } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveAdsModel } from '@/lib/ads/ai-models'
import { chargeAdsCredits, refundAdsCredits } from '@/lib/ads/credits'
import { resolveAnonDailyCap } from '@/lib/ads/env'
import {
  anonymousSubjects,
  releaseAdsFreeActions,
  reserveAdsFreeActions,
  signedInSubjects,
} from '@/lib/ads/free-quota'
import { notifyAnonCap } from '@/lib/ads/admin-alert'
import { scanSite } from '@/lib/ads/scan/scan-site'
import { writeAdsUsageEvent } from '@/lib/ads/usage-events'
import type { ScanDeps } from '@/lib/ads/scan-orchestrator'

const GLOBAL_ANON_SUBJECT = 'ads:global:anon'

/** Current Europe/Istanbul calendar day, the same day the quota counters use. */
function istanbulDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(now)
}

export function createDefaultScanDeps(): ScanDeps {
  return {
    now: Date.now,
    rateLimit: checkRateLimit,
    subjectsFor: (actor) =>
      actor.kind === 'user' ? signedInSubjects(actor.userId) : anonymousSubjects({ anonId: actor.anonId, ip: actor.ip }),
    reserveFree: (requestId, subjects) => reserveAdsFreeActions(requestId, subjects),
    releaseFree: (requestId) => releaseAdsFreeActions(requestId),
    charge: (userId, requestId) => chargeAdsCredits(userId, 'scanAndPreview', requestId),
    refund: (userId, requestId) => refundAdsCredits(userId, 'scanAndPreview', requestId),
    scanSite: (address) => scanSite(address),
    resolveModel: (flow, planCode) => resolveAdsModel(flow, planCode),
    generate: async ({ ai, schema, system, prompt, abortSignal }) => {
      const result = await generateStructured({ ai, schema, system, prompt, abortSignal })
      return { object: result.object, usage: result.usage }
    },
    writeUsage: writeAdsUsageEvent,
    anonCap: () => resolveAnonDailyCap(),
    readGlobalAnonUsed: async () => {
      try {
        const { data, error } = await createAdminClient()
          .from('ads_free_usage')
          .select('used')
          .eq('subject', GLOBAL_ANON_SUBJECT)
          .eq('day', istanbulDay())
          .maybeSingle()
        if (error) return null
        return typeof data?.used === 'number' ? data.used : 0
      } catch {
        return null
      }
    },
    notifyAnonCap: (level, cap) => notifyAnonCap(level, cap),
  }
}
