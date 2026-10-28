import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAdminUser } from '@/lib/mail/admin-guard'
import { INVOICE_MAX_BYTES } from '@/lib/invoices/constants'
import { checkInvoiceLimit } from '@/lib/invoices/limit'
import { saveInvoice } from '@/lib/invoices/service'
import type { InvoiceActionError } from '@/lib/invoices/types'

export const runtime = 'nodejs'
export const maxDuration = 60

const STATUS: Partial<Record<InvoiceActionError, number>> = {
  unauthorized: 401,
  rate_limited: 429,
  too_large: 413,
  unsupported_type: 415,
  not_found: 404,
  number_taken: 409,
  conflict: 409,
  storage_failed: 502,
  save_failed: 500,
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true
  try {
    return new URL(origin).host === (request.headers.get('x-forwarded-host') ?? request.headers.get('host'))
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' }
  if (!sameOrigin(request)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 403, headers })

  const actor = await getAdminUser().catch(() => null)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401, headers })

  const limit = await checkInvoiceLimit(actor.userId, 'upload')
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: 'rate_limited' },
      { status: 429, headers: { ...headers, 'Retry-After': String(limit.retryAfterSeconds) } },
    )
  }

  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > INVOICE_MAX_BYTES + 64 * 1024) {
    return NextResponse.json({ ok: false, error: 'too_large' }, { status: 413, headers })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400, headers })
  }
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400, headers })
  if (file.size > INVOICE_MAX_BYTES) return NextResponse.json({ ok: false, error: 'too_large' }, { status: 413, headers })

  const outcome = await saveInvoice({
    actor,
    transactionId: String(form.get('transactionId') ?? ''),
    invoiceNumber: form.get('invoiceNumber'),
    invoiceDate: form.get('invoiceDate'),
    fileBytes: new Uint8Array(await file.arrayBuffer()),
    fileName: file.name,
    refreshSnapshot: form.get('refreshSnapshot') === '1',
  })
  if (!outcome.ok) {
    return NextResponse.json({ ok: false, error: outcome.error }, { status: STATUS[outcome.error] ?? 400, headers })
  }
  revalidatePath('/admin/billing/invoices')
  return NextResponse.json({ ok: true, replaced: outcome.replaced }, { headers })
}
