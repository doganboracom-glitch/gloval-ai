'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Analytics } from '@vercel/analytics/next'
import { X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { useCookieBannerDoc } from '@/components/cookie-banner-doc-context'
import { COOKIE_BANNER_DOC_LABEL, cookieBannerHref } from '@/lib/cookie-policy-link'
import {
  CONSENT_CHANGE_EVENT,
  CONSENT_COOKIE,
  CONSENT_OPEN_EVENT,
  CONSENT_VERSION,
  readConsent,
  type CookieConsent as ConsentChoice,
} from '@/lib/cookie-consent-storage'
import {
  COOKIE_BANNER_ACTIONS_CLASS,
  COOKIE_BANNER_CLASS,
  COOKIE_BANNER_INNER_CLASS,
  COOKIE_BANNER_INNER_EXPANDED_CLASS,
  applyBannerInset,
} from '@/lib/cookie-banner-layout'

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

const OPEN_EVENT = CONSENT_OPEN_EVENT
const CHANGE_EVENT = CONSENT_CHANGE_EVENT

function writeConsent(consent: ConsentChoice) {
  const payload = { ...consent, v: CONSENT_VERSION }
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
        checked ? 'cookie-toggle-on' : 'cookie-toggle-off'
      }`}
    >
      <span
        className={`cookie-toggle-knob inline-block h-4 w-4 transform rounded-full transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

export function CookieConsent() {
  const { t, lang } = useLanguage()
  const c = t.cookie

  const [consent, setConsent] = useState<ConsentChoice | null>(null)
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

  const persist = useCallback((next: ConsentChoice) => {
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

  const pathname = usePathname()
  const siteDoc = useCookieBannerDoc()
  const bannerDoc = siteDoc === undefined ? 'cerez-politikasi' : siteDoc
  const cookiePolicyHref = cookieBannerHref(bannerDoc, pathname)
  const policyLabel =
    bannerDoc && bannerDoc !== 'cerez-politikasi'
      ? COOKIE_BANNER_DOC_LABEL[bannerDoc][lang === 'en' ? 'en' : 'tr']
      : c.policyLink
  // Reserve room for the banner at the bottom of the page so the last controls
  // (sign-up / pay / publish buttons) can always be scrolled above it.
  const bannerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = document.documentElement
    const node = bannerRef.current
    if (!open || !node) {
      applyBannerInset(root, null)
      return
    }
    const apply = () => applyBannerInset(root, node.offsetHeight)
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(node)
    return () => {
      observer.disconnect()
      applyBannerInset(root, null)
    }
  }, [open, customize])

  const buttonSize =
    'h-9 px-3 text-sm sm:px-4 max-sm:min-w-[8.5rem] max-sm:flex-1'

  return (
    <>
      {/* Rıza verildiyse ve production ise analitiği yükle; aksi hâlde hiç mount etme. */}
      {analyticsAllowed && process.env.NODE_ENV === 'production' && <Analytics />}

      {open && (
        <div
          ref={bannerRef}
          className={COOKIE_BANNER_CLASS}
          role="dialog"
          aria-modal="false"
          aria-labelledby="cookie-title"
        >
          <div className={customize ? COOKIE_BANNER_INNER_EXPANDED_CLASS : COOKIE_BANNER_INNER_CLASS}>
            <div className={`flex items-start gap-3 ${customize ? '' : 'sm:min-w-0 sm:flex-1'}`}>
              <div className="min-w-0 flex-1">
                <h2 id="cookie-title" className="font-display text-sm font-semibold sm:text-base">
                  {c.title}
                </h2>
                <p className="cookie-muted mt-0.5 text-pretty text-xs leading-snug sm:text-sm sm:leading-relaxed">
                  {c.description}
                  {cookiePolicyHref && (
                    <>
                      {' '}
                      <Link href={cookiePolicyHref} className="cookie-link font-medium">
                        {policyLabel}
                      </Link>
                    </>
                  )}
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
                  className="cookie-close rounded-lg p-1 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {customize && (
              <div className="cookie-divider mt-5 space-y-3 border-t pt-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{c.necessary}</p>
                    <p className="cookie-muted mt-0.5 text-xs">
                      {c.necessaryDesc}
                    </p>
                  </div>
                  <span className="cookie-muted shrink-0 rounded-full border cookie-divider px-2.5 py-1 text-[11px] font-medium">
                    {c.always}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{c.analytics}</p>
                    <p className="cookie-muted mt-0.5 text-xs">
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
                    <p className="cookie-muted mt-0.5 text-xs">
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

            <div
              className={
                customize
                  ? 'mt-4 flex flex-wrap gap-2 sm:justify-end'
                  : COOKIE_BANNER_ACTIONS_CLASS
              }
            >
              {customize ? (
                <button
                  type="button"
                  onClick={saveCustom}
                  className={`cookie-btn-primary inline-flex items-center justify-center rounded-xl font-semibold transition-opacity hover:opacity-90 ${buttonSize}`}
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
                    className={`cookie-btn-outline inline-flex items-center justify-center rounded-xl border font-semibold transition-colors ${buttonSize}`}
                  >
                    {c.customize}
                  </button>
                  <button
                    type="button"
                    onClick={rejectAll}
                    className={`cookie-btn-outline inline-flex items-center justify-center rounded-xl border font-semibold transition-colors ${buttonSize}`}
                  >
                    {c.rejectAll}
                  </button>
                  <button
                    type="button"
                    onClick={acceptAll}
                    className={`cookie-btn-primary inline-flex items-center justify-center rounded-xl font-semibold transition-opacity hover:opacity-90 ${buttonSize}`}
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
