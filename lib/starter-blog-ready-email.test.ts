import { beforeEach, describe, expect, it, vi } from 'vitest'

const stubs = vi.hoisted(() => ({
  getUserById: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  sendTransactionalEmailDetailed: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { getUserById: stubs.getUserById } },
    from: () => ({ insert: stubs.insert, update: stubs.update }),
  }),
}))
vi.mock('@/lib/notify', () => ({
  SUPPORT_EMAIL: 'support@gloval.ai',
  sendTransactionalEmailDetailed: stubs.sendTransactionalEmailDetailed,
}))

import {
  buildStarterBlogReadyEmail,
  sendStarterBlogReadyEmail,
  starterBlogReadyEmailDedupeKey,
} from '@/lib/starter-blog-ready-email'

beforeEach(() => {
  stubs.getUserById.mockReset().mockResolvedValue({ data: { user: { email: 'owner@gloval.ai' } }, error: null })
  stubs.insert.mockReset().mockResolvedValue({ error: null })
  stubs.eq.mockReset().mockResolvedValue({ error: null })
  stubs.update.mockReset().mockImplementation(() => ({ eq: stubs.eq }))
  stubs.sendTransactionalEmailDetailed.mockReset().mockResolvedValue({ ok: true, messageId: 'email-1' })
})

const blogGuidance = [
  'Web sitenizde düzenli blog yazıları yayımlamak, Google\'da daha üst sıralarda yer almanıza ve organik ziyaretçi sayınızı artırmanıza yardımcı olur.',
  'Hedef kitlenizin sorularına yanıt veren kaliteli içerikler, markanıza duyulan güveni güçlendirerek ziyaretçileri potansiyel müşterilere dönüştürür.',
  'GLOVAL AI editörüyle haftada 2–3 blog yazısı hazırlayabilir, yayın zamanlamasını önceden planlayarak içeriklerinizi düzenli ve sürdürülebilir şekilde yönetebilirsiniz.',
].join(' ')

describe('starter blog ready email', () => {
  it('uses the requested copy, the editor URL, and the shared email layout', () => {
    const email = buildStarterBlogReadyEmail('project-1')

    expect(email.subject).toBe('Blog yazılarınız hazır')
    expect(email.body).toBe(`Bloglar hazırlandı, sitenizin editör bölümünden düzenleyebilirsiniz\n\n${blogGuidance}`)
    expect(email.editorUrl).toBe('https://gloval.ai/editor/project-1')
    expect(email.html).toContain('GLOVAL AI')
    expect(email.html).toContain('href="https://gloval.ai/editor/project-1"')
    expect(email.text).toContain('Editör bağlantısı: https://gloval.ai/editor/project-1')
  })

  it('renders the exact Turkish blog guidance before the editor button', () => {
    const email = buildStarterBlogReadyEmail('project-1')
    const paragraphIndex = email.html.indexOf(blogGuidance)
    const ctaIndex = email.html.indexOf('Editörü aç')

    expect(email.html).toContain('<html lang="tr">')
    expect(paragraphIndex).toBeGreaterThan(-1)
    expect(paragraphIndex).toBeLessThan(ctaIndex)
    expect(email.html).toContain(`<p style="margin:16px 0 0;">${blogGuidance}</p>`)
    expect(email.text).toContain(blogGuidance)
  })

  it('sends and logs the same rendered copy with one idempotency key per project', async () => {
    stubs.getUserById.mockResolvedValue({ data: { user: { email: 'owner@gloval.ai' } }, error: null })

    await sendStarterBlogReadyEmail({ projectId: 'project-1', userId: 'user-1' })

    const dedupeKey = starterBlogReadyEmailDedupeKey('project-1')
    expect(dedupeKey).toBe('starter-blog-ready:project-1')
    expect(stubs.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        channel: 'email',
        type: 'starter_blog_ready',
        status: 'queued',
        dedupe_key: dedupeKey,
      }),
    )
    expect(stubs.sendTransactionalEmailDetailed).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@gloval.ai',
        subject: 'Blog yazılarınız hazır',
        replyTo: 'support@gloval.ai',
        idempotencyKey: dedupeKey,
      }),
    )

    const sentEmail = stubs.sendTransactionalEmailDetailed.mock.calls[0][0]
    const notificationLog = stubs.insert.mock.calls[0][0]
    expect(sentEmail.html).toContain(blogGuidance)
    expect(sentEmail.text).toContain(blogGuidance)
    expect(notificationLog.body).toContain(blogGuidance)
    expect(notificationLog.body).toBe(sentEmail.text)
    expect(stubs.update).toHaveBeenCalledWith({ status: 'sent' })
  })

  it('does not send again when the database dedupe key already exists', async () => {
    stubs.insert.mockResolvedValue({ error: { code: '23505' } })

    await sendStarterBlogReadyEmail({ projectId: 'project-1', userId: 'user-1' })

    expect(stubs.sendTransactionalEmailDetailed).not.toHaveBeenCalled()
    expect(stubs.update).not.toHaveBeenCalled()
  })

  it('records email failure without throwing into the blog flow', async () => {
    stubs.sendTransactionalEmailDetailed.mockResolvedValue({ ok: false, reason: 'network' })

    await expect(sendStarterBlogReadyEmail({ projectId: 'project-1', userId: 'user-1' })).resolves.toBeUndefined()

    expect(stubs.update).toHaveBeenCalledWith({ status: 'failed' })
  })
})
