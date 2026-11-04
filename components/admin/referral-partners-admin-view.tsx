import Link from 'next/link'
import { ArrowLeft, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { ReferralAdminPartner } from '@/lib/referrals/partner-types'

function formatDate(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' }).format(date)
}

function statusLabel(status: ReferralAdminPartner['status']): string {
  if (status === 'active') return 'Aktif'
  if (status === 'suspended') return 'Askıda'
  return 'Kapalı'
}

export function ReferralPartnersAdminView({ partners }: { partners: ReferralAdminPartner[] }) {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Satış ortakları</h1>
          <p className="mt-1 text-sm text-muted-foreground">Yönlendirme kayıtları ve toplam performans. Bu görünüm salt okunurdur.</p>
        </div>
        <Link
          href="/admin"
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-secondary/40 px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Yönetim paneli
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4 text-muted-foreground" aria-hidden="true" />
            Ortaklık kayıtları
          </CardTitle>
          <CardDescription>E-posta adresleri sunucu tarafında maskelenir; yalnızca IBAN’ın son 4 hanesi gösterilir.</CardDescription>
        </CardHeader>
        <CardContent>
          {partners.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz satış ortağı kaydı yok.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Yönlendirme kodu</TableHead>
                    <TableHead>E-posta</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead>Katılım</TableHead>
                    <TableHead>IBAN</TableHead>
                    <TableHead className="text-right">Tıklama</TableHead>
                    <TableHead className="text-right">Kayıt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partners.map((partner) => (
                    <TableRow key={partner.referralCode}>
                      <TableCell className="font-mono text-xs">{partner.referralCode}</TableCell>
                      <TableCell className="max-w-56 truncate">{partner.maskedEmail}</TableCell>
                      <TableCell>
                        <Badge variant={partner.status === 'active' ? 'default' : 'secondary'}>
                          {statusLabel(partner.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(partner.activatedAt)}</TableCell>
                      <TableCell className="font-mono text-xs">{partner.ibanLast4 ? `•••• ${partner.ibanLast4}` : '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{partner.clicks.toLocaleString('tr-TR')}</TableCell>
                      <TableCell className="text-right tabular-nums">{partner.signups.toLocaleString('tr-TR')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
