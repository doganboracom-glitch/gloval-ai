import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isDomainE2ETestModeEnabled } from '@/lib/payments/domain-e2e-mode'
import { retrieveIyzicoCheckoutForm } from '@/lib/payments/iyzico'
import { settlePaymentResult } from '@/lib/payments/settle'

/**
 * iyzico Checkout Form callback. Unlike Stripe/PayTR, Checkout Form has no
 * signed push webhook — after the buyer finishes on iyzico's hosted page,
 * their BROWSER is redirected here (a real navigation, not a background
 * server-to-server call) carrying only the CF `token`.
 *
 * The token itself proves nothing: this route MUST call iyzico's retrieve
 * ("detail") API server-side and treat ONLY that authoritative response as
 * the payment result before activating anything. The subscription/entitlement
 * is then flipped to active through the same `settlePaymentResult` helper the
 * push-webhook route uses, so the two paths can never diverge.
 *
 * The callback response is a tiny same-origin bridge page: inside the hosted
 * iframe it posts the verified result to the parent and never navigates the
 * parent to a GLOVAL page. If opened as a top-level page, it falls back to the
 * public payment-result screen.
 */

function callbackResponse(
  request: Request,
  status: 'success' | 'failed' | 'error',
  destination: 'billing' | 'domains' | 'addons' = 'billing',
) {
  const origin = new URL(request.url).origin
  const payload = JSON.stringify({ source: 'gloval-payment', status, destination })
  // Add-on results are read back from the stored purchase, so that page only
  // needs to be told to look (`payment=return`), not what the result was.
  const fallback =
    destination === 'domains'
      ? `${origin}/dashboard/domains?payment=${status}`
      : destination === 'addons'
        ? `${origin}/billing/add-ons?payment=return`
        : `${origin}/payment-result?checkout=${status}`
  const html = `<!doctype html><title>Ödeme sonucu</title><script>
    const message = ${payload};
    const target = window.opener && !window.opener.closed ? window.opener : null;
    if (target) {
      target.postMessage(message, ${JSON.stringify(origin)});
      window.close();
    } else if (window.parent !== window) {
      window.parent.postMessage(message, ${JSON.stringify(origin)});
    } else {
      window.location.replace(${JSON.stringify(fallback)});
    }
  </script>`
  return new NextResponse(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

/** Pulls the authoritative charged amount/currency/order ref out of iyzico's retrieve response. */
function extractPaidDetails(raw: Record<string, unknown>) {
  const paid = Number(raw.paidPrice)
  const currency = typeof raw.currency === 'string' ? raw.currency.trim().toUpperCase() : undefined
  const orderRef =
    typeof raw.basketId === 'string' && raw.basketId
      ? raw.basketId
      : typeof raw.conversationId === 'string' && raw.conversationId
        ? raw.conversationId
        : undefined
  return {
    paidAmountCents: Number.isFinite(paid) ? Math.round(paid * 100) : undefined,
    paidCurrency: currency,
    orderRef,
  }
}

async function extractToken(request: Request): Promise<string | null> {
  const url = new URL(request.url)
  const queryToken = url.searchParams.get('token')
  if (queryToken) return queryToken

  const contentType = request.headers.get('content-type') ?? ''
  const rawBody = await request.text()
  if (!rawBody) return null

  if (contentType.includes('application/json')) {
    try {
      const json = JSON.parse(rawBody) as { token?: string }
      return json.token ?? null
    } catch {
      return null
    }
  }

  const params = new URLSearchParams(rawBody)
  return params.get('token')
}

/**
 * Whether this token belongs to a buy-a-domain order we created. It only matters
 * for the controlled E2E test mode (the sole case where production may verify
 * against the sandbox host), so the lookup is skipped entirely otherwise and the
 * normal production path is untouched.
 */
async function isDomainPurchaseToken(token: string): Promise<boolean> {
  const { data } = await createAdminClient()
    .from('domain_orders')
    .select('id')
    .eq('payment_reference', token)
    .maybeSingle()
  return Boolean(data)
}

/** Whether this token belongs to an add-on purchase; only picks where the buyer lands. */
async function isAddOnPurchaseToken(token: string): Promise<boolean> {
  try {
    const { data } = await createAdminClient()
      .from('addon_purchases')
      .select('id')
      .eq('provider_ref', token)
      .maybeSingle()
    return Boolean(data)
  } catch {
    return false
  }
}

async function handle(request: Request) {
  console.log('[v0] iyzico callback: request received', {
    method: request.method,
    url: new URL(request.url).pathname,
  })

  const token = await extractToken(request)
  console.log('[v0] iyzico callback: token extraction', {
    hasToken: Boolean(token),
    tokenLength: token?.length ?? 0,
  })
  if (!token) return callbackResponse(request, 'error')

  let retrieved: Awaited<ReturnType<typeof retrieveIyzicoCheckoutForm>>
  let domainPurchase = false
  const addOnPurchase = await isAddOnPurchaseToken(token)
  const destination = addOnPurchase ? 'addons' : null
  try {
    domainPurchase = await isDomainPurchaseToken(token)
    retrieved = await retrieveIyzicoCheckoutForm(token, {
      // Sandbox verification is restricted to the explicit domain E2E mode;
      // live domain payments still use the normal production credentials.
      domainPurchase: domainPurchase && isDomainE2ETestModeEnabled(),
    })
  } catch (err) {
    // Could not verify with iyzico — never activate anything on an
    // unverifiable result.
    console.log('[v0] iyzico callback: retrieve failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return callbackResponse(request, 'error', destination ?? (domainPurchase ? 'domains' : 'billing'))
  }

  console.log('[v0] iyzico callback: retrieve succeeded, settling', {
    paid: retrieved.paid,
    status: retrieved.status,
  })

  const outcome = await settlePaymentResult('iyzico', {
    kind: 'payment',
    reference: token,
    status: retrieved.paid ? 'paid' : 'failed',
    ...extractPaidDetails(retrieved.raw),
  })

  console.log('[v0] iyzico callback: settle outcome', { outcome })

  return callbackResponse(
    request,
    retrieved.paid ? 'success' : 'failed',
    destination ?? (domainPurchase ? 'domains' : 'billing'),
  )
}

export async function POST(request: Request) {
  return handle(request)
}

// iyzico's hosted Checkout Form page normally redirects via POST, but some
// buyer flows (e.g. a plain back-navigation) can hit this as a GET — handle
// it the same way rather than 405-ing on the buyer.
export async function GET(request: Request) {
  return handle(request)
}
