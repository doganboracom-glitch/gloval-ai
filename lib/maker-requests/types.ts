export type MakerRequestBudgetRange = '5000-10000' | '10000-25000' | '25000-plus'

export type MakerRequestStatus = 'new' | 'answered' | 'closed'

export type MakerRequest = {
  id: string
  created_at: string
  user_id: string | null
  full_name: string
  phone: string
  email: string
  budget_range: MakerRequestBudgetRange
  reference_links: string[]
  status: MakerRequestStatus
  consent_version: string
  consent_at: string
  ip_hash: string
  admin_notes: string
  replied_at: string | null
  reply_text: string | null
}
