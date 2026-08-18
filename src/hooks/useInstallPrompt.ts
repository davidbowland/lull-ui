import { useCallback, useEffect, useRef, useState } from 'react'

import { readMeta, setInstallDismissed } from '@services/storage'

export type InstallMode = 'card' | 'link' | 'none'
// Firefox for Android is a platform of its own here, not a browser detail on top of
// android, because it is the only install route in the app that neither fires
// beforeinstallprompt nor has a Share sheet. Every other Android browser worth naming
// is Chromium and fires the event.
export type InstallPlatform = 'android' | 'desktop' | 'firefox-android' | 'ios'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// This page ships as static HTML and hydrates after load, so on a slow phone the
// browser can fire beforeinstallprompt before any listener exists. An inline script
// in the document head parks the event here; the hook reads it on mount and works the
// same whether it finds one or not.
interface WindowWithDeferredPrompt extends Window {
  __deferredInstallPrompt?: BeforeInstallPromptEvent
}

export interface UseInstallPromptResult {
  dismiss: () => void
  install: () => void
  mode: InstallMode
  platform: InstallPlatform
  reopen: () => void
}

// Every window the browser can run an installed app in. Matching standalone alone
// would let a later manifest change put the installed app back in front of a card
// offering to install the app it is already running.
const INSTALLED_DISPLAY_MODES = '(display-mode: standalone), (display-mode: minimal-ui), (display-mode: fullscreen)'

// iPadOS 13 and later send the desktop Safari user agent verbatim, so the string
// alone reports every iPad as a Mac. Touch points are the only thing left that
// separates the two, and getting it wrong strands iPad completely: Safari fires no
// beforeinstallprompt, so a card gated on that event never appears and the one
// route to installing is never explained.
const detectPlatform = (): InstallPlatform => {
  const agent = window.navigator.userAgent
  if (/iPad|iPhone|iPod/.test(agent)) return 'ios'
  if (/Macintosh/.test(agent) && window.navigator.maxTouchPoints > 1) return 'ios'
  // After the iOS checks, never before. Firefox on iOS is Safari underneath and
  // reports FxiOS, so a bare match on "Firefox" would hand an iPhone a browser menu
  // that does not exist and take away the Share steps that are its only way in.
  if (/Android.*Firefox\//.test(agent)) return 'firefox-android'
  if (/Android/.test(agent)) return 'android'
  return 'desktop'
}

// Already running as an installed app. Chromium handles this by never firing
// beforeinstallprompt, but iOS has no event to withhold, so without this the card
// would keep offering Add to Home Screen to someone already on their home screen.
const isStandalone = (): boolean =>
  window.matchMedia(INSTALLED_DISPLAY_MODES).matches ||
  (window.navigator as Navigator & { standalone?: boolean }).standalone === true

interface ModeInputs {
  isDismissed: boolean
  isOfferable: boolean
  isRunningInstalled: boolean
}

// One discriminant, not two booleans. Handing out isOfferable and isDismissed
// separately invites `isOfferable && !isDismissed`, which deletes the collapsed link
// and leaves iOS -- where this card is the only route to installing -- with nothing
// at all. Dismissing collapses; only an installed app or a platform with no install
// route renders nothing.
const resolveMode = ({ isDismissed, isOfferable, isRunningInstalled }: ModeInputs): InstallMode => {
  if (isRunningInstalled || !isOfferable) return 'none'
  if (isDismissed) return 'link'
  return 'card'
}

export const useInstallPrompt = (): UseInstallPromptResult => {
  // A ref, not state. Two presses in the same tick would both read the same rendered
  // state and show a prompt that can only be shown once; a ref is cleared the instant
  // the first press reads it.
  const deferred = useRef<BeforeInstallPromptEvent | null>(null)
  // Outlives the event on purpose. A browser prompt can be shown once, so the event
  // is dropped the moment it is used; tying the offer to the live event alone would
  // take the collapsed link down with it and end the session with no way back.
  const [wasPromptOffered, setWasPromptOffered] = useState(false)
  // Server-render and the first client render must agree, so every browser fact
  // starts at its neutral value and is corrected on mount.
  const [platform, setPlatform] = useState<InstallPlatform>('desktop')
  const [isDismissed, setIsDismissed] = useState(false)
  const [isRunningInstalled, setIsRunningInstalled] = useState(false)

  useEffect(() => {
    setPlatform(detectPlatform())
    setIsDismissed(readMeta().installDismissed)
    setIsRunningInstalled(isStandalone())

    const hold = (event: BeforeInstallPromptEvent) => {
      deferred.current = event
      setWasPromptOffered(true)
    }
    const capture = (event: Event) => {
      // Hold the event back so the offer arrives inside the card, next to the
      // seven-day strip that shows what installing is actually worth.
      event.preventDefault()
      hold(event as BeforeInstallPromptEvent)
    }
    const installed = () => {
      deferred.current = null
      setIsRunningInstalled(true)
    }

    window.addEventListener('appinstalled', installed)
    window.addEventListener('beforeinstallprompt', capture)

    const stash = window as WindowWithDeferredPrompt
    const early = stash.__deferredInstallPrompt
    if (early !== undefined) {
      hold(early)
      delete stash.__deferredInstallPrompt
    }

    return () => {
      window.removeEventListener('appinstalled', installed)
      window.removeEventListener('beforeinstallprompt', capture)
    }
  }, [])

  const dismiss = useCallback(() => {
    setInstallDismissed(true)
    setIsDismissed(true)
  }, [])

  // Dismissing collapses the card to a text link; it never destroys it. iOS fires
  // no beforeinstallprompt, so the card is the only route to installing there and
  // a one-way door would make it unreachable forever after a stray tap.
  const reopen = useCallback(() => {
    setInstallDismissed(false)
    setIsDismissed(false)
  }, [])

  const install = useCallback((): void => {
    const event = deferred.current
    if (event === null) return
    // A browser prompt is single use: a second prompt() rejects with InvalidStateError
    // and lands in the console as an uncaught DOMException. Dropping the event before
    // showing it means a second press can never reach it.
    deferred.current = null
    void event.prompt().then(
      (choice) => {
        // Turning the browser dialog down collapses the card exactly as Not now does.
        // The event is spent either way, so leaving the card open would leave the
        // player looking at a button that can no longer do anything.
        if (choice.outcome === 'dismissed') dismiss()
      },
      (error: unknown) => {
        console.error('install prompt failed', { error })
        dismiss()
      },
    )
  }, [dismiss])

  return {
    dismiss,
    install,
    mode: resolveMode({
      isDismissed,
      // Neither iOS nor Firefox for Android fires the event, so the manual steps are
      // always on offer there. Gating on the event alone is what left Firefox showing
      // nothing at all: the platform installs web apps, it just never announces it.
      isOfferable: wasPromptOffered || platform === 'ios' || platform === 'firefox-android',
      isRunningInstalled,
    }),
    platform,
    reopen,
  }
}
