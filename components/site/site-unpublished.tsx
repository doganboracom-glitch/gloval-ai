import { headers } from 'next/headers'
import { platformUrl } from '@/lib/domains'
import { resolveLangFromAcceptLanguage } from '@/lib/i18n'
import { siteUnavailableCopy } from '@/lib/site-availability'

/**
 * Shown on every tenant route when no published site answers the slug: never
 * published, unpublished by the owner, unpublished by a subscription
 * suspension, or deleted. Visitors cannot tell these apart and need not.
 */
export async function SiteUnpublished() {
  const lang = resolveLangFromAcceptLanguage((await headers()).get('accept-language'))
  const copy = siteUnavailableCopy(lang)
  return (
    <main className="grid min-h-svh place-items-center bg-background px-6 text-center">
      <div className="max-w-md">
        <h1 className="text-balance text-2xl font-semibold text-foreground">{copy.title}</h1>
        <p className="mt-3 text-pretty text-muted-foreground">{copy.body}</p>
        <a
          href={platformUrl('/')}
          className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          GLOVAL
        </a>
      </div>
    </main>
  )
}
