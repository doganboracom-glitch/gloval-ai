import Link from 'next/link'
import { requireAdmin } from '@/lib/mail/admin-guard'
import { PageHeader } from '@/components/admin/admin-ui'
import { ProjectHandoverClient } from '@/components/admin/project-handover'
import { previewProjectHandoverAction } from '@/lib/project-handover/actions'
import { isUuid } from '@/lib/project-handover/input'

export const dynamic = 'force-dynamic'

export default async function AdminProjectHandoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireAdmin()

  const raw = (await searchParams).project
  const projectId = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? ''
  const valid = isUuid(projectId)

  // Same read-only preview the "Özeti getir" button runs; no write happens here.
  const initial = valid ? await previewProjectHandoverAction({ projectId, toEmail: '' }) : null

  return (
    <div className="space-y-6">
      <PageHeader title="Site devri" subtitle="Bir siteyi, verileri ve hak kayıtlarıyla birlikte başka bir hesaba devreder." />
      {valid ? (
        <ProjectHandoverClient
          key={projectId}
          projectId={projectId}
          initialPreview={initial?.ok ? initial.data : null}
          initialError={initial && !initial.ok ? initial.error : null}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Devredilecek siteyi{' '}
          <Link href="/admin/sites" className="text-brand underline-offset-4 hover:underline">
            Siteler
          </Link>{' '}
          listesinden seçin.
        </p>
      )}
    </div>
  )
}
