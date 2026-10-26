/**
 * Class contract of the payment settings window. The panel has a fixed height
 * (so switching tabs never resizes the frame), its header, tab bar and info
 * line never shrink, and only the content area flexes and scrolls vertically.
 * The tab bar scrolls sideways when tabs overflow, never vertically.
 */
export const PAYMENT_DIALOG_LAYOUT = {
  panel:
    'flex h-[min(44rem,92svh)] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-2xl outline-none sm:rounded-2xl',
  header: 'flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6',
  tabList:
    'flex shrink-0 gap-1 overflow-x-auto overflow-y-hidden border-b border-border px-3 py-2 sm:px-5',
  tab: 'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
  info: 'shrink-0 border-b border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground sm:px-6',
  body: 'min-h-0 flex-1 basis-auto overflow-y-auto overscroll-contain px-4 py-5 sm:px-6',
} as const
