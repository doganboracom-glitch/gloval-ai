'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Analytics } from '@vercel/analytics/next'
import { Cookie, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'

/**
 * Gerçekten işleyen çerez onay sistemi.
 *
 * - Zorunlu çerezler her zaman etkindir (rıza gerektirmez).
 * - Analitik ve pazarlama çerezleri yalnızca kullanıcı AÇIKÇA kabul ederse
 *   etkinleşir. Tercih, hem cookie hem localStorage'a yazılır.
 * - Vercel Analytics YALNIZCA analitik rızası verildiğinde (ve production'da)
 *   yüklenir; rıza yoksa hiç mount edilmez. Yani banner dekoratif değildir,
 *   tercihi fiilen uygular.
 * - Footer'daki "Çerez tercihleri" butonu `openCookiePreferences()` ile bu
 *   paneli yeniden açar.
 */

export type CookieConsent = {
  necessary: true
  analytics: boolean
  marketing: boolean
}

const CONSENT_COOKIE = 'gloval_cookie_consent'
const CONSENT_VERSION = 1
const OPEN_EVENT = 'gloval:open-cookie-preferences'
const CHANGE_EVENT = 'gloval:cookie-consent-changed'

type StoredConsent = CookieConsent & { v: number }

function readConsent(): CookieConsent | null {
  if (typeof document === 'undefined') return null
  try {
    const raw = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith(`${CONSENT_COOKIE}=`))
      ?.split('=')[1]
    if (!raw) return null
    const parsed = JSON.parse(decodeURIComponent(raw)) as StoredConsent
    if (parsed.v !== CONSENT_VERSION) return null
    return {
      necessary: true,
      analytics: Boolean(parsed.analytics),
      marketing: Boolean(parsed.marketing),
    }
  } catch {
    return null
  }
}

function writeConsent(consent: CookieConsent) {
  const payload: StoredConsent = { ...consent, v: CONSENT_VERSION }
  const value = encodeURIComponent(JSON.stringify(payload))
  // 6 ay, site geneli. HttpOnly değil: tercih istemci tarafında okunmalı.
  document.cookie = `${CONSENT_COOKIE}=${value}; path=/; max-age=15552000; samesite=lax`
  try {
    window.localStorage.setItem(CONSENT_COOKIE, JSON.stringify(payload))
  } catch {
    // Depolama engelliyse cookie yeterlidir.
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
}

/** Footer / ayarlar bağlantısından çerez tercih panelini yeniden açar. */
export function openCookiePreferences() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(OPEN_EVENT))
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        checked ? 'bg-brand' : 'bg-muted'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

export function CookieConsent() {
  const { t } = useLanguage()
  const c = t.cookie

  const [consent, setConsent] = useState<CookieConsent | null>(null)
  const [ready, setReady] = useState(false)
  const [open, setOpen] = useState(false)
  const [customize, setCustomize] = useState(false)
  const [draftAnalytics, setDraftAnalytics] = useState(false)
  const [draftMarketing, setDraftMarketing] = useState(false)

  // İlk yükleme: mevcut tercihi oku. Yoksa banner'ı göster.
  useEffect(() => {
    const existing = readConsent()
    setConsent(existing)
    setReady(true)
    if (!existing) setOpen(true)
  }, [])

  // Footer'dan yeniden açma isteğini dinle.
  useEffect(() => {
    function onOpen() {
      const existing = readConsent()
      setDraftAnalytics(existing?.analytics ?? false)
      setDraftMarketing(existing?.marketing ?? false)
      setCustomize(true)
      setOpen(true)
    }
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])

  const persist = useCallback((next: CookieConsent) => {
    writeConsent(next)
    setConsent(next)
    setOpen(false)
    setCustomize(false)
  }, [])

  const acceptAll = () =>
    persist({ necessary: true, analytics: true, marketing: true })
  const rejectAll = () =>
    persist({ necessary: true, analytics: false, marketing: false })
  const saveCustom = () =>
    persist({
      necessary: true,
      analytics: draftAnalytics,
      marketing: draftMarketing,
    })

  const analyticsAllowed = ready && consent?.analytics === true

  return (
    <>
      {/* Rıza verildiyse ve production ise analitiği yükle; aksi hâlde hiç mount etme. */}
      {analyticsAllowed && process.env.NODE_ENV === 'production' && <Analytics />}

      {open && (
        <div
          className="fixed inset-x-0 bottom-0 z-[60] px-3 pb-3 sm:px-4 sm:pb-4"
          role="dialog"
          aria-modal="false"
          aria-labelledby="cookie-title"
        >
          <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-5 shadow-lg shadow-black/20 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/12 text-brand">
                <Cookie className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2
                  id="cookie-title"
                  className="font-display text-base font-semibold"
                >
                  {c.title}
                </h2>
                <p className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">
                  {c.description}{' '}
                  <Link
                    href="/yasal/cerez-politikasi"
                    className="font-medium text-brand underline-offset-2 hover:underline"
                  >
                    {c.policyLink}
                  </Link>
                </p>
              </div>
              {consent && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    setCustomize(false)
                  }}
                  aria-label="Kapat"
                  className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {customize && (
              <div className="mt-5 space-y-3 border-t border-border pt-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{c.necessary}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {c.necessaryDesc}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                    {c.always}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{c.analytics}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {c.analyticsDesc}
                    </p>
                  </div>
                  <Toggle
                    checked={draftAnalytics}
                    onChange={setDraftAnalytics}
                    label={c.analytics}
                  />
                </div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{c.marketing}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {c.marketingDesc}
                    </p>
                  </div>
                  <Toggle
                    checked={draftMarketing}
                    onChange={setDraftMarketing}
                    label={c.marketing}
                  />
                </div>
              </div>
            )}

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              {customize ? (
                <button
                  type="button"
                  onClick={saveCustom}
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-brand px-5 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90"
                >
                  {c.save}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftAnalytics(consent?.analytics ?? false)
                      setDraftMarketing(consent?.marketing ?? false)
                      setCustomize(true)
                    }}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-border px-5 text-sm font-semibold transition-colors hover:bg-secondary/60"
                  >
                    {c.customize}
                  </button>
                  <button
                    type="button"
                    onClick={rejectAll}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-border px-5 text-sm font-semibold transition-colors hover:bg-secondary/60"
                  >
                    {c.rejectAll}
                  </button>
                  <button
                    type="button"
                    onClick={acceptAll}
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-brand px-5 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90"
                  >
                    {c.acceptAll}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
