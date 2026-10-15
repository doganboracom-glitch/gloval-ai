import { renderOgImage } from '@/lib/seo/og-image'
import { SEO_PAGES, isSeoPageKey, resolveSeoLang } from '@/lib/seo/page-seo'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ page: string }> },
) {
  const { page } = await params
  if (!isSeoPageKey(page)) {
    return new Response('Not found', { status: 404 })
  }

  const lang = resolveSeoLang(new URL(request.url).searchParams.get('lang'))
  const { heading, tagline } = SEO_PAGES[page][lang]
  return renderOgImage({ heading, tagline })
}
