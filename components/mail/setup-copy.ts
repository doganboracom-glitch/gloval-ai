export type MailSetupLang = 'tr' | 'en'

export const mailSetupCopy = {
  tr: {
    title: 'E-posta uygulamanıza ekleyin', intro: 'Telefonunuzda veya bilgisayarınızda kullanmak için aşağıdaki ayarları girin.', username: 'Kullanıcı adı', password: 'Şifre', passwordValue: 'Posta kutusu şifreniz', incoming: 'Gelen posta (IMAP)', outgoing: 'Giden posta (SMTP)', alternative: 'Alternatif: 587 / STARTTLS', webmail: 'Webmail', copy: 'Kopyala', copied: 'Kopyalandı', helpTitle: 'Giriş yapamıyorum', help: 'Kullanıcı adı tam e-posta adresiniz olmalıdır. Şifrenizi GLOVAL panelinizdeki Kurumsal E-posta sayfasından değiştirebilirsiniz. Yardım için destek talebi oluşturabilirsiniz.', android: 'Android (Gmail uygulaması)', androidSteps: ['Gmail → profil simgesi → Başka bir hesap ekle → Diğer.', 'Adresinizi yazın, Kişisel (IMAP) seçin ve posta kutusu şifrenizi girin.', 'Gelen ve giden sunucu ayarlarını yukarıdaki gibi girip kaydedin.'], iphone: 'iPhone / iPad (Mail)', iphoneSteps: ['Ayarlar → Mail → Hesaplar → Hesap Ekle → Diğer → Mail Hesabı Ekle.', 'Adınızı, adresinizi ve posta kutusu şifrenizi yazıp İleri’ye dokunun.', 'IMAP seçin; gelen ve giden sunucu ayarlarını girip Kaydet’e dokunun.'], outlook: 'Outlook (bilgisayar)', outlookSteps: ['Dosya → Hesap Ekle’ye gidin ve adresinizi yazın.', 'Gelişmiş seçenekler → Hesabımı el ile ayarlamama izin ver → IMAP seçin.', 'Gelen ve giden sunucu ayarlarını, ardından posta kutusu şifrenizi girin.'], browser: 'Tarayıcıdan (kurulum gerekmez)', browserText: 'Webmail adresine gidin; kullanıcı adı olarak tam adresinizi ve posta kutusu şifrenizi kullanın.'
  },
  en: {
    title: 'Add it to your email app', intro: 'Use the settings below to use your mailbox on a phone or computer.', username: 'Username', password: 'Password', passwordValue: 'Your mailbox password', incoming: 'Incoming mail (IMAP)', outgoing: 'Outgoing mail (SMTP)', alternative: 'Alternative: 587 / STARTTLS', webmail: 'Webmail', copy: 'Copy', copied: 'Copied', helpTitle: 'Cannot sign in?', help: 'Your username must be your full email address. You can change your password from the Business Email page in your GLOVAL dashboard. You can also open a support ticket.', android: 'Android (Gmail app)', androidSteps: ['Gmail → profile icon → Add another account → Other.', 'Enter your address, choose Personal (IMAP), and enter your mailbox password.', 'Enter the incoming and outgoing server settings above, then save.'], iphone: 'iPhone / iPad (Mail)', iphoneSteps: ['Settings → Mail → Accounts → Add Account → Other → Add Mail Account.', 'Enter your name, address, and mailbox password, then tap Next.', 'Choose IMAP, enter the incoming and outgoing server settings, then tap Save.'], outlook: 'Outlook (desktop)', outlookSteps: ['File → Add Account, then enter your address.', 'Advanced options → Let me set up my account manually → choose IMAP.', 'Enter the incoming and outgoing server settings and your mailbox password.'], browser: 'In your browser (no setup)', browserText: 'Go to webmail and use your full address and mailbox password.'
  }
} as const

export function getMailSetupCopy(lang: string) { return mailSetupCopy[lang === 'tr' ? 'tr' : 'en'] }

export function renderMailSetupText(lang: string, address: string, webmail: string, host: string) {
  const c = getMailSetupCopy(lang)
  return `${c.title}\n\n${c.browser}: ${webmail}\n${c.browserText}\n\n${c.username}: ${address}\n${c.password}: ${c.passwordValue}\n${c.incoming}: ${host}, 993, SSL/TLS\n${c.outgoing}: ${host}, 465, SSL/TLS (${c.alternative})\n\n${c.android}:\n${c.androidSteps.join('\n')}\n\n${c.iphone}:\n${c.iphoneSteps.join('\n')}\n\n${c.outlook}:\n${c.outlookSteps.join('\n')}\n\n${c.helpTitle}: ${c.help}\nGLOVAL AI` }

export function escapeHtml(value: string) { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;') }

export function renderMailSetupHtml(lang: string, address: string, webmail: string, host: string) {
  const c = getMailSetupCopy(lang); const e = escapeHtml
  const steps = (items: readonly string[]) => `<ol>${items.map((s) => `<li>${e(s)}</li>`).join('')}</ol>`
  return `<h1>${e(c.title)}</h1><p>${e(c.browser)}: <a href="${e(webmail)}">${e(webmail)}</a><br/>${e(c.browserText)}</p><p><strong>${e(c.username)}:</strong> ${e(address)}<br/><strong>${e(c.password)}:</strong> ${e(c.passwordValue)}<br/><strong>${e(c.incoming)}:</strong> ${e(host)}, 993, SSL/TLS<br/><strong>${e(c.outgoing)}:</strong> ${e(host)}, 465, SSL/TLS (${e(c.alternative)})</p><h2>${e(c.android)}</h2>${steps(c.androidSteps)}<h2>${e(c.iphone)}</h2>${steps(c.iphoneSteps)}<h2>${e(c.outlook)}</h2>${steps(c.outlookSteps)}<h2>${e(c.helpTitle)}</h2><p>${e(c.help)}</p><p>GLOVAL AI</p>`
} 
