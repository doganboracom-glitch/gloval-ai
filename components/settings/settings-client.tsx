'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Mail, Pencil, TriangleAlert, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getAuthCallbackUrl } from '@/lib/auth-redirect'
import { deleteOwnAccount, updateOwnProfile } from '@/lib/account'
import { useLanguage } from '@/components/language-provider'
import { LanguageSwitcher } from '@/components/language-switcher'
import { Button } from '@/components/ui/button'
import { BrandLogo } from '@/components/brand-logo'
import { getBillingProfileCopy } from '@/lib/billing-profile-copy'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function SettingsClient({
  userEmail,
  fullName,
}: {
  userEmail: string
  fullName: string
}) {
  const { t, lang } = useLanguage()
  const billingProfileCopy = getBillingProfileCopy(lang)
  const router = useRouter()

  // Profile (display name) modal
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [name, setName] = useState(fullName)
  const [nameInput, setNameInput] = useState(fullName)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState(false)

  // Email change modal
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [isSendingEmail, setIsSendingEmail] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailSuccess, setEmailSuccess] = useState(false)

  // Delete-account wizard (2 steps: warning -> typed confirmation)
  const [showConfirm, setShowConfirm] = useState(false)
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1)
  const [confirmValue, setConfirmValue] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(false)

  const canConfirm = confirmValue.trim().toLowerCase() === userEmail.toLowerCase()
  const anyModalOpen = showProfileModal || showEmailModal || showConfirm

  useEffect(() => {
    if (!anyModalOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isDeleting && !isSavingProfile && !isSendingEmail) {
        setShowProfileModal(false)
        setShowEmailModal(false)
        setShowConfirm(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [anyModalOpen, isDeleting, isSavingProfile, isSendingEmail])

  function openProfileModal() {
    setNameInput(name)
    setProfileError(false)
    setProfileSuccess(false)
    setShowProfileModal(true)
  }

  async function handleSaveProfile() {
    const trimmed = nameInput.trim()
    if (!trimmed || isSavingProfile) return
    setIsSavingProfile(true)
    setProfileError(false)
    const result = await updateOwnProfile({ fullName: trimmed })
    setIsSavingProfile(false)
    if (!result.ok) {
      setProfileError(true)
      return
    }
    setName(trimmed)
    setProfileSuccess(true)
    setTimeout(() => setShowProfileModal(false), 900)
  }

  function openEmailModal() {
    setNewEmail('')
    setEmailError(null)
    setEmailSuccess(false)
    setShowEmailModal(true)
  }

  async function handleSendEmailChange() {
    if (isSendingEmail) return
    const trimmed = newEmail.trim()
    if (!EMAIL_PATTERN.test(trimmed)) {
      setEmailError(t.settings.emailChangeInvalid)
      return
    }
    if (trimmed.toLowerCase() === userEmail.toLowerCase()) {
      setEmailError(t.settings.emailChangeSameError)
      return
    }
    setIsSendingEmail(true)
    setEmailError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser(
      { email: trimmed },
      { emailRedirectTo: getAuthCallbackUrl('/auth/callback?next=/settings') },
    )
    setIsSendingEmail(false)
    if (error) {
      setEmailError(t.settings.emailChangeError)
      return
    }
    setEmailSuccess(true)
  }

  function openConfirm() {
    setDeleteStep(1)
    setConfirmValue('')
    setDeleteError(false)
    setShowConfirm(true)
  }

  async function handleDelete() {
    if (!canConfirm || isDeleting) return
    setIsDeleting(true)
    setDeleteError(false)
    const result = await deleteOwnAccount()
    if (!result.ok) {
      setIsDeleting(false)
      setDeleteError(true)
      return
    }
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <div className="relative min-h-svh">
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-40" aria-hidden />

      <div className="relative mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" aria-label="GLOVAL AI" className="flex shrink-0 items-center">
            <BrandLogo priority />
          </Link>
          <LanguageSwitcher />
        </header>

        <Link
          href="/dashboard"
          className="mt-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t.settings.backToDashboard}
        </Link>

        <div className="mt-4">
          <h1 className="font-sans text-2xl font-semibold text-balance text-foreground sm:text-3xl">
            {t.settings.title}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{t.settings.subtitle}</p>
        </div>

        <Link
          href="/billing#fatura-bilgileri"
          className="mt-5 inline-flex items-center rounded-lg border border-brand/40 bg-brand/10 px-3 py-2 text-sm font-medium text-brand transition-colors hover:bg-brand/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {billingProfileCopy.accountLink}
        </Link>

        <section className="mt-8 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-foreground">{t.settings.profileTitle}</h2>
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={openProfileModal}>
              <Pencil className="size-3.5" />
              {t.settings.profileEdit}
            </Button>
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <User className="size-4" />
            <span>{name || t.settings.profileNameEmpty}</span>
          </div>
        </section>

        <section className="mt-6 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-foreground">{t.settings.accountTitle}</h2>
            <Button variant="ghost" size="sm" onClick={openEmailModal}>
              {t.settings.emailChangeButton}
            </Button>
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="size-4" />
            <span>{userEmail}</span>
          </div>
        </section>

        <section className="mt-6 rounded-xl border border-destructive/40 bg-destructive/5 p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <TriangleAlert className="size-4" />
            {t.settings.dangerZoneTitle}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t.settings.dangerZoneBody}
          </p>
          <Button variant="destructive" size="sm" className="mt-4" onClick={openConfirm}>
            {t.settings.deleteAccount}
          </Button>
        </section>
      </div>

      {showProfileModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSavingProfile) setShowProfileModal(false)
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <h2 id="profile-modal-title" className="text-lg font-semibold text-foreground">
              {t.settings.profileModalTitle}
            </h2>

            <label htmlFor="profile-name-input" className="mt-4 block text-sm text-foreground">
              {t.settings.profileModalNameLabel}
            </label>
            <input
              id="profile-name-input"
              type="text"
              autoComplete="name"
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder={t.settings.profileModalNamePlaceholder}
              disabled={isSavingProfile}
              className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />

            {profileError && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {t.settings.profileUpdateError}
              </p>
            )}
            {profileSuccess && (
              <p role="status" className="mt-3 text-sm text-primary">
                {t.settings.profileUpdateSuccess}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowProfileModal(false)}
                disabled={isSavingProfile}
              >
                {t.settings.profileModalCancel}
              </Button>
              <Button
                size="sm"
                onClick={handleSaveProfile}
                disabled={!nameInput.trim() || isSavingProfile}
                className="gap-1.5"
              >
                {isSavingProfile && <Loader2 className="size-4 animate-spin" />}
                {isSavingProfile ? t.settings.profileSaving : t.settings.profileModalSave}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showEmailModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="email-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSendingEmail) setShowEmailModal(false)
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <h2 id="email-modal-title" className="text-lg font-semibold text-foreground">
              {t.settings.emailModalTitle}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t.settings.emailModalBody}
            </p>

            {!emailSuccess && (
              <>
                <label htmlFor="email-new-input" className="mt-4 block text-sm text-foreground">
                  {t.settings.emailModalLabel}
                </label>
                <input
                  id="email-new-input"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder={t.settings.emailModalPlaceholder}
                  disabled={isSendingEmail}
                  className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                />
              </>
            )}

            {emailError && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {emailError}
              </p>
            )}
            {emailSuccess && (
              <p role="status" className="mt-3 text-sm text-primary">
                {t.settings.emailChangeSuccess}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowEmailModal(false)}>
                {emailSuccess ? t.settings.deleteModalCancel : t.settings.emailModalCancel}
              </Button>
              {!emailSuccess && (
                <Button
                  size="sm"
                  onClick={handleSendEmailChange}
                  disabled={!newEmail.trim() || isSendingEmail}
                  className="gap-1.5"
                >
                  {isSendingEmail && <Loader2 className="size-4 animate-spin" />}
                  {isSendingEmail ? t.settings.emailSending : t.settings.emailModalSend}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeleting) setShowConfirm(false)
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            {deleteStep === 1 ? (
              <>
                <h2 id="delete-account-title" className="text-lg font-semibold text-foreground">
                  {t.settings.deleteModalTitle}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t.settings.deleteModalBody}
                </p>

                <div className="mt-6 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setShowConfirm(false)}>
                    {t.settings.deleteModalCancel}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteStep(2)}
                  >
                    {t.settings.deleteStepContinue}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <h2 id="delete-account-title" className="text-lg font-semibold text-foreground">
                  {t.settings.deleteStep2Title}
                </h2>

                <label htmlFor="delete-confirm-input" className="mt-4 block text-sm text-foreground">
                  {t.settings.deleteModalConfirmLabel.replace('{email}', userEmail)}
                </label>
                <input
                  id="delete-confirm-input"
                  type="text"
                  autoComplete="off"
                  autoFocus
                  value={confirmValue}
                  onChange={(e) => setConfirmValue(e.target.value)}
                  placeholder={t.settings.deleteModalConfirmPlaceholder}
                  disabled={isDeleting}
                  className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-destructive"
                />

                {deleteError && (
                  <p role="alert" className="mt-3 text-sm text-destructive">
                    {t.settings.deleteError}
                  </p>
                )}

                <div className="mt-6 flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteStep(1)}
                    disabled={isDeleting}
                  >
                    {t.settings.deleteStepBack}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDelete}
                    disabled={!canConfirm || isDeleting}
                    className="gap-1.5"
                  >
                    {isDeleting && <Loader2 className="size-4 animate-spin" />}
                    {isDeleting ? t.settings.deleting : t.settings.deleteModalConfirm}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
