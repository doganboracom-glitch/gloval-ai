'use client'

import { useState } from 'react'
import { useLanguage } from '@/components/language-provider'

interface Candidate {
  domain: string
  hosts: string[]
  registrarSource: string
  orderId: string
  projectBinding: 'bound' | 'unbound'
  hostingStatus: string
  createdAt: string
}

interface DryRun {
  hostingConfigured: boolean
  candidates: Candidate[]
}

interface CleanupResult {
  domain: string
  detached: boolean
  error?: string
}

type Phase = 'idle' | 'loading' | 'review' | 'applying' | 'done'

const copy = {
  tr: {
    title: "Vercel'deki Bağlantısız Domainleri Temizle",
    description:
      "Satın alınmış ancak hiçbir GLOVAL projesine bağlanmamış domainlerin Vercel'deki apex + www bağlantısını kaldırır. Registrar kaydı, domain kaydı ve sipariş silinmez.",
    scan: 'Listeyi Getir',
    scanning: 'Taranıyor...',
    none: 'Temizlenecek domain bulunamadı.',
    found: 'Temizlenecek domain',
    registrar: 'Registrar',
    order: 'Sipariş',
    binding: 'Proje bağlantısı',
    unbound: 'Bağlı değil',
    hosting: 'Hosting durumu',
    hosts: 'Vercel bağlantıları',
    notConfigured: "Vercel API yapılandırılmamış; temizlik çalıştırılamaz.",
    confirmTitle: 'Onay gerekiyor',
    confirmBody: (n: number) =>
      `${n} domainin Vercel bağlantısı (apex + www) kaldırılacak. Bu işlem registrar kaydını ve sipariş kayıtlarını silmez.`,
    confirm: 'Onayla ve Temizle',
    cancel: 'Vazgeç',
    applying: 'Temizleniyor...',
    done: 'Sonuç',
    detached: 'Kaldırıldı',
    failed: 'Başarısız',
    rescan: 'Yeniden Tara',
    error: 'İşlem başarısız oldu. Lütfen tekrar deneyin.',
  },
  en: {
    title: 'Detach Unbound Domains from Vercel',
    description:
      "Removes the Vercel apex + www attachment of purchased domains that aren't bound to any GLOVAL project. The registrar registration, domain row and order are kept.",
    scan: 'Load List',
    scanning: 'Scanning...',
    none: 'No domains to clean up.',
    found: 'Domains to clean up',
    registrar: 'Registrar',
    order: 'Order',
    binding: 'Project binding',
    unbound: 'Not bound',
    hosting: 'Hosting status',
    hosts: 'Vercel attachments',
    notConfigured: 'Vercel API is not configured; cleanup cannot run.',
    confirmTitle: 'Confirmation required',
    confirmBody: (n: number) =>
      `The Vercel attachment (apex + www) of ${n} domain(s) will be removed. Registrar registrations and orders are not deleted.`,
    confirm: 'Confirm and Clean Up',
    cancel: 'Cancel',
    applying: 'Cleaning up...',
    done: 'Result',
    detached: 'Detached',
    failed: 'Failed',
    rescan: 'Scan Again',
    error: 'The request failed. Please try again.',
  },
} as const

export function DetachUnboundDomains() {
  const { lang } = useLanguage()
  const t = copy[lang === 'tr' ? 'tr' : 'en']
  const [phase, setPhase] = useState<Phase>('idle')
  const [dryRun, setDryRun] = useState<DryRun | null>(null)
  const [results, setResults] = useState<CleanupResult[]>([])
  const [error, setError] = useState<string | null>(null)

  async function scan() {
    setPhase('loading')
    setError(null)
    try {
      const res = await fetch('/api/admin/domains/detach-unbound', { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      setDryRun((await res.json()) as DryRun)
      setPhase('review')
    } catch {
      setError(t.error)
      setPhase('idle')
    }
  }

  async function apply() {
    setPhase('applying')
    setError(null)
    try {
      const res = await fetch('/api/admin/domains/detach-unbound', { method: 'POST' })
      if (!res.ok) throw new Error(String(res.status))
      const body = (await res.json()) as { results: CleanupResult[] }
      setResults(body.results)
      setPhase('done')
    } catch {
      setError(t.error)
      setPhase('review')
    }
  }

  const candidates = dryRun?.candidates ?? []

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card/70 p-5" aria-labelledby="detach-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <h3 id="detach-title" className="font-display text-lg font-semibold text-balance">
            {t.title}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">{t.description}</p>
        </div>
        {phase === 'idle' || phase === 'loading' ? (
          <button
            type="button"
            onClick={scan}
            disabled={phase === 'loading'}
            className="h-9 rounded-lg bg-brand px-4 text-sm font-medium text-brand-foreground disabled:opacity-60"
          >
            {phase === 'loading' ? t.scanning : t.scan}
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {phase === 'review' || phase === 'applying' ? (
        <div className="flex flex-col gap-4">
          {dryRun && !dryRun.hostingConfigured ? (
            <p role="alert" className="text-sm text-destructive">
              {t.notConfigured}
            </p>
          ) : null}

          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.none}</p>
          ) : (
            <>
              <p className="text-sm font-medium">
                {t.found}: {candidates.length}
              </p>
              <ul className="flex flex-col gap-2">
                {candidates.map((c) => (
                  <li key={c.domain} className="rounded-lg border border-border bg-background/40 p-3 text-sm">
                    <p className="font-medium">{c.domain}</p>
                    <dl className="mt-2 grid gap-x-6 gap-y-1 text-muted-foreground sm:grid-cols-2">
                      <div>
                        <dt className="inline">{t.hosts}: </dt>
                        <dd className="inline">{c.hosts.join(', ')}</dd>
                      </div>
                      <div>
                        <dt className="inline">{t.binding}: </dt>
                        <dd className="inline">{c.projectBinding === 'unbound' ? t.unbound : c.projectBinding}</dd>
                      </div>
                      <div>
                        <dt className="inline">{t.registrar}: </dt>
                        <dd className="inline">{c.registrarSource}</dd>
                      </div>
                      <div>
                        <dt className="inline">{t.hosting}: </dt>
                        <dd className="inline">{c.hostingStatus}</dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="inline">{t.order}: </dt>
                        <dd className="inline font-mono text-xs">{c.orderId}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>

              <div role="alertdialog" aria-label={t.confirmTitle} className="rounded-lg border border-border bg-muted/40 p-4">
                <p className="text-sm font-medium">{t.confirmTitle}</p>
                <p className="mt-1 text-sm text-muted-foreground text-pretty">{t.confirmBody(candidates.length)}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={apply}
                    disabled={phase === 'applying' || !dryRun?.hostingConfigured}
                    className="h-9 rounded-lg bg-destructive px-4 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {phase === 'applying' ? t.applying : t.confirm}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhase('idle')}
                    disabled={phase === 'applying'}
                    className="h-9 rounded-lg border border-border px-4 text-sm disabled:opacity-60"
                  >
                    {t.cancel}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      ) : null}

      {phase === 'done' ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">{t.done}</p>
          <ul className="flex flex-col gap-1 text-sm">
            {results.map((r) => (
              <li key={r.domain} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.domain}</span>
                <span className={r.detached ? 'text-muted-foreground' : 'text-destructive'}>
                  {r.detached ? t.detached : `${t.failed}${r.error ? ` (${r.error})` : ''}`}
                </span>
              </li>
            ))}
            {results.length === 0 ? <li className="text-muted-foreground">{t.none}</li> : null}
          </ul>
          <button
            type="button"
            onClick={scan}
            className="h-9 w-fit rounded-lg border border-border px-4 text-sm"
          >
            {t.rescan}
          </button>
        </div>
      ) : null}
    </section>
  )
}
