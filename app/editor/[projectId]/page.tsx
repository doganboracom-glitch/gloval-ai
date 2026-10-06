import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProject, listProjectVersions } from '@/lib/projects'
import { websiteSchema } from '@/lib/website-schema'
import { getMyCurrentPlan, getPlanCodeForUser } from '@/lib/billing'
import { toPlanCode } from '@/lib/pricing-config'
import { EditorClient } from '@/components/editor/editor-client'

export default async function EditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>
  searchParams: Promise<{ autopublish?: string }>
}) {
  const { projectId } = await params
  const { autopublish } = await searchParams

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/login?next=/editor/${projectId}`)

  const project = await getProject(projectId)
  if (!project) notFound()

  // Validate the stored schema so a legacy/corrupt row can't crash the editor.
  const parsed = websiteSchema.safeParse(project.schema_data)
  if (!parsed.success) notFound()

  const language = project.language === 'en' ? 'en' : 'tr'
  const initialVersions = await listProjectVersions(projectId)

  // Plana bağlı özellikler (telefon/WhatsApp butonları) SİTENİN SAHİBİNİN
  // paketine göre kilitlenir — düzenleyene göre değil. Böylece admin başka bir
  // kullanıcının sitesini düzenlerken o kullanıcının paketi geçerli olur.
  // Aboneliği olmayan kullanıcı FREE sayılır. Sorgu editörün açılmasını asla
  // engellememeli, hata durumunda güvenli tarafa (FREE) düşer.
  const isOwner = project.owner_id === user.id
  const ownerPlanCode = isOwner
    ? (await getMyCurrentPlan().catch(() => null))?.code ?? null
    : await getPlanCodeForUser(project.owner_id)
  const planCode = toPlanCode(ownerPlanCode)

  return (
    <EditorClient
      projectId={projectId}
      schema={parsed.data}
      language={language}
      published={project.published}
      slug={project.slug}
      initialVersions={initialVersions}
      planCode={planCode}
      autoPublish={autopublish === '1'}
    />
  )
}
