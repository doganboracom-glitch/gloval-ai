import { describe, expect, it } from 'vitest'
import { buildTicketCreatedNotice } from '@/lib/support/admin-notification'

describe('buildTicketCreatedNotice', () => {
  it('includes the localized department in both the admin notification and email subject', () => {
    const notice = buildTicketCreatedNotice({
      ticketNumber: 'GLV-1234',
      department: 'gloval-ads',
      subject: 'Campaign question',
    })

    expect(notice.departmentLabel).toBe('GLOVAL Ads')
    expect(notice.notificationTitle).toContain('GLOVAL Ads')
    expect(notice.notificationBody).toContain('GLOVAL Ads')
    expect(notice.emailSubject).toContain('GLOVAL Ads')
  })
})
