import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMyCurrentPlan } from '@/lib/billing'
import { getAddOnOverview } from '@/lib/effective-limits'
import { getLatestAddOnPurchaseOutcome } from '@/lib/addon-purchase-outcome-loader'
import { BrandLogo } from '@/components/brand-logo'
import { LanguageSwitcher } from '@/components/language-switcher'
import { AddOnsPanel } from '@/components/billing/add-ons-panel'

export const dynamic = 'force-dynamic'

export default async function AddOnsPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/billing/add-ons')

  const { payment } = await searchParams
  const currentPlan = await getMyCurrentPlan().catch(() => null)
  const overview = await getAddOnOverview(user.id, currentPlan?.code)
  // The query param only asks us to look; what is shown comes from the stored,
  // callback-verified purchase status.
  const outcome =
    payment === undefined ? null : await getLatestAddOnPurchaseOutcome(user.id).catch(() => null)

  return (
    <div className="relative min-h-svh">
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <main className="relative mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" aria-label="GLOVAL AI" className="flex shrink-0 items-center">
            <BrandLogo />
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user.email ?? ''}
            </span>
          </div>
        </header>
        <AddOnsPanel
          overview={overview}
          variant="full"
          planName={currentPlan?.name ?? null}
          userEmail={user.email ?? ''}
          outcome={outcome}
        />
      </main>
    </div>
  )
}
