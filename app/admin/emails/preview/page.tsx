import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/mail/admin-guard'
import { parseEmailLang } from '@/lib/email/lang'
import { getMailServerHost, getWebmailUrl } from '@/lib/mail/webmail'
import { mailSetupSubject, renderMailSetupHtml, renderMailSetupText } from '@/lib/mail/setup-email'

export const dynamic = 'force-dynamic'

const SAMPLE_ADDRESS = 'ornek@alanadiniz.com'
const TEMPLATES = ['mailbox-setup'] as const

export default async function AdminEmailPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; lang?: string }>
}) {
  // The admin layout also gates, but layouts and pages render in parallel, so
  // the page verifies admin access itself before building anything.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) notFound()

  const params = await searchParams
  const template = TEMPLATES.find((item) => item === params.template) ?? TEMPLATES[0]
  const lang = parseEmailLang(params.lang) ?? 'tr'

  const host = getMailServerHost()
  const webmail = getWebmailUrl()
  const html = renderMailSetupHtml(lang, SAMPLE_ADDRESS, webmail, host)
  const text = renderMailSetupText(lang, SAMPLE_ADDRESS, webmail, host)

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">E-posta önizleme</h1>
          <p className="text-sm text-muted-foreground">
            Şablon: {template} · Konu: {mailSetupSubject(lang, SAMPLE_ADDRESS)}
          </p>
        </div>
        <nav aria-label="Dil" className="flex gap-2">
          {(['tr', 'en'] as const).map((item) => (
            <Link
              key={item}
              href={`/admin/emails/preview?template=${template}&lang=${item}`}
              aria-current={item === lang ? 'page' : undefined}
              className={`rounded-md border px-3 py-1.5 text-sm ${item === lang ? 'border-brand bg-brand/15 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}
            >
              {item.toUpperCase()}
            </Link>
          ))}
        </nav>
      </header>
      <iframe
        title={`E-posta önizleme (${lang})`}
        srcDoc={html}
        sandbox=""
        className="h-[900px] w-full rounded-lg border border-border bg-white"
      />
      <details className="rounded-lg border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium text-foreground">Düz metin sürümü</summary>
        <pre className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{text}</pre>
      </details>
    </div>
  )
}
