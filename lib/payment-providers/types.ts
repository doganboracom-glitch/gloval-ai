import type { ComponentType } from 'react'

/**
 * Provider-independent description of a store-owner payment provider (iyzico
 * today, any other PSP tomorrow). The generic `ProviderSetupAssistant` and the
 * payment-settings window render exclusively from these objects, so adding a
 * provider means adding one config to the registry and nothing else.
 *
 * Everything here is pure data, types or functions: no I/O of its own. The
 * server actions a provider needs are passed in as plain async functions.
 */

export type Lang = 'tr' | 'en'
export type Localized = { tr: string; en: string }

export type ProviderMarker = 'applied' | 'account_opened'

export type ProviderSetupState = { appliedAt: string | null; accountOpenedAt: string | null }

/** Provider-neutral view of the stored keys. Key values never leave the server. */
export type ProviderSettingsView = {
  environment: string
  /** Whether each configured key field has a stored value. */
  keysPresent: Record<string, boolean>
  /** True only after a successful test of the CURRENT keys and environment. */
  tested: boolean
  /** Stored keys exist but cannot be decrypted. */
  unreadable: boolean
  /** Return / webhook address the owner can copy. */
  callbackUrl: string
}

export type ProviderReadinessItem = {
  id: string
  ok: boolean
  problem?: string
  fix: string
}

export type ProviderSetupOverview = {
  readiness: ProviderReadinessItem[]
  /** Public address of the published store, or null while unpublished. */
  siteUrl: string | null
  state: ProviderSetupState
  help: {
    enabled: boolean
    prefill: { name: string; email: string; phone: string }
  }
  settings: ProviderSettingsView
}

export type ProviderEnvironment = { id: string; label: Localized }

export type ProviderKeyField = { key: string; label: Localized }

export type ProviderSaveResult =
  | { ok: true; settings: ProviderSettingsView }
  | { ok: false; error: string }

export type ProviderTestResult =
  | { ok: true; settings: ProviderSettingsView }
  | { ok: false; error: string; settings?: ProviderSettingsView }

export type ProviderHelpInput = { name: string; email: string; phone: string }

export type ProviderSetupConfig = {
  id: string
  name: string

  /** Provider-specific copy; generic UI strings live in the shared components. */
  copy: {
    intro: Localized
    prepareDescription: Localized
    applyDescription: Localized
    applyLabel: Localized
    applyManualLabel: Localized
    keysDescription: Localized
    callbackLabel: Localized
    callbackHint: Localized
  }

  /** Step 1: what a reviewer checks on the live store. */
  readiness: {
    labels: Record<string, Localized>
    problems: Record<string, Localized>
    /** Where an owner fixes an item; `opensDesign` shows the "open Design tab" link. */
    fixes: Record<string, { hint: Localized; opensDesign: boolean }>
  }

  /** Step 2: documents to have at hand and the ways to apply. */
  documents: { key: string; label: Localized }[]
  apply: {
    manualUrl: string
    /** Fast-track application form embedded in the app, when the provider offers one. */
    instant?: {
      useEnabled: (projectId: string) => boolean | undefined
      Form: ComponentType<{ projectId: string; onSubmitted?: () => void }>
    }
  }
  help: {
    submit: (
      projectId: string,
      input: ProviderHelpInput,
      consent: boolean,
    ) => Promise<{ ok: true } | { ok: false; error: string }>
    errors: Record<string, Localized>
  }

  /** Step 3: keys, environment and connection test. */
  keys: {
    fields: ProviderKeyField[]
    environments: ProviderEnvironment[]
    /** Environment id that means real money; hides the fast-track form once keyed and tested. */
    liveEnvironment: string
    save: (
      projectId: string,
      input: { keys: Record<string, string>; environment: string },
    ) => Promise<ProviderSaveResult>
    test: (projectId: string) => Promise<ProviderTestResult>
    errors: Record<string, Localized>
  }

  loadOverview: (projectId: string) => Promise<ProviderSetupOverview>
  setMarker: (
    projectId: string,
    marker: ProviderMarker,
    value: boolean,
  ) => Promise<{ ok: true; state: ProviderSetupState } | { ok: false }>
}

export type ProviderSetupStatus = 'setup_required' | 'not_ready' | 'applied' | 'connected'

export function isReadinessGreen(items: ProviderReadinessItem[]): boolean {
  return items.every((item) => item.ok)
}

/**
 * The fast-track (Instant) form is shown unless a LIVE key is saved and tested.
 * No key at all, or only a sandbox key, still needs a real merchant account.
 */
export function shouldShowInstantForm(
  settings: ProviderSettingsView,
  liveEnvironment: string,
  fieldKeys: string[],
): boolean {
  const allKeysPresent = fieldKeys.every((key) => settings.keysPresent[key] === true)
  const liveAndTested = allKeysPresent && settings.environment === liveEnvironment && settings.tested
  return !liveAndTested
}

/**
 * The help request form starts collapsed while the Instant pre-application form
 * is on screen (so the two forms don't compete), and stays open otherwise.
 */
export function isHelpFormOpen(instantFormVisible: boolean, userOpened: boolean): boolean {
  return !instantFormVisible || userOpened
}

/** One-line summary shown outside the settings window. */
export function deriveSetupStatus(overview: ProviderSetupOverview): ProviderSetupStatus {
  if (overview.settings.tested) return 'connected'
  if (overview.state.appliedAt || overview.state.accountOpenedAt) return 'applied'
  if (!isReadinessGreen(overview.readiness)) return 'not_ready'
  return 'setup_required'
}
