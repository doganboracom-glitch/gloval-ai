export type ReferralPartnerStatus = 'active' | 'suspended' | 'closed'
export type ReferralTaxStatus = 'individual' | 'company'
export type ReferralCustomerStatus = 'signup' | 'verified' | 'paid'

export type ReferralPartnerSettings = {
  referralCode: string
  status: ReferralPartnerStatus
  ibanLast4: string | null
  termsVersion: string | null
}

export type ReferralCustomer = {
  maskedEmail: string
  accountDeleted: boolean
  status: ReferralCustomerStatus
  createdAt: string
}

export type ReferralDashboardData = {
  referralCode: string
  clicks: number
  signups: number
  verifiedSignups: number
  paidCustomers: number
  customers: ReferralCustomer[]
}

export type ReferralPartnerStatusAction = 'suspend' | 'reactivate' | 'close'

export type ReferralPartnerStatusEvent = {
  id: string
  actorUserId: string | null
  action: ReferralPartnerStatusAction
  fromStatus: ReferralPartnerStatus
  toStatus: ReferralPartnerStatus
  createdAt: string
}

export type ReferralAdminPartner = {
  partnerId: string
  referralCode: string
  status: ReferralPartnerStatus
  maskedEmail: string
  activatedAt: string
  lastStatusChangedAt: string
  ibanLast4: string | null
  clicks: number
  signups: number
  verifiedSignups: number
  paidCustomers: number
}

export type ReferralPayoutMethod = 'cash' | 'credit'
export type ReferralVatMode = 'included' | 'added'
export type ReferralPayoutStatus = 'requested' | 'processed' | 'rejected'

export type ReferralPayoutState = {
  partnerStatus: ReferralPartnerStatus
  taxStatus: ReferralTaxStatus | null
  taxVerified: boolean
  hasIban: boolean
  pendingCents: number
  availableCents: number
  totalCents: number
  convertibleCents: number
  maxCreditCents: number
  maxCashCents: number
  hasDebtBucket: boolean
  partialPayoutsAvailable: boolean
  requestedCents: number
  convertedCents: number
  paidCents: number
  hasOpenCashRequest: boolean
}

export type ReferralPayoutPanelData = {
  state: ReferralPayoutState | null
  unavailable: boolean
}

export type ReferralPayoutAdminRequest = {
  requestId: string
  partnerId: string
  referralCode: string
  partnerStatus: ReferralPartnerStatus
  maskedEmail: string
  payeeName: string | null
  taxStatus: ReferralTaxStatus | null
  taxVerifiedAt: string | null
  ibanLast4: string | null
  method: ReferralPayoutMethod
  balanceCents: number
  payoutCents: number
  creditAmount: number | null
  systemTopupCents: number
  invoiceRequired: boolean
  vatMode: ReferralVatMode | null
  invoiceNetCents: number | null
  invoiceVatCents: number | null
  invoiceGrossCents: number | null
  partial: boolean
  invoiceConfirmed: boolean
  invoiceReference: string | null
  invoiceReceivedAt: string | null
  paymentReference: string | null
  adminNote: string | null
  status: ReferralPayoutStatus
  requestedAt: string
  processedAt: string | null
  rejectionReason: string | null
}

export type ReferralPayoutAdminSummary = {
  pendingCents: number
  availableCents: number
  convertedCents: number
  systemTopupCents: number
  paidCents: number
  openCashRequests: number
}

export type ReferralCommissionAdminStatus = 'pending' | 'available' | 'requested' | 'converted' | 'paid'

export type ReferralCommissionAdminRow = {
  commissionId: string
  partnerId: string
  referralCode: string
  commissionCents: number
  status: ReferralCommissionAdminStatus
  paidAt: string
  availableAt: string
}
