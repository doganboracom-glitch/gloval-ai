'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { AuthShell } from '@/components/auth/auth-shell'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/components/language-provider'
import {
  persistSignupIdeaForCurrentUser,
  restoreSignupIdeaFromCookie,
} from '@/lib/signup-draft-actions'
import { readSignupIdea, storeSignupIdea } from '@/lib/signup-draft-client'

export default function RestoreSignupIdeaPage() {
  const { lang } = useLanguage()
  const router = useRouter()
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const lastAttempt = useRef<number | null>(null)

  useEffect(() => {
    if (lastAttempt.current === attempt) return
    lastAttempt.current = attempt

    async function restore() {
      const cookieResult = await restoreSignupIdeaFromCookie().catch(() => ({ status: 'error' as const }))
      if (cookieResult.status === 'idea') {
        if (storeSignupIdea(cookieResult.prompt)) {
          router.replace('/')
        } else {
          setFailed(true)
        }
        return
      }
      if (cookieResult.status === 'unauthenticated') {
        router.replace('/auth/login?next=%2Fauth%2Frestore-idea')
        return
      }
      if (cookieResult.status === 'error' || cookieResult.status === 'busy') {
        setFailed(true)
        return
      }

      const stagedIdea = readSignupIdea()
      if (!stagedIdea) {
        router.replace('/')
        return
      }
      const result = await persistSignupIdeaForCurrentUser(stagedIdea).catch(() => ({ status: 'error' as const }))
      if (result.status === 'idea') {
        if (storeSignupIdea(result.prompt)) {
          router.replace('/')
        } else {
          setFailed(true)
        }
        return
      }
      if (result.status === 'unauthenticated') {
        router.replace('/auth/login?next=%2Fauth%2Frestore-idea')
        return
      }
      setFailed(true)
    }

    void restore()
  }, [attempt, router])

  return (
    <AuthShell
      title={lang === 'en' ? 'Restoring your idea' : 'Fikrini geri yüklüyoruz'}
      subtitle={lang === 'en' ? 'Your idea will open in the homepage prompt.' : 'Fikrin ana sayfadaki kutuda açılacak.'}
    >
      {failed ? (
        <div className="flex flex-col gap-4">
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm leading-relaxed text-foreground">
            {lang === 'en'
              ? 'We could not restore your idea. It is still available to retry.'
              : 'Fikrini geri yükleyemedik. Yeniden deneyebilirsin.'}
          </p>
          <Button className="w-full" onClick={() => {
            setFailed(false)
            setAttempt((value) => value + 1)
          }}>
            {lang === 'en' ? 'Try again' : 'Yeniden dene'}
          </Button>
        </div>
      ) : (
        <p role="status" className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {lang === 'en' ? 'Opening your idea…' : 'Fikrin açılıyor…'}
        </p>
      )}
    </AuthShell>
  )
}
