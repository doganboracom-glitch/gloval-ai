export const INVOICE_BUCKET = 'invoices'
export const INVOICE_MAX_BYTES = 5 * 1024 * 1024
export const INVOICE_SIGNED_URL_SECONDS = 60
export const INVOICE_PAGE_SIZE = 25
/** Candidate rows scanned per list request; payment volume is small, filtering happens in memory. */
export const INVOICE_SCAN_LIMIT = 2000

/** Prices are stored VAT-inclusive; Turkish standard VAT rate. */
export const VAT_RATE = 0.2

/** Ledger kinds that are a customer charge and can need an invoice. Credits and refunds never do. */
export const INVOICE_ELIGIBLE_KINDS = ['charge', 'proration_debit'] as const

export const LIVE_PROVIDER = 'iyzico'

export const UNASSIGNED_FOLDER = '_unassigned'

/** Server-only holding area for PDFs of invoices turned back into "not required". Never signed, never listed to customers. */
export const ARCHIVE_FOLDER = '_archived'
