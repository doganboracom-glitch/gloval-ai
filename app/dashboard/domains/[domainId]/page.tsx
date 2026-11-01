import { redirect } from 'next/navigation'
import { AuthUnavailableNotice } from '@/components/auth-unavailable-notice'
import { createClient } from '@/lib/supabase/server'
import { getPageAuthState } from '@/lib/supabase/page-auth'
import {
  getMyDomainDetail,
  listMyProjectsForSync,
  listMyPublishableProjects,
} from '@/lib/custom-domains/actions'
import { DomainDetailClient } from '@/components/domains/domain-detail-client'
import { PurchasedDomainDetail } from '@/components/domains/purchased-domain-detail'

export const dynamic = 'force-dynamic'

export default async function DomainDetailPage({
  params,
}: {
  params: Promise<{ domainId: string }>
}) {
  const { domainId } = await params

  const supabase = await createClient()
  const authState = await getPageAuthState(supabase)
  if (authState.kind === 'unavailable') return <AuthUnavailableNotice />
  if (authState.kind === 'unauthenticated') redirect(`/auth/login?next=/dashboard/domains/${domainId}`)
  const { user } = authState

  // Returns null for both "no such domain" and "not yours", so probing ids
  // cannot distinguish another tenant's domain from a nonexistent one.
  //
  // Redirect rather than notFound(): a bare 404 drops the customer out of the
  // dashboard entirely, and this path is reachable in normal use (a stale tab
  // after the domain was removed, or the in-memory mock store resetting on dev
  // restart). Sending them to the list keeps the same non-disclosure property.
  const detail = await getMyDomainDetail(domainId)
  if (!detail) redirect('/dashboard/domains')

  if (detail.domain.source === 'registrar') {
    const projects = await listMyProjectsForSync()
    return <PurchasedDomainDetail detail={detail} userEmail={user.email ?? ''} projects={projects} />
  }

  const publishableProjects = await listMyPublishableProjects()

  return (
    <DomainDetailClient
      detail={detail}
      userEmail={user.email ?? ''}
      publishableProjects={publishableProjects}
    />
  )
}
