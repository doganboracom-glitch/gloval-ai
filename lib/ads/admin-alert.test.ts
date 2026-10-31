import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { notifyPolicyBlockCap, POLICY_BLOCK_CAP_ALERT_KIND } from '@/lib/ads/admin-alert'
import type { AdsAlertDeps } from '@/lib/ads/admin-alert'

function makeDeps(first = true) {
  const recordOnce = vi.fn(async () => first)
  const sendEmail = vi.fn(async () => undefined)
  const deps: AdsAlertDeps = { recordOnce, sendEmail }
  return { deps, recordOnce, sendEmail }
}

describe('notifyPolicyBlockCap', () => {
  it('records the global cap and sends one non-personal admin alert', async () => {
    const { deps, recordOnce, sendEmail } = makeDeps()
    await notifyPolicyBlockCap(60, 60, deps)

    expect(recordOnce).toHaveBeenCalledWith(POLICY_BLOCK_CAP_ALERT_KIND, { cap: 60, used: 60 })
    expect(sendEmail).toHaveBeenCalledOnce()
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining('60/60'),
        text: expect.stringContaining('60/60'),
        idempotencyKey: expect.stringMatching(/^policy_block_global_cap-/),
      }),
    )
  })

  it('does not resend an alert already recorded for the day', async () => {
    const { deps, recordOnce, sendEmail } = makeDeps(false)
    await notifyPolicyBlockCap(60, 61, deps)

    expect(recordOnce).toHaveBeenCalledOnce()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('does not throw if recording or sending the alert fails', async () => {
    const deps: AdsAlertDeps = {
      recordOnce: vi.fn(async () => {
        throw new Error('unavailable')
      }),
      sendEmail: vi.fn(async () => undefined),
    }
    await expect(notifyPolicyBlockCap(60, 60, deps)).resolves.toBeUndefined()
  })
})
