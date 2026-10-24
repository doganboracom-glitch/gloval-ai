'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Info, Loader2, MailCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { resumeSignupDraft } from '@/lib/signup-draft-actions'
import { clearSignupDraftToken, consumeSignupDraftUnsaved, readSignupDraftToken } from '@/lib/signup-draft-client'
import { clearPendingProject } from '@/lib/pending-project'
import { useLanguage } from '@/components/language-provider'
import { AuthShell } from '@/components/auth/auth-shell'
import { LinkButton } from '@/components/link-button'

const POLL_MS = 3000
const MAX_BUSY_RETRIES = 10

export default function SignUpSuccessPage() {
  const { t } = useLanguage()
  const router = useRouter()
  const [resuming, setResuming] = useState(false)
  const [draftUnsaved, setDraftUnsaved] = useState(false)

  useEffect(() => {
    setDraftUnsaved(consumeSignupDraftUnsaved())
  }, [])
  const runningRef = useRef(false)

  // The verification link may be opened in another tab: the session cookie is
  // shared, so this tab notices the sign-in and continues with the same draft.
  useEffect(() => {
    const token = readSignupDraftToken()
    if (!token) return
    const supabase = createClient()
    let cancelled = false

    async function resume() {
      if (runningRef.current || cancelled || !token) return
      runningRef.current = true
      setResuming(true)
      for (let attempt = 0; attempt < MAX_BUSY_RETRIES && !cancelled; attempt++) {
        const result = await resumeSignupDraft(token).catch(() => null)
        if (result?.status === 'ok') {
          clearSignupDraftToken()
          clearPendingProject()
          router.push(
            result.publishIntent
              ? `/editor/${result.projectId}?autopublish=1`
              : `/editor/${result.projectId}`,
          )
          return
        }
        if (result?.status !== 'busy') break
        await new Promise((r) => setTimeout(r, 1000))
      }
      runningRef.current = false
      setResuming(false)
    }

    async function check() {
      const { data } = await supabase.auth.getSession()
      if (data.session) void resume()
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) void resume()
    })
    const timer = setInterval(() => void check(), POLL_MS)
    void check()
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
      clearInterval(timer)
    }
  }, [router])

  return (
    <AuthShell title={t.auth.checkEmail} subtitle={t.auth.checkEmailBody}>
      <div className="flex flex-col items-center gap-6 py-2 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-primary/15 text-primary">
          <MailCheck className="size-7" />
        </div>
        {resuming && (
          <p role="status" className="flex items-center gap-2 text-sm text-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {t.auth.resumingDraft}
          </p>
        )}
        {draftUnsaved && (
          <p
            role="alert"
            className="w-full rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-left text-sm leading-relaxed text-foreground"
          >
            {t.auth.draftNotSaved}
          </p>
        )}
        <div className="flex w-full items-start gap-3 rounded-xl border border-border/70 bg-muted/40 px-4 py-3 text-left">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-muted-foreground">{t.auth.checkEmailSpam}</p>
        </div>
        <LinkButton href="/auth/login" variant="secondary" className="w-full">
          {t.auth.toLogin}
        </LinkButton>
      </div>
    </AuthShell>
  )
}
