import React, { useEffect, useRef } from 'react'

import { InstallMode, InstallPlatform } from '@hooks/useInstallPrompt'

export interface InstallCardProps {
  mode: InstallMode
  onDismiss: () => void
  onInstall: () => void
  onReopen: () => void
  platform: InstallPlatform
}

// The quiet action carries no border, so it cannot read as a second offer of equal
// weight beside the one control the card exists to present.
const QUIET_ACTION = 'min-h-11 cursor-pointer text-[var(--lull-ink-muted)] hover:text-[var(--lull-ink)]'

const OFFER =
  'mb-2 min-h-11 w-full cursor-pointer rounded-full bg-[var(--lull-accent)] px-4 text-[var(--lull-accent-ink)]'

// Safari has no install API, and Firefox for Android fires no beforeinstallprompt. On
// both, the gesture happens in the browser's own chrome, where there is no button to
// put, so the only honest offer is to name the steps.
//
// Neither list claims a position. Share sits at the bottom on iPhone and the top on
// iPad, and Firefox's menu moves with the toolbar setting. Naming Safari matters:
// Chrome, Firefox and the browsers inside messaging apps all report themselves as iOS,
// and none of them can add anything to a home screen.
//
// Install, named first and named exactly. Firefox lists Add to Home screen as a
// SEPARATE item that makes an ordinary shortcut -- it opens in a tab and Android never
// counts it as installed -- so a step that said only "add to home screen" would send the
// reader to the one item that cannot work. Older Firefox called the install item Add to
// Home screen itself, which is why the second name still has to appear.
const STEPS: Partial<Record<InstallPlatform, string[]>> = {
  'firefox-android': ['Open the Firefox menu.', 'Tap Install. Older versions call it Add to Home screen.'],
  ios: ['Open this page in Safari.', 'Tap Share, then Add to Home Screen.'],
}

export const InstallCard = ({ mode, onDismiss, onInstall, onReopen, platform }: InstallCardProps): React.ReactNode => {
  const collapsedRef = useRef<HTMLButtonElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const installRef = useRef<HTMLButtonElement>(null)
  const previousMode = useRef<InstallMode>(mode)

  // Collapsing and reopening unmount the control the keyboard was sitting on. Focus then
  // falls to <body>, the next Tab restarts at the top of the page, and a screen reader
  // announces nothing -- so the card reads as gone rather than collapsed (WCAG 2.4.3).
  // Only the two disclosure transitions move focus: a card that appears because the
  // browser finally fired its event must not snatch focus from whatever the reader is
  // doing.
  useEffect(() => {
    const previous = previousMode.current
    previousMode.current = mode
    if (previous === 'card' && mode === 'link') collapsedRef.current?.focus()
    // iOS and Firefox for Android offer steps instead of a button, so there the card
    // announces itself by its title rather than dropping focus back onto <body>.
    if (previous === 'link' && mode === 'card') (installRef.current ?? headingRef.current)?.focus()
  }, [mode])

  // A desktop has no home screen, so one label cannot serve both. Both branches read
  // from the same expression: an offer that returned under a second name would look like
  // a different offer.
  const offerLabel = platform === 'android' || platform === 'firefox-android' ? 'Add to home screen' : 'Install'
  const steps = STEPS[platform]

  if (mode === 'none') return null

  // Dismissing collapses the card, it never removes it. iOS has no beforeinstallprompt
  // to re-fire, so losing this link would strand the reader with no route to installing
  // at all.
  if (mode === 'link') {
    return (
      <button aria-expanded={false} className={QUIET_ACTION} onClick={onReopen} ref={collapsedRef} type="button">
        {offerLabel}
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-[var(--lull-border)] p-4">
      <h3 className="mb-2 text-[var(--lull-ink)]" ref={headingRef} tabIndex={-1}>
        Have tomorrow ready
      </h3>
      {/* Says the benefit this slice actually delivers. The previous copy promised "the
          last seven days stay too", and installing does download seven days -- but the
          shelf renders one pack and there is no archive route, so a player could never
          reach them. It also framed retention as "only the days you open", when pruning
          is by age and identical whether or not you install. Restore a seven-day claim
          when the archive lands. */}
      <p className="mb-3 text-[var(--lull-ink-muted)]">
        Install Lull and each day’s puzzles are waiting on your phone before you open it — no connection needed.
      </p>
      {steps === undefined ? (
        <button className={OFFER} onClick={onInstall} ref={installRef} type="button">
          {offerLabel}
        </button>
      ) : (
        // A button here would be a promise the browser cannot keep: neither platform
        // that lands in this branch has an install event to replay.
        <ol className="mb-3 list-decimal pl-5 text-[var(--lull-ink-muted)]">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}
      <button className={QUIET_ACTION} onClick={onDismiss} type="button">
        Not now
      </button>
    </div>
  )
}
