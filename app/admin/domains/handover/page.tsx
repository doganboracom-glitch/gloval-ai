import { requireAdmin } from '@/lib/mail/admin-guard'
import { PageHeader } from '@/components/admin/admin-ui'
import { HandoverClient } from '@/components/admin/domain-handover'
import { previewHandoverAction } from '@/lib/custom-domains/handover/actions'
import { normalizeDomainInput } from '@/lib/custom-domains/handover/input'

export const dynamic = 'force-dynamic'

const MAX_DOMAIN_PARAM_LENGTH = 253

export default async function AdminDomainHandoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireAdmin()

  const raw = (await searchParams).domain
  const initialDomain = normalizeDomainInput(Array.isArray(raw) ? raw[0] : raw).slice(0, MAX_DOMAIN_PARAM_LENGTH)

  // The same read-only preview the "Özeti getir" button runs, so a link from the
  // domain list opens with the lookup already done. No write happens here.
  const initial = initialDomain ? await previewHandoverAction({ domain: initialDomain, toEmail: '' }) : null

  return (
    <div className="space-y-6">
      <PageHeader title="Alan adı devri" subtitle="Registrar alan adının sahipliğini başka bir hesaba devreder." />
      <HandoverClient
        key={initialDomain}
        initialDomain={initialDomain}
        initialPreview={initial?.ok ? initial.data : null}
        initialError={initial && !initial.ok ? initial.error : null}
      />
    </div>
  )
}
