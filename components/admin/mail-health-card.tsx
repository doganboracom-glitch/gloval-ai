'use client'

import { useState } from 'react'

type Health = {
  success: boolean
  configured?: boolean
  mailcow?: { connected: boolean; authenticated: boolean }
  error?: string
}

const labels: Record<string, string> = {
  MAILCOW_CONFIGURATION_MISSING: 'Yapılandırma eksik',
  MAILCOW_AUTHENTICATION_FAILED: 'Kimlik doğrulama başarısız',
  MAILCOW_CONNECTION_FAILED: 'Bağlantı kurulamadı',
  MAILCOW_API_FAILED: 'Mailcow API hatası',
}

export function MailHealthCard() {
  const [health, setHealth] = useState<Health | null>(null)
  const [loading, setLoading] = useState(false)

  async function checkHealth() {
    setLoading(true)
    try {
      const response = await fetch('/api/mail/health', { cache: 'no-store' })
      setHealth((await response.json()) as Health)
    } catch {
      setHealth({ success: false, error: 'MAILCOW_CONNECTION_FAILED' })
    } finally {
      setLoading(false)
    }
  }

  const status = health?.success ? 'Bağlı' : health ? labels[health.error ?? ''] ?? 'Kontrol başarısız' : 'Kontrol edilmedi'
  const statusClass = health?.success ? 'text-emerald-500' : health ? 'text-destructive' : 'text-muted-foreground'

  return (
    <section className="rounded-xl border border-border bg-card/70 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">GLOVAL MAIL</p>
          <h2 className="mt-1 font-display text-lg font-semibold">Mail sunucusu sağlığı</h2>
          <p className="mt-1 text-sm text-muted-foreground">Gerçek server-side Mailcow bağlantısı</p>
        </div>
        <button
          type="button"
          onClick={checkHealth}
          disabled={loading}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-wait disabled:opacity-60"
        >
          {loading ? 'Kontrol ediliyor…' : 'Tekrar kontrol et'}
        </button>
      </div>
      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Mail server</dt>
          <dd className="mt-1 text-sm font-medium">mailserver.gloval.ai</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Mailcow API</dt>
          <dd className={`mt-1 text-sm font-medium ${statusClass}`}>{status}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Authentication</dt>
          <dd className={`mt-1 text-sm font-medium ${health?.mailcow?.authenticated ? 'text-emerald-500' : 'text-muted-foreground'}`}>
            {health?.mailcow?.authenticated ? 'Geçerli' : health ? 'Başarısız' : 'Kontrol edilmedi'}
          </dd>
        </div>
      </dl>
    </section>
  )
}
