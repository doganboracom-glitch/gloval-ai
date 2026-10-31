import { getSupportCopy } from '@/components/support/support-copy'
import type { TicketDepartment } from '@/lib/support/constants'

export function buildTicketCreatedNotice(input: {
  ticketNumber: string
  department: TicketDepartment
  subject: string
}) {
  const departmentLabel = getSupportCopy('tr').departments[input.department]
  const notificationTitle = `Yeni destek talebi ${input.ticketNumber} · ${departmentLabel}`

  return {
    departmentLabel,
    notificationTitle,
    notificationBody: `${departmentLabel} · ${input.subject}`,
    emailSubject: `[Gloval AI] ${notificationTitle}`,
  }
}
