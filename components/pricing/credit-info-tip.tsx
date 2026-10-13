import { Info } from 'lucide-react'

/**
 * Kredi kutusundaki "i" simgesi: devir ve bakiye üst sınırı bilgisini ipucu
 * olarak gösterir. PRO ve E-Ticaret kartları aynı bileşeni kullanır.
 */
export function CreditInfoTip({ text }: { text: string }) {
  return (
    <span
      className="group relative shrink-0 rounded-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      tabIndex={0}
      role="note"
      aria-label={text}
      data-testid="credit-info-tip"
    >
      <Info className="h-4 w-4" aria-hidden />
      <span
        aria-hidden
        className="pointer-events-none absolute right-0 top-6 z-10 w-56 rounded-lg border border-border bg-popover p-2 text-xs leading-relaxed text-muted-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus:opacity-100"
      >
        {text}
      </span>
    </span>
  )
}
