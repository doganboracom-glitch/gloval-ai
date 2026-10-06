'use client'

import { AlertCircle } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Button } from '@/components/ui/button'

/**
 * Route-level error boundary for the whole platform (anything under the root
 * layout that is not covered by a more specific error.tsx). Renders inside the
 * LanguageProvider, so it can localize its copy.
 */
export default function RootError({ reset }: { error: Error; reset: () => void }) {
  const { t } = useLanguage()
  return (
    <main className="grid min-h-svh place-items-center bg-background px-6 text-center">
      <div className="max-w-md">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="size-6" />
        </div>
        <h1 className="mt-5 text-xl font-semibold text-foreground">
          {t.dash.loadErrorTitle}
        </h1>
        <p className="mt-2 text-pretty text-muted-foreground">{t.dash.loadErrorBody}</p>
        <Button onClick={reset} className="mt-6">
          {t.dash.retry}
        </Button>
      </div>
    </main>
  )
}
