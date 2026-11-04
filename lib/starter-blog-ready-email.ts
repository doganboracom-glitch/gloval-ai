import 'server-only'
import { PLATFORM_CANONICAL_HOST } from '@/lib/domains'
import { renderEmailLayout, escape } from '@/lib/email/layout'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTransactionalEmailDetailed, SUPPORT_EMAIL } from '@/lib/notify'

const SUBJECT = 'Blog yazılarınız hazır'
const BODY = 'Bloglar hazırlandı, sitenizin editör bölümünden düzenleyebilirsiniz'
const BLOG_GUIDANCE = [
  'Web sitenizde düzenli blog yazıları yayımlamak, Google\'da daha üst sıralarda yer almanıza ve organik ziyaretçi sayınızı artırmanıza yardımcı olur.',
  'Hedef kitlenizin sorularına yanıt veren kaliteli içerikler, markanıza duyulan güveni güçlendirerek ziyaretçileri potansiyel müşterilere dönüştürür.',
  'GLOVAL AI editörüyle haftada 2–3 blog yazısı hazırlayabilir, yayın zamanlamasını önceden planlayarak içeriklerinizi düzenli ve sürdürülebilir şekilde yönetebilirsiniz.',
].join(' ')
const EMAIL_BODY = `${BODY}\n\n${BLOG_GUIDANCE}`
const FOOTER = 'Bu e-posta, blog yazılarınız hazır olduğu için GLOVAL AI tarafından gönderilmiştir.'

export function starterBlogReadyEmailDedupeKey(projectId: string): string {
  return `starter-blog-ready:${projectId}`
}

export function buildStarterBlogReadyEmail(projectId: string) {
  const editorUrl = `https://${PLATFORM_CANONICAL_HOST}/editor/${encodeURIComponent(projectId)}`
  const html = renderEmailLayout({
    lang: 'tr',
    previewText: BODY,
    title: SUBJECT,
    body: `<p style="margin:0;">${escape(BODY)}</p><p style="margin:16px 0 0;">${escape(BLOG_GUIDANCE)}</p>`,
    cta: { label: 'Editörü aç', href: editorUrl },
    footer: FOOTER,
    homeUrl: `https://${PLATFORM_CANONICAL_HOST}`,
  })

  return {
    subject: SUBJECT,
    body: EMAIL_BODY,
    editorUrl,
    html,
    text: `${EMAIL_BODY}\n\nEditör bağlantısı: ${editorUrl}`,
  }
}

export async function sendStarterBlogReadyEmail(args: { projectId: string; userId: string }): Promise<void> {
  const dedupeKey = starterBlogReadyEmailDedupeKey(args.projectId)
  let admin: ReturnType<typeof createAdminClient> | null = null
  let claimed = false

  try {
    const email = buildStarterBlogReadyEmail(args.projectId)
    admin = createAdminClient()
    const { data, error: userError } = await admin.auth.admin.getUserById(args.userId)
    const recipient = data.user?.email
    if (userError || !recipient) return

    const { error: claimError } = await admin.from('notification_logs').insert({
      user_id: args.userId,
      channel: 'email',
      type: 'starter_blog_ready',
      subject: email.subject,
      body: email.text,
      status: 'queued',
      dedupe_key: dedupeKey,
    })

    if (claimError) {
      if (claimError.code !== '23505') console.log('[starter-blog] ready email claim failed')
      return
    }
    claimed = true

    const result = await sendTransactionalEmailDetailed({
      to: recipient,
      subject: email.subject,
      html: email.html,
      text: email.text,
      replyTo: SUPPORT_EMAIL,
      fromDisplayName: 'GLOVAL AI',
      idempotencyKey: dedupeKey,
    })
    const status = result.ok ? 'sent' : 'failed'
    const { error: statusError } = await admin.from('notification_logs').update({ status }).eq('dedupe_key', dedupeKey)
    if (statusError) console.log('[starter-blog] ready email status update failed')
    if (!result.ok) console.log('[starter-blog] ready email delivery failed', result.reason)
  } catch {
    if (claimed && admin) {
      try {
        await admin.from('notification_logs').update({ status: 'failed' }).eq('dedupe_key', dedupeKey)
      } catch {
        // The blog result must remain successful even if notification logging also fails.
      }
    }
    console.log('[starter-blog] ready email failed')
  }
}
