import { TransferWindowPreview } from '@/components/domains/transfer-window-preview'

type PreviewState = 'locked' | 'window' | 'unlocked'

export default async function TransferWindowPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>
}) {
  const { state } = await searchParams
  const previewState: PreviewState =
    state === 'window' || state === 'unlocked' ? state : 'locked'

  return (
    <main className="min-h-screen bg-background px-6 py-8 text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <p className="text-sm font-medium text-muted-foreground">
          SAHTE ÖNİZLEME — kayıt kuruluşu yanıtları ve ekrandaki kod temsildir.
        </p>
        <TransferWindowPreview state={previewState} />
      </div>
    </main>
  )
}
