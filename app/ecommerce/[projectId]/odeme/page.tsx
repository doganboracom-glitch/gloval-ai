import { notFound, redirect } from 'next/navigation'
import { loadProjectCommerce } from '@/lib/commerce-mode-server'
import { StoreNotEnabled } from '@/components/ecommerce/store-not-enabled'
import { createClient } from '@/lib/supabase/server'
import { getProject } from '@/lib/projects'
import { getPaymentSettingsForOwner } from '@/lib/payment-settings'
import { getTryOnEnabledForOwner } from '@/lib/try-on-settings'
import { PaymentSettingsClient } from '@/components/ecommerce/payment-settings-client'

// Per-user, auth-gated settings — never serve from a stale cache.
export const dynamic = 'force-dynamic'

export default async function PaymentSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/login?next=/ecommerce/${projectId}/odeme`)

  const project = await getProject(projectId)
  if (!project) notFound()
  const storeCommerce = await loadProjectCommerce({ id: projectId })
  if (storeCommerce?.mode !== 'ecommerce') {
    if (storeCommerce?.storedMode === 'none') return <StoreNotEnabled projectId={projectId} />
    notFound()
  }

  const settings = await getPaymentSettingsForOwner(projectId)
  const tryOnEnabled = await getTryOnEnabledForOwner(projectId)

  return (
    <PaymentSettingsClient
      projectId={projectId}
      projectName={project.name}
      initial={settings}
      initialTryOnEnabled={tryOnEnabled}
    />
  )
}
