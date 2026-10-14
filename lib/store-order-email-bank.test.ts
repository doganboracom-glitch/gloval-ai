import { describe, expect, it, vi } from 'vitest'
import { BANK_DETAILS_MISSING_COPY } from '@/lib/bank-transfer-instructions'
import { renderOrderEmail, type OrderEmailData } from '@/lib/store-order-email'

vi.mock('server-only', () => ({}))

const IBAN = 'TR33 0006 1005 1978 6457 8413 26'

function pendingBankMail(overrides: Partial<OrderEmailData> = {}): OrderEmailData {
  return {
    kind: 'buyer-pending',
    lang: 'tr',
    storeName: 'Luna Mücevher',
    orderNumber: '549b4939',
    items: [{ name: 'Yüzük', quantity: 1, line_total_cents: 100000 }],
    subtotalCents: 100000,
    shippingCents: 0,
    totalCents: 100000,
    currency: 'TRY',
    paymentLabel: 'Havale / EFT',
    customerName: 'Test Alıcı',
    bankTransfer: true,
    ...overrides,
  }
}

describe('renderOrderEmail - bank transfer details', () => {
  it('lists the IBAN, holder, bank, order reference and hint when details exist', () => {
    const mail = renderOrderEmail(
      pendingBankMail({
        orderUrl: 'https://luna.gloval.site/order/549b4939?t=token',
        bank: {
          bankName: 'Garanti BBVA',
          accountHolder: 'Luna Mücevher Ltd.',
          iban: IBAN,
          reference: '549b4939',
          dueDate: '17 Ekim 2026',
        },
      }),
    )

    for (const body of [mail.html, mail.text]) {
      expect(body).toContain(IBAN)
      expect(body).toContain('Garanti BBVA')
      expect(body).toContain('Luna Mücevher Ltd.')
      expect(body).toContain('17 Ekim 2026')
      expect(body).not.toContain(BANK_DETAILS_MISSING_COPY.tr.body)
    }
    expect(mail.text).toContain('Havale açıklamasına sipariş numaranızı (#549b4939)')
    expect(mail.html).toContain('Havale bilgilerini görüntüle')
  })

  it('shows the owner note when the IBAN is empty but a note was written (fallback)', () => {
    const mail = renderOrderEmail(
      pendingBankMail({ bank: { instructions: 'Ödemeyi WhatsApp üzerinden netleştirelim.' } }),
    )

    expect(mail.text).toContain('Ödemeyi WhatsApp üzerinden netleştirelim.')
    expect(mail.text).not.toContain('IBAN:')
    expect(mail.text).not.toContain(BANK_DETAILS_MISSING_COPY.tr.body)
  })

  it('tells the buyer to contact the store when there is no IBAN and no note', () => {
    const mail = renderOrderEmail(pendingBankMail({ bank: undefined }))

    expect(mail.text).toContain(BANK_DETAILS_MISSING_COPY.tr.body)
    expect(mail.html).toContain(BANK_DETAILS_MISSING_COPY.tr.body)
    expect(mail.text).not.toContain('IBAN:')
    expect(mail.html).not.toContain('Havale bilgilerini görüntüle')
  })

  it('uses the English missing-details copy for English mails', () => {
    const mail = renderOrderEmail(pendingBankMail({ lang: 'en', bank: undefined }))

    expect(mail.text).toContain(BANK_DETAILS_MISSING_COPY.en.body)
  })

  it('does not show bank details or the missing notice on a cash-on-delivery mail', () => {
    const mail = renderOrderEmail(
      pendingBankMail({ bankTransfer: false, cashOnDelivery: true, paymentLabel: 'Kapıda ödeme', bank: undefined }),
    )

    expect(mail.text).not.toContain(BANK_DETAILS_MISSING_COPY.tr.body)
    expect(mail.text).not.toContain('IBAN:')
  })
})
