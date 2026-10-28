/**
 * Boundary for the day invoices are issued by an e-invoice integrator instead
 * of being uploaded by hand. Everything that creates an invoice record goes
 * through an `InvoiceProvider`; today the only one is `manual` (an admin
 * uploads the PDF issued in the accounting portal). An integrator provider
 * would implement `issue` and set `source = 'integrator'` + `provider_ref`;
 * storage, audit and customer download stay unchanged.
 */

export type InvoiceSource = 'manual' | 'integrator'

export type InvoiceIssueRequest = {
  billingTransactionId: string
  invoiceNumber: string
  invoiceDate: string
  pdf: Uint8Array
  fileName: string
}

export type InvoiceIssueResult = {
  source: InvoiceSource
  providerRef: string | null
}

export interface InvoiceProvider {
  readonly id: InvoiceSource
  issue(request: InvoiceIssueRequest): Promise<InvoiceIssueResult>
}

export const manualInvoiceProvider: InvoiceProvider = {
  id: 'manual',
  async issue() {
    return { source: 'manual', providerRef: null }
  },
}

export function getInvoiceProvider(): InvoiceProvider {
  return manualInvoiceProvider
}
