'use client'

import { useState } from 'react'

type Health = {
  success: boolean
  configured?: boolean
  mailcow?: { connected: boolean; authenticated: boolean }
  error?: string
  checkedAt?: string
}

type DiagnosticStatus = 'PASS' | 'FAIL' | 'NOT REACHED'
type Diagnostic = {
  success: boolean
  checkedAt?: string
  target?: string | null
  dns?: { status: DiagnosticStatus; address?: string; error?: string }
  httpsConnection?: { status: DiagnosticStatus; error?: string }
  httpResponse?: { status: DiagnosticStatus; statusCode?: number }
  mailcow?: { reached: boolean; authentication: DiagnosticStatus; authenticationStatusCode?: number }
  error?: string | null
}

const labels: Record<string, string> = {
  MAILCOW_CONFIGURATION_MISSING: 'Yapılandırma eksik',
  MAILCOW_AUTHENTICATION_FAILED: 'Ulaşılıyor · Kimlik doğrulama geçersiz',
  MAILCOW_ACCESS_DENIED: 'Erişim reddedildi',
  MAILCOW_CONNECTION_FAILED: 'Ulaşılamıyor',
  MAILCOW_API_FAILED: 'Mailcow API hatası',
}

const diagnosticErrors: Record<string, string> = {
  MAILCOW_AUTHENTICATION_FAILED: 'Mailcow API authentication başarısız. API key kontrol edilmeli.',
  MAILCOW_AUTH_REQUEST_TIMEOUT: 'GLOVAL/Vercel runtime Mailcow sunucusuna HTTPS üzerinden ulaşamıyor.',
  MAILCOW_DNS_FAILED: 'mailserver.gloval.ai DNS çözümlenemiyor.',
  MAILCOW_CONNECTION_FAILED: 'GLOVAL/Vercel runtime Mailcow sunucusuna HTTPS üzerinden ulaşamıyor.',
  MAILCOW_API_KEY_MISSING: 'Mailcow API key yapılandırılmamış.',
}

function statusText(status?: DiagnosticStatus) {
  if (status === 'PASS') return 'Başarılı'
  if (status === 'FAIL') return 'Başarısız'
  return 'Ulaşılamadı'
}

function statusClass(status?: DiagnosticStatus) {
  if (status === 'PASS') return 'text-emerald-500'
  if (status === 'FAIL') return 'text-destructive'
  return 'text-muted-foreground'
}

export function MailHealthCard() {
  const [health, setHealth] = useState<Health | null>(null)
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null)
  const [loading, setLoading] = useState(false)

  async function checkHealth() {
    setLoading(true)
    try {
      const [healthResponse, diagnosticResponse] = await Promise.all([
        fetch('/api/mail/health', { cache: 'no-store' }),
        fetch('/api/mail/diagnostic', { cache: 'no-store' }),
      ])
      setHealth((await healthResponse.json()) as Health)
      setDiagnostic((await diagnosticResponse.json()) as Diagnostic)
    } catch {
      setHealth({ success: false, error: 'MAILCOW_CONNECTION_FAILED', checkedAt: new Date().toISOString() })
      setDiagnostic({ success: false, error: 'MAILCOW_CONNECTION_FAILED', checkedAt: new Date().toISOString() })
    } finally {
      setLoading(false)
    }
  }

  const status = health?.success ? 'Bağlı' : health ? labels[health.error ?? ''] ?? 'Kontrol başarısız' : 'Kontrol edilmedi'
  const statusClassName = health?.success ? 'text-emerald-500' : health ? 'text-destructive' : 'text-muted-foreground'
  const diagnosticError = diagnostic?.error ? diagnosticErrors[diagnostic.error] ?? `Hata: ${diagnostic.error}` : null

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
          <dd className={`mt-1 text-sm font-medium ${statusClassName}`}>{status}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Authentication</dt>
          <dd className={`mt-1 text-sm font-medium ${health?.mailcow?.authenticated ? 'text-emerald-500' : 'text-muted-foreground'}`}>
            {health?.mailcow?.authenticated ? 'Geçerli' : health ? 'Geçersiz' : 'Kontrol edilmedi'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Son kontrol</dt>
          <dd className="mt-1 text-sm font-medium">
            {health?.checkedAt ? new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(health.checkedAt)) : 'Henüz yapılmadı'}
          </dd>
        </div>
      </dl>

      {diagnostic && (
        <div className="mt-6 border-t border-border pt-5">
          <h3 className="text-sm font-semibold">Mailcow Bağlantı Tanısı</h3>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-border/70 p-3">
              <dt className="text-xs text-muted-foreground">DNS</dt>
              <dd className={`mt-1 text-sm font-medium ${statusClass(diagnostic.dns?.status)}`}>{statusText(diagnostic.dns?.status)}</dd>
              <dd className="mt-1 text-xs text-muted-foreground">Hostname: mailserver.gloval.ai</dd>
            </div>
            <div className="rounded-lg border border-border/70 p-3">
              <dt className="text-xs text-muted-foreground">HTTPS</dt>
              <dd className={`mt-1 text-sm font-medium ${statusClass(diagnostic.httpsConnection?.status)}`}>{statusText(diagnostic.httpsConnection?.status)}</dd>
              {diagnostic.httpsConnection?.error && <dd className="mt-1 text-xs text-muted-foreground">Hata: {diagnostic.httpsConnection.error}</dd>}
            </div>
            <div className="rounded-lg border border-border/70 p-3">
              <dt className="text-xs text-muted-foreground">HTTP status</dt>
              <dd className={`mt-1 text-sm font-medium ${statusClass(diagnostic.httpResponse?.status)}`}>{statusText(diagnostic.httpResponse?.status)}</dd>
              {diagnostic.httpResponse?.statusCode && <dd className="mt-1 text-xs text-muted-foreground">Kod: {diagnostic.httpResponse.statusCode}</dd>}
            </div>
            <div className="rounded-lg border border-border/70 p-3">
              <dt className="text-xs text-muted-foreground">Mailcow API</dt>
              <dd className={`mt-1 text-sm font-medium ${statusClass(diagnostic.mailcow?.authentication)}`}>{diagnostic.mailcow?.reached ? 'Ulaşılıyor' : 'Ulaşılamıyor'}</dd>
              <dd className={`mt-1 text-xs ${statusClass(diagnostic.mailcow?.authentication)}`}>Authentication: {statusText(diagnostic.mailcow?.authentication)}</dd>
              {diagnostic.mailcow?.authenticationStatusCode && <dd className="mt-1 text-xs text-muted-foreground">Kod: {diagnostic.mailcow.authenticationStatusCode}</dd>}
            </div>
          </dl>
          {diagnosticError && <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{diagnosticError}</p>}
        </div>
      )}
    </section>
  )
}
