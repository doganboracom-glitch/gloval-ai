import { createClient } from '@supabase/supabase-js'

/**
 * Server-only Supabase client using the service role key. It bypasses RLS, so
 * it must NEVER be imported into client components or exposed to the browser.
 *
 * Used exclusively for trusted, server-validated writes that anonymous buyers
 * cannot perform under RLS — e.g. creating an order after the server has
 * recomputed the total from authoritative product prices.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('Supabase admin client is missing URL or service role key.')
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
