import type { MetadataRoute } from 'next'
import { platformUrl } from '@/lib/domains'

/**
 * robots.txt for the GLOVAL platform (https://gloval.ai/robots.txt).
 *
 * Public marketing, blog and demo pages stay crawlable; everything behind
 * authentication or tied to a single user's project is blocked, together with
 * the internal `/site/<slug>` rewrite target — published tenant sites must be
 * indexed on their own `<slug>.gloval.site` host, not as a platform sub-path.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/auth/',
        '/dashboard',
        '/editor',
        '/ecommerce',
        '/billing',
        '/admin',
        '/site/',
        '/forgot-password',
        '/payment-result',
        '/account-suspended',
      ],
    },
    sitemap: platformUrl('/sitemap.xml'),
    host: platformUrl(''),
  }
}
