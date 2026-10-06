'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { LOCALE_REGISTRY, SUPPORTED_LOCALES } from '@/lib/locale-registry'
import { LocaleFlag } from '@/components/locale-flags'
import type { Lang } from '@/lib/i18n'

export function LanguageSwitcher() {
  const { lang, setLang } = useLanguage()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const listId = useId()

  const close = useCallback((refocusTrigger: boolean) => {
    setOpen(false)
    if (refocusTrigger) triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        close(true)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, close])

  useEffect(() => {
    if (open) optionRefs.current[SUPPORTED_LOCALES.indexOf(lang)]?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function handleOptionKeyDown(event: React.KeyboardEvent, index: number) {
    const columns = 2
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % SUPPORTED_LOCALES.length
    else if (event.key === 'ArrowLeft')
      nextIndex = (index - 1 + SUPPORTED_LOCALES.length) % SUPPORTED_LOCALES.length
    else if (event.key === 'ArrowDown') nextIndex = (index + columns) % SUPPORTED_LOCALES.length
    else if (event.key === 'ArrowUp')
      nextIndex = (index - columns + SUPPORTED_LOCALES.length) % SUPPORTED_LOCALES.length

    if (nextIndex !== null) {
      event.preventDefault()
      optionRefs.current[nextIndex]?.focus()
    }
  }

  function selectLang(next: Lang) {
    setLang(next)
    close(true)
  }

  const active = LOCALE_REGISTRY[lang]

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-secondary/60 ps-2.5 pe-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <LocaleFlag code={active.code} className="shrink-0 rounded-[2px]" />
        <span className="uppercase">{active.code}</span>
        <ChevronDown
          aria-hidden="true"
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label="Dil / Language"
          aria-activedescendant={`${listId}-${lang}`}
          className="animate-in fade-in-0 zoom-in-95 absolute end-0 top-[calc(100%+0.5rem)] z-[60] w-[304px] max-w-[calc(100vw-1.5rem)] origin-top-right rounded-2xl border border-border bg-popover/95 p-1.5 shadow-xl shadow-black/20 backdrop-blur-xl duration-150"
        >
          <div className="mb-1 px-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {'Dil / Language'}
          </div>
          <div className="grid grid-cols-2 gap-1">
            {SUPPORTED_LOCALES.map((code, index) => {
              const locale = LOCALE_REGISTRY[code]
              const isActive = code === lang
              return (
                <button
                  key={code}
                  ref={(el) => {
                    optionRefs.current[index] = el
                  }}
                  id={`${listId}-${code}`}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => selectLang(code)}
                  onKeyDown={(event) => handleOptionKeyDown(event, index)}
                  className={`flex items-center gap-1.5 rounded-lg px-2 py-2 text-start text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isActive
                      ? 'bg-primary/10 text-foreground'
                      : 'text-foreground/90 hover:bg-secondary'
                  }`}
                >
                  <LocaleFlag code={code} className="shrink-0 rounded-[2px]" />
                  <span dir={locale.direction} className="min-w-0 flex-1 truncate font-medium">
                    {locale.nativeName}
                  </span>
                  {isActive && <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-primary" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
