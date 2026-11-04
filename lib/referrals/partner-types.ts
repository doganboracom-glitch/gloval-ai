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
