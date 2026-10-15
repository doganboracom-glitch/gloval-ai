import { indexNowKeyForSlug } from '@/lib/indexnow-server'

/**
 * IndexNow key file. The middleware rewrites `/<key>.txt` on a tenant host
 * (`<slug>.gloval.site` or a bound custom domain) onto this route. The key is
 * an HMAC of the project id, so only the project's own key is ever served; any
 * other value 404s. It is served for unpublished sites too, so a deletion ping
 * sent after unpublishing can still be verified.
 */
export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; key: string }> },
) {
  const { slug, key } = await params
  const expected = await indexNowKeyForSlug(slug)
  if (!expected || expected !== key) return new Response('Not found', { status: 404 })
  return new Response(expected, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  })
}
