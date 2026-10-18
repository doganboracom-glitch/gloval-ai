'use client'

import { useEffect, useState } from 'react'
import { FileText, X } from 'lucide-react'
import { STARTER_NOTE_COPY, starterNoteStorageKey, type NoteLang } from '@/lib/starter-blog-note'

export function StarterBlogNote({ projectId, lang }: { projectId: string; lang: NoteLang }) {
  const [visible, setVisible] = useState(false)
  const copy = STARTER_NOTE_COPY[lang]

  useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(starterNoteStorageKey(projectId)) !== '1')
    } catch {
      setVisible(false)
    }
  }, [projectId])

  if (!visible) return null

  function dismiss() {
    setVisible(false)
    try {
      window.localStorage.setItem(starterNoteStorageKey(projectId), '1')
    } catch {
      // Storage unavailable: the note only hides for this session.
    }
  }

  return (
    <div role="note" className="flex items-start gap-2 border-b border-border bg-brand/10 px-3 py-2.5">
      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground">{copy.title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{copy.body}</p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={copy.dismiss}
        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  )
}
