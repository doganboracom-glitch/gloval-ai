import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProject, listProjectBackups, listProjectVersions } from '@/lib/projects'
import { logSchemaRepair, normalizeWebsiteSchema } from '@/lib/website-schema-compat'
import { SiteUnavailable } from '@/components/editor/site-unavailable'
import { getMyCurrentPlan, getPlanCodeForUser } from '@/lib/billing'
import { canUseVersionHistory, toPlanCode } from '@/lib/pricing-config'
import { EditorClient } from '@/components/editor/editor-client'
import { isAdminEmail } from '@/lib/mail/admin-guard'
import { getPaymentSummary } from '@/lib/store-payments/general-settings'
import { getEditorCatalog } from '@/lib/store-editor-catalog'
import { loadProjectCommerce } from '@/lib/commerce-mode-server'
import { suggestBlogTopics } from '@/lib/blog-ai'
import { isStarterPending } from '@/lib/blog-site'
import { getSiteSeoContext } from '@/lib/seo/site-seo'
import { tenantUrl } from '@/lib/domains'

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

  // A legacy/drifted row is repaired in memory (the draft is only rewritten on
  // the owner's next save); one that cannot be repaired gets a recoverable page, not a 404.
  const normalized = normalizeWebsiteSchema(project.schema_data, project.language === 'en' ? 'en' : 'tr')
  if (!normalized.ok) {
    console.warn('[schema-compat] editor unreadable', normalized.issues.map((i) => `${i.path}:${i.code}`))
    return <SiteUnavailable projectId={projectId} />
  }
  logSchemaRepair('editor-page', normalized.steps)
  const parsed = { data: normalized.value }

  const language = project.language === 'en' ? 'en' : 'tr'

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

  // Version history + backups are PRO/E-Ticaret only. The server functions
  // enforce this too; here a failed read just shows an empty list.
  const historyEnabled = canUseVersionHistory(planCode)
  const [initialVersions, initialBackups] = historyEnabled
    ? await Promise.all([
        listProjectVersions(projectId).catch(() => []),
        listProjectBackups(projectId).catch(() => []),
      ])
    : [[], []]

  // "Sanal Poslar" tab: store sites only, and only for the owner or an admin.
  // The summary read re-checks ownership server side; a failure just hides
  // the badge, never the editor.
  const commerce = await loadProjectCommerce({ id: projectId }).catch(() => null)
  const canManagePayments =
    commerce?.mode === 'ecommerce' && (isOwner || isAdminEmail(user.email))
  const paymentSummary = canManagePayments
    ? await getPaymentSummary(projectId).catch(() => null)
    : null

  // Owner-verified, project_id-keyed read that also works before first publish
  // (the public RPCs only serve published stores). A failure only empties the preview.
  const catalog =
    commerce && commerce.mode !== 'none' ? await getEditorCatalog(projectId) : null

  // "Blog" tab: project owner or an admin. Topic ideas are matched on the
  // site's own words (never substrings) so the sector pool fits the business.
  const canManageBlog = isOwner || isAdminEmail(user.email)
  const meta = parsed.data.meta
  const blogTopics = canManageBlog
    ? suggestBlogTopics(
        [project.name, meta.name, meta.tagline, meta.description, meta.audience, meta.seoTitle]
          .filter(Boolean)
          .join(' '),
        language,
      )
    : []

  // The origin the site really advertises (live custom domain, else the
  // tenant subdomain); the sitemap hint must show the same address Search Console needs.
  // Before publishing there is no live origin yet, so the tenant subdomain is
  // shown (the card labels it "valid once published").
  const sitemapOrigin =
    canManageBlog && project.slug
      ? project.published
        ? (await getSiteSeoContext(project.slug)).origin
        : tenantUrl(project.slug)
      : null
  const sitemapUrl = sitemapOrigin ? `${sitemapOrigin}/sitemap.xml` : null

  return (
    <EditorClient
      projectId={projectId}
      schema={parsed.data}
      language={language}
      published={project.published}
      slug={project.slug}
      initialVersions={initialVersions}
      initialBackups={initialBackups}
      historyEnabled={historyEnabled}
      planCode={planCode}
      autoPublish={autopublish === '1'}
      payments={canManagePayments ? { projectId, initialSummary: paymentSummary } : null}
      catalog={catalog}
      blog={
        canManageBlog
          ? { projectId, topics: blogTopics, sitemapUrl, starterPending: isStarterPending(project.created_at, Date.now()) }
          : null
      }
    />
  )
}
