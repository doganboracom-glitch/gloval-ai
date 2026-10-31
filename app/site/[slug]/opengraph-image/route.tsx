import { getPublishedSite } from '@/lib/projects'
import { renderTenantOgImage } from '@/lib/seo/tenant-og-image'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const site = await getPublishedSite(slug)
  if (!site) return new Response(null, { status: 404 })

  return renderTenantOgImage(site)
}
