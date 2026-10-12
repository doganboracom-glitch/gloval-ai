'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Download, Loader2, Search, Users, X } from 'lucide-react'
import {
  deleteCustomerByOwner,
  exportCustomersCsv,
  getOwnerCustomerDetail,
  type OwnerCustomerDetail,
  type OwnerCustomerList,
  type OwnerCustomerRow,
} from '@/lib/store-owner-customers'
import { ACCOUNT_DELETION_COPY } from '@/lib/store-account-copy'

const money = (cents: number, currency = 'TRY') =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(cents / 100)
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('tr-TR') : '-')

const SORTS = [
  { value: 'newest', label: 'En yeni kayıt' },
  { value: 'spent', label: 'En çok harcayan' },
  { value: 'last_order', label: 'Son siparişe göre' },
]

export function CustomersClient({
  projectId,
  result,
  q,
  sort,
}: {
  projectId: string
  result: OwnerCustomerList
  q: string
  sort: string
}) {
  const router = useRouter()
  const [detail, setDetail] = useState<OwnerCustomerDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [confirmExport, setConfirmExport] = useState(false)

  function openDetail(row: OwnerCustomerRow) {
    setDetailError(null)
    startTransition(async () => {
      const res = await getOwnerCustomerDetail(projectId, row.id)
      if (res.ok) setDetail(res.customer)
      else setDetailError(res.error)
    })
  }

  function runExport() {
    setExportError(null)
    startTransition(async () => {
      const res = await exportCustomersCsv(projectId)
      setConfirmExport(false)
      if (!res.ok) {
        setExportError(res.error)
        return
      }
      const url = URL.createObjectURL(new Blob([res.csv], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = res.filename
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  const href = (page: number) =>
    `/ecommerce/${projectId}/customers?${new URLSearchParams({ ...(q ? { q } : {}), sort, page: String(page) })}`

  return (
    <div className="relative min-h-svh">
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div className="relative mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/ecommerce/${projectId}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Mağazaya dön
          </Link>
          {result.ok && (
            <button
              type="button"
              onClick={() => setConfirmExport(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/70 px-3 py-1.5 text-sm font-medium transition-colors hover:border-primary/40"
            >
              <Download className="size-4" />
              Müşterileri dışa aktar (CSV)
            </button>
          )}
        </div>

        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-balance">Müşteriler</h1>
        <p className="mt-1 text-sm text-muted-foreground">Mağazanıza üye olan müşteriler.</p>

        {!result.ok ? (
          <div role="alert" className="mt-8 rounded-xl border border-border bg-card/70 p-5 text-sm">
            {result.reason === 'migration_pending'
              ? 'Müşteri listesi için veritabanı güncellemesi bekleniyor. Güncelleme uygulandığında bu sayfa çalışacaktır.'
              : result.reason === 'unauthorized'
                ? 'Bu sayfayı görüntüleme yetkiniz yok.'
                : 'Müşteriler yüklenemedi. Lütfen daha sonra tekrar deneyin.'}
          </div>
        ) : (
          <>
            <dl className="mt-6 grid grid-cols-3 gap-3">
              {[
                ['Toplam üye', result.stats.members],
                ['Bu ay yeni', result.stats.newThisMonth],
                ['Silinen hesap', result.stats.deleted],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-border bg-card/70 p-3 sm:p-4">
                  <dt className="text-xs text-muted-foreground sm:text-sm">{label}</dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{value}</dd>
                </div>
              ))}
            </dl>

            <form method="get" className="mt-6 flex flex-col gap-2 sm:flex-row">
              <label className="relative flex-1">
                <span className="sr-only">Müşteri ara</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Ad, e-posta veya telefon (en az 2 karakter)"
                  className="h-10 w-full rounded-lg border border-border bg-card/70 pl-9 pr-3 text-sm outline-none focus:border-primary/60"
                />
              </label>
              <select
                name="sort"
                defaultValue={sort}
                aria-label="Sırala"
                className="h-10 rounded-lg border border-border bg-card/70 px-3 text-sm"
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
                Ara
              </button>
            </form>

            {exportError && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {exportError}
              </p>
            )}
            {detailError && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {detailError}
              </p>
            )}

            {result.rows.length === 0 ? (
              <div className="mt-8 flex flex-col items-center rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
                <Users className="size-8 text-muted-foreground" />
                <p className="mt-4 font-medium">{q ? 'Aramanızla eşleşen müşteri yok.' : 'Henüz üye müşteri yok.'}</p>
              </div>
            ) : (
              <ul className="mt-6 flex flex-col gap-3">
                {result.rows.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => openDetail(r)}
                      className="w-full rounded-xl border border-border bg-card/70 p-4 text-left transition-colors hover:border-primary/40"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{r.name || r.email}</p>
                          <p className="truncate text-sm text-muted-foreground">{r.email}</p>
                          <p className="text-sm text-muted-foreground">
                            {[r.phone, r.city].filter(Boolean).join(' · ') || '-'}
                          </p>
                        </div>
                        <div className="text-right text-sm">
                          <p className="font-medium tabular-nums">{money(r.total_spent_cents)}</p>
                          <p className="text-muted-foreground">{r.order_count} sipariş</p>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Kayıt: {date(r.created_at)} · Son sipariş: {date(r.last_order_at)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {result.total > result.pageSize && (
              <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Sayfalama">
                {result.page > 1 ? (
                  <Link href={href(result.page - 1)} className="rounded-lg border border-border px-3 py-1.5">
                    Önceki
                  </Link>
                ) : (
                  <span />
                )}
                <span className="text-muted-foreground">
                  {result.page} / {Math.ceil(result.total / result.pageSize)}
                </span>
                {result.page * result.pageSize < result.total ? (
                  <Link href={href(result.page + 1)} className="rounded-lg border border-border px-3 py-1.5">
                    Sonraki
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            )}
          </>
        )}
      </div>

      {pending && !detail && !confirmExport && (
        <div className="fixed bottom-4 right-4 rounded-full bg-card p-2 shadow" role="status" aria-label="Yükleniyor">
          <Loader2 className="size-4 animate-spin" />
        </div>
      )}

      {confirmExport && (
        <Modal title="Müşterileri dışa aktar" onClose={() => setConfirmExport(false)}>
          <p className="text-sm text-muted-foreground">
            Dosya kişisel veri içerir; yalnızca yasal amaçla kullanın. Parola veya oturum bilgisi dışa aktarılmaz.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={runExport}
            className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            CSV indir
          </button>
        </Modal>
      )}

      {detail && (
        <DetailDrawer
          projectId={projectId}
          customer={detail}
          onClose={() => setDetail(null)}
          onDeleted={() => {
            setDetail(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 p-4 backdrop-blur-sm sm:items-center">
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Kapat" className="rounded-md p-1 text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  )
}

function DetailDrawer({
  projectId,
  customer,
  onClose,
  onDeleted,
}: {
  projectId: string
  customer: OwnerCustomerDetail
  onClose: () => void
  onDeleted: () => void
}) {
  const copy = ACCOUNT_DELETION_COPY.tr
  const [deleting, setDeleting] = useState(false)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function remove() {
    setError(null)
    startTransition(async () => {
      const res = await deleteCustomerByOwner({ projectId, customerId: customer.id, confirmEmail: email })
      if (res.ok) onDeleted()
      else setError(res.error)
    })
  }

  const invoiceEntries = Object.entries(customer.invoice ?? {}).filter(
    ([, v]) => typeof v === 'string' && v.trim() !== '',
  ) as [string, string][]

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-background/70 backdrop-blur-sm">
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Müşteri detayı"
        className="flex h-full w-full max-w-md flex-col gap-5 overflow-y-auto border-l border-border bg-card p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{customer.name || customer.email}</h2>
            <p className="text-sm text-muted-foreground">Kayıt: {date(customer.created_at)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat" className="rounded-md p-1 text-muted-foreground hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>

        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Sipariş</p>
            <p className="text-lg font-semibold tabular-nums">{customer.orderCount}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Toplam harcama</p>
            <p className="text-lg font-semibold tabular-nums">{money(customer.totalSpentCents)}</p>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-medium">Profil</h3>
          <dl className="mt-2 flex flex-col gap-1 text-sm">
            {[
              ['E-posta', customer.email],
              ['Telefon', customer.phone],
              ['Şehir', customer.city],
              ['Adres', customer.address],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="break-words text-right">{v || '-'}</dd>
              </div>
            ))}
          </dl>
        </section>

        {invoiceEntries.length > 0 && (
          <section>
            <h3 className="text-sm font-medium">Fatura bilgisi</h3>
            <dl className="mt-2 flex flex-col gap-1 text-sm">
              {invoiceEntries.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="break-words text-right">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section>
          <h3 className="text-sm font-medium">Sipariş geçmişi</h3>
          {customer.orders.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Henüz sipariş yok.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {customer.orders.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/ecommerce/${projectId}/orders#order-${o.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm hover:border-primary/40"
                  >
                    <span>
                      <span className="block font-mono text-xs">#{o.id.slice(0, 8)}</span>
                      <span className="text-muted-foreground">
                        {date(o.created_at)} · {o.status}
                      </span>
                    </span>
                    <span className="font-medium tabular-nums">{money(o.total_cents, o.currency)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-auto rounded-xl border border-destructive/40 p-4">
          {!deleting ? (
            <button
              type="button"
              onClick={() => setDeleting(true)}
              className="w-full rounded-lg border border-destructive/50 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
            >
              Hesabı sil (müşteri talebi)
            </button>
          ) : (
            <div className="flex flex-col gap-3 text-sm">
              <div>
                <p className="font-medium">{copy.removedTitle}</p>
                <ul className="list-disc pl-5 text-muted-foreground">
                  {copy.removed.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-medium">{copy.keptTitle}</p>
                <ul className="list-disc pl-5 text-muted-foreground">
                  {copy.kept.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
              <label className="flex flex-col gap-1">
                <span>Onaylamak için müşterinin e-postasını yazın</span>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={customer.email}
                  autoComplete="off"
                  className="h-10 rounded-lg border border-border bg-background px-3 outline-none focus:border-destructive"
                />
              </label>
              {error && (
                <p role="alert" className="text-destructive">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDeleting(false)
                    setError(null)
                  }}
                  className="h-10 flex-1 rounded-lg border border-border"
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  disabled={pending || !email.trim()}
                  onClick={remove}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-destructive px-3 font-medium text-destructive-foreground disabled:opacity-60"
                >
                  {pending && <Loader2 className="size-4 animate-spin" />}
                  Kalıcı olarak sil
                </button>
              </div>
            </div>
          )}
        </section>
      </aside>
    </div>
  )
}
