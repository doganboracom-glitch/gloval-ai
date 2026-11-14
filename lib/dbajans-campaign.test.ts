import { describe, expect, it } from 'vitest'
import {
  DBAJANS_WHATSAPP_DISPLAY,
  DBAJANS_WHATSAPP_NUMBER,
  DBAJANS_WHATSAPP_URL,
} from './dbajans-campaign'

describe('DB AJANS campaign contact details', () => {
  it('formats the single source WhatsApp number for display', () => {
    expect(DBAJANS_WHATSAPP_DISPLAY).toBe('0850 308 40 88')
  })

  it('builds the exact prefilled WhatsApp message URL', () => {
    expect(DBAJANS_WHATSAPP_URL).toBe(
      `https://wa.me/${DBAJANS_WHATSAPP_NUMBER}?text=Merhaba%2C%20DB%20AJANS%27tan%20geliyorum.%20GLOVAL%20AI%20ile%20sitemi%20g%C3%B6rmek%20istiyorum.`,
    )
  })
})
