export type ReferralPartnerStatus = 'active' | 'suspended' | 'closed'
export type ReferralTaxStatus = 'individual' | 'company'
export type ReferralCustomerStatus = 'signup' | 'verified' | 'paid'

export type ReferralPartnerSettings = {
  referralCode: string
  status: ReferralPartnerStatus
  ibanLast4: string | null
}

export type ReferralCustomer = {
  maskedEmail: string
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

export type ReferralAdminPartner = {
  referralCode: string
  status: ReferralPartnerStatus
  maskedEmail: string
  activatedAt: string
  ibanLast4: string | null
  clicks: number
  signups: number
}
