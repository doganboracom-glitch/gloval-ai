import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminEmail } from '@/lib/mail/admin-guard'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Not found', { status: 404 })

  const admin = createAdminClient()
  const { data: file } = await admin
    .from('support_ticket_attachments')
    .select('storage_path, file_name, ticket_id')
    .eq('id', id)
    .maybeSingle()
  if (!file) return new NextResponse('Not found', { status: 404 })

  if (!isAdminEmail(user.email)) {
    const { data: ticket } = await admin
      .from('support_tickets')
      .select('user_id')
      .eq('id', file.ticket_id)
      .maybeSingle()
    if (!ticket || ticket.user_id !== user.id) return new NextResponse('Not found', { status: 404 })
  }

  const { data: signed } = await admin.storage
    .from('support-attachments')
    .createSignedUrl(file.storage_path as string, 60, { download: file.file_name as string })
  if (!signed?.signedUrl) return new NextResponse('Not found', { status: 404 })

  return NextResponse.redirect(signed.signedUrl, { headers: { 'Cache-Control': 'no-store' } })
}
