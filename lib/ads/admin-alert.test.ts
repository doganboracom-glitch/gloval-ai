import { describe, expect, it, vi } from 'vitest'

const { rpc, sendTransactionalEmail } = vi.hoisted(() => ({ rpc: vi.fn(), sendTransactionalEmail: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }))
vi.mock('@/lib/notify', () => ({ sendTransactionalEmail }))

import {
  GOOGLE_PUBLISH_RECONCILING_ALERT_KIND,
  notifyGooglePublishReconciling,
  notifyPolicyBlockCap,
  POLICY_BLOCK_CAP_ALERT_KIND,
} from '@/lib/ads/admin-alert'
import type { AdsAlertDeps } from '@/lib/ads/admin-alert'

function makeDeps(first = true) {
  const recordOnce = vi.fn(async (_kind: string, _detail: unknown) => first)
  const sendEmail = vi.fn(async () => undefined)
  const deps: AdsAlertDeps = { recordOnce, sendEmail }
  return { deps, recordOnce, sendEmail }
}

describe('notifyGooglePublishReconciling', () => {
  it('deduplicates each publish plan separately and includes its request marker', async () => {
    const { deps, recordOnce, sendEmail } = makeDeps()
    const planId = 'plan-123'
    const requestId = 'request-456'

    await notifyGooglePublishReconciling(planId, requestId, deps)

    expect(recordOnce).toHaveBeenCalledWith(`${GOOGLE_PUBLISH_RECONCILING_ALERT_KIND}:${planId}`, {
      planId,
      requestId,
    })
    expect(sendEmail).toHaveBeenCalledOnce()
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining(requestId),
      idempotencyKey: expect.stringContaining(`${planId}-`),
    }))
  })

  it('records separate reconciling plans on the same day', async () => {
    const { deps, recordOnce } = makeDeps()
    await notifyGooglePublishReconciling('plan-a', 'request-a', deps)
    await notifyGooglePublishReconciling('plan-b', 'request-b', deps)

    expect(recordOnce).toHaveBeenCalledTimes(2)
    expect(recordOnce.mock.calls[0]?.[0]).not.toBe(recordOnce.mock.calls[1]?.[0])
  })
})

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

  it('uses ads_record_alert_once before sending through the default server wiring', async () => {
    rpc.mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: true, error: null }) })
    sendTransactionalEmail.mockResolvedValue(undefined)

    await notifyPolicyBlockCap(60, 60)

    expect(rpc).toHaveBeenCalledWith('ads_record_alert_once', {
      p_kind: 'policy_block_global_cap',
      p_detail: { cap: 60, used: 60 },
    })
    expect(sendTransactionalEmail).toHaveBeenCalledOnce()
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
