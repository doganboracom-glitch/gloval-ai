'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { restoreLastValidVersion } from '@/lib/projects'

const MESSAGES = {
  NO_VALID_VERSION: 'Geri dönülecek geçerli bir sürüm bulunamadı. Lütfen destek talebi oluşturun.',
  RATE_LIMITED: 'Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.',
  FAILED: 'Sürüme dönülemedi. Lütfen tekrar deneyin ya da destek talebi oluşturun.',
} as const

export function RestoreLastValidButton({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function restore() {
    setError(null)
    startTransition(async () => {
      try {
        const result = await restoreLastValidVersion(projectId)
        if (result.ok) {
          router.refresh()
          return
        }
        setError(MESSAGES[result.reason])
      } catch {
        setError(MESSAGES.FAILED)
      }
    })
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={restore}
        disabled={pending}
        className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground disabled:opacity-60"
      >
        {pending ? 'Geri dönülüyor…' : 'Son geçerli sürüme dön'}
      </button>
      {error ? (
        <p role="alert" className="max-w-sm text-pretty text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
