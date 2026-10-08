import { after } from 'next/server'
import { syncMailAccessForUser } from './access-sync'

/**
 * Called from subscription lifecycle events (payment, renewal, cancel, expiry,
 * plan change). It only re-evaluates the user's mail domains; it never throws,
 * so a mail-server problem can not break billing code. The daily cron retries
 * anything that fails here.
 */
export async function triggerMailAccessSync(userId: string | null | undefined, reason: string): Promise<void> {
  if (!userId) return
  const run = async () => {
    try {
      await syncMailAccessForUser(userId)
    } catch {
      console.log('[mail-access] event sync failed', { reason })
    }
  }
  try {
    // Keep slow mail-server calls off the billing response when a request scope exists.
    after(run)
  } catch {
    await run()
  }
}
