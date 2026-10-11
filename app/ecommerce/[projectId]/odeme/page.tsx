import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProject } from '@/lib/projects'
import { getPaymentSettingsForOwner } from '@/lib/payment-settings'
import { getTryOnEnabledForOwner } from '@/lib/try-on-settings'
import { getPaytrSettings } from '@/lib/store-payments/paytr-settings'
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
  if (project.project_type !== 'ecommerce') notFound()

  const settings = await getPaymentSettingsForOwner(projectId)
  const tryOnEnabled = await getTryOnEnabledForOwner(projectId)
  const paytr = await getPaytrSettings(projectId)

  return (
    <PaymentSettingsClient
      initialPaytr={paytr}
      projectId={projectId}
      projectName={project.name}
      initial={settings}
      initialTryOnEnabled={tryOnEnabled}
    />
  )
}
