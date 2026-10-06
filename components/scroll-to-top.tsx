'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUp } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'

/** Sayfayı yumuşak biçimde en başa kaydırır. */
export function scrollWindowToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

/**
 * ScrollToTop
 * -----------
 * Platform (gloval.ai) genel sayfalarında kullanılan "yukarı çık" butonu.
 * Ziyaretçi sayfayı bir ekran boyundan fazla aşağı kaydırınca sağ altta belirir,
 * en yukarı yaklaşınca yeniden kaybolur. Marka moru (`--color-brand`) ile
 * temalanır ve üretilen tenant sitelerinin kendi `BackToTop` bileşeninden
 * bağımsızdır; bu yüzden yalnızca `SiteHeader` kullanılan yüzeylerde render edilir.
 */
export function ScrollToTop() {
  const { t } = useLanguage()
  const [visible, setVisible] = useState(false)
  // Buton, `backdrop-blur` uygulanan sticky <header> içinde render edilirse
  // header yeni bir "containing block" oluşturduğu için `position: fixed`
  // viewport yerine header'a göre konumlanır ve sol/üst köşede kalır. Body'ye
  // portal ile taşıyarak butonun her zaman ekranın sağ altına sabitlenmesini
  // garanti ediyoruz.
  const [mounted, setMounted] = useState(false)
  // Canlı Önizleme (ve benzeri tam ekran modallar) açıldığında `document.body`
  // `overflow: hidden` ile kilitlenir. Bu sırada üretilen sitenin KENDİ teal
  // "yukarı çık" butonu iframe içinde göründüğü için, platformun mor butonunu
  // (body'ye portal edilmiş, önizleme overlay'inin üstünde kalır) gizleyerek
  // iki butonun üst üste binmesini önlüyoruz.
  const [overlayOpen, setOverlayOpen] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const check = () => setOverlayOpen(document.body.style.overflow === 'hidden')
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.body, { attributes: true, attributeFilter: ['style'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const update = () => {
      // Bir ekran boyundan fazla aşağı inildiğinde göster.
      setVisible(window.scrollY > window.innerHeight * 0.6)
    }
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    update()
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  const label = t.nav.backToTop
  // Önizleme/modaller açıkken (body kilitliyken) buton tamamen pasif olur.
  const show = visible && !overlayOpen

  if (!mounted) return null

  return createPortal(
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={scrollWindowToTop}
      aria-hidden={!show}
      tabIndex={show ? 0 : -1}
      className={`fixed bottom-6 right-6 z-[60] inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-lg outline-none transition-all duration-200 hover:scale-105 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95 ${
        show
          ? 'pointer-events-auto translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-3 opacity-0'
      }`}
    >
      <ArrowUp className="h-5 w-5" aria-hidden />
    </button>,
    document.body,
  )
}
