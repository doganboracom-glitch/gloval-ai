import 'server-only'

import { cookies } from 'next/headers'
import { resolveEmailLang, type EmailLang } from '@/lib/email/lang'
import { LANG_COOKIE } from '@/lib/i18n'

/**
 * Language of the mailbox setup email. `user_metadata.language` is never
 * written by the app, so the visitor's language cookie (set by the language
 * switcher) is the real source. Missing everywhere means Turkish, never English.
 * Must run inside the request, before `after()`, where cookies are readable.
 */
export async function resolveSetupEmailLang(user: { user_metadata?: Record<string, unknown> | null }): Promise<EmailLang> {
  let cookieLang: string | undefined
  try {
    cookieLang = (await cookies()).get(LANG_COOKIE)?.value
  } catch {
    cookieLang = undefined
  }
  const meta = user.user_metadata ?? {}
  return resolveEmailLang(meta.language, cookieLang, meta.email_locale)
}
