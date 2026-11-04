import { AddOnsPanel } from '@/components/billing/add-ons-panel'
import { buildAddOnOverview, resolveAddOnPrices } from '@/lib/add-ons'

const overview = buildAddOnOverview({
  planCode: 'ecommerce',
  grants: [],
  prices: resolveAddOnPrices([]),
})

export default function AddOnsPreviewPage() {
  return (
    <main className="relative mx-auto min-h-svh w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <AddOnsPanel
        overview={overview}
        variant="full"
        planName="E-Ticaret"
        userEmail=""
        outcome={null}
        profileComplete
      />
    </main>
  )
}
