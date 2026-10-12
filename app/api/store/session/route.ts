import { NextResponse } from 'next/server'
import { getCurrentStoreCustomer } from '@/lib/store-customer'

export const dynamic = 'force-dynamic'

/**
 * Tells the storefront header whether the visitor is signed in to THIS store.
 * Returns only a boolean — never customer data.
 */
export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get('slug')?.trim() ?? ''
  const noStore = { headers: { 'Cache-Control': 'no-store' } }
  if (!slug || slug.length > 100) return NextResponse.json({ loggedIn: false }, noStore)
  try {
    const customer = await getCurrentStoreCustomer(slug)
    return NextResponse.json({ loggedIn: Boolean(customer) }, noStore)
  } catch {
    return NextResponse.json({ loggedIn: false }, noStore)
  }
}
