'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import {
  DEFAULT_LANG,
  LANG_COOKIE,
  dictionary,
  normalizeLang,
  type Dict,
  type Lang,
} from '@/lib/i18n'
import { getDirection } from '@/lib/locale-registry'

type LanguageContextValue = {
  lang: Lang
  setLang: (lang: Lang) => void
  t: Dict
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

function persistLang(lang: Lang) {
  if (typeof document === 'undefined') return
  // 1 year, site-wide. Not HttpOnly on purpose: the switcher is client-side.
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`
  try {
    window.localStorage.setItem(LANG_COOKIE, lang)
  } catch {
    // Storage can be blocked (private mode); the cookie is the source of truth.
  }
}

function readStoredLang(): Lang | null {
  if (typeof document === 'undefined') return null
  const fromCookie = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${LANG_COOKIE}=`))
    ?.split('=')[1]
  const cookieLang = normalizeLang(fromCookie)
  if (cookieLang) return cookieLang
  try {
    return normalizeLang(window.localStorage.getItem(LANG_COOKIE))
  } catch {
    return null
  }
}

export function LanguageProvider({
  children,
  initialLang = DEFAULT_LANG,
}: {
  children: React.ReactNode
  initialLang?: Lang
}) {
  const [lang, setLangState] = useState<Lang>(initialLang)

  // Recover the choice for pages that were served without the cookie (e.g. a
  // cached/prerendered response) or when only localStorage survived.
  useEffect(() => {
    const stored = readStoredLang()
    if (stored && stored !== lang) setLangState(stored)
    else if (!stored) persistLang(lang)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = getDirection(lang)
  }, [lang])

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    persistLang(next)
  }, [])

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: dictionary[lang] }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}
