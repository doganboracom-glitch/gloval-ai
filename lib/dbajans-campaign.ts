export const DBAJANS_WHATSAPP_NUMBER = '908503084088'

const localNumber = DBAJANS_WHATSAPP_NUMBER.slice(2)

export const DBAJANS_WHATSAPP_DISPLAY = `0${localNumber.slice(0, 3)} ${localNumber.slice(3, 6)} ${localNumber.slice(6, 8)} ${localNumber.slice(8)}`

const message = "Merhaba, DB AJANS'tan geliyorum. GLOVAL AI ile sitemi görmek istiyorum."
const encodedMessage = encodeURIComponent(message).replace(/'/g, '%27')

export const DBAJANS_WHATSAPP_URL = `https://wa.me/${DBAJANS_WHATSAPP_NUMBER}?text=${encodedMessage}`
