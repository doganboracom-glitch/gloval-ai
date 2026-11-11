import 'server-only'

import { resolveEmailLang } from '@/lib/email/lang'
import { isAdminEmail } from '@/lib/mail/admin-guard'
import { SUPPORT_EMAIL, sendTransactionalEmailDetailed } from '@/lib/notify'
import type { DraftReminderConfig } from './core'
import { runDraftReminders, type DraftReminderDeps, type DraftReminderSummary } from './service'
import { createSupabaseDraftReminderStore } from './store'
import { buildDraftReminderEmail } from './template'
import { createOptOutToken } from './token'

const UNSUBSCRIBE_BASE = 'https://gloval.ai/api/draft-reminders/unsubscribe'

export function buildReminderMail(input: Parameters<DraftReminderDeps['buildEmail']>[0]) {
  const token = createOptOutToken(input.userId)
  if (!token) return null
  return buildDraftReminderEmail({
    kind: input.kind,
    lang: resolveEmailLang(...input.lang),
    projectId: input.projectId,
    isEcommerce: input.isEcommerce,
    unsubscribeUrl: `${UNSUBSCRIBE_BASE}?token=${encodeURIComponent(token)}`,
  })
}

export async function runDraftRemindersCron(config: DraftReminderConfig, now = new Date()): Promise<DraftReminderSummary> {
  return runDraftReminders({
    store: createSupabaseDraftReminderStore(now),
    buildEmail: buildReminderMail,
    isAdminEmail,
    now,
    config,
    send: async (input) => {
      const result = await sendTransactionalEmailDetailed({
        ...input,
        replyTo: SUPPORT_EMAIL,
        fromDisplayName: 'GLOVAL AI',
      })
      if (result.ok) return { ok: true }
      return { ok: false, errorCode: result.reason === 'http' ? `http_${result.status}` : result.reason }
    },
  })
}
