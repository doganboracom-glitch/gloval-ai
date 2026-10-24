import { AI_CREDIT_CONFIG } from '@/lib/pricing-config'

/**
 * Customer-facing wording for the FREE plan start email. The admin
 * notification and the in-app log keep the system wording; this is only the
 * message the customer receives. No payment or VAT wording: FREE costs nothing.
 */
export function freePlanWelcomeEmail(): { userSubject: string; userBody: string } {
  const credits = AI_CREDIT_CONFIG.free.credits
  return {
    userSubject: 'FREE paketin başladı',
    userBody:
      `Merhaba, FREE paketin başladı: ${credits} AI kredi hediye. ` +
      'Hemen bir site taslağı oluşturabilir, tasarımını düzenleyebilir ve hazır olduğunda yayına alabilirsin. ' +
      'Keyifli çalışmalar dileriz.',
  }
}
