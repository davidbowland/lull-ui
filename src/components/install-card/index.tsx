import React, { useEffect, useRef } from 'react'

import { Button } from '@components/button'
import { InstallMode, InstallPlatform } from '@hooks/useInstallPrompt'

export interface InstallCardProps {
  mode: InstallMode
  onDismiss: () => void
  onInstall: () => void
  onReopen: () => void
  platform: InstallPlatform
}

// A notice in the signage grammar: the plate carries a rule border rather than the
// double bezel of an Enclosure. That technique is spent on the two plates that carry
// real weight -- the date plate and the goal plate -- and a third one here would turn it
// into background noise.
const CARD = 'rounded-[var(--lull-r-lg)] border border-[var(--lull-rule)] bg-[var(--lull-plate)] p-[var(--lull-s4)]'

// The category label a sign wears above its message. It is read, not hidden, because the
// word is what tells a listener this is the shelf speaking rather than the day's puzzles.
const EYEBROW = 'text-[11px] font-semibold tracking-[0.14em] text-[var(--lull-muted)] uppercase'

const HEADING = 'lull-sign mt-[var(--lull-s1)] text-xl text-[var(--lull-ink)]'

const BODY = 'mt-[var(--lull-s2)] text-[var(--lull-muted)]'

const STEP_LIST = 'mt-[var(--lull-s3)] list-decimal pl-[var(--lull-s5)] text-[var(--lull-muted)]'

const ACTIONS = 'mt-[var(--lull-s4)] flex flex-wrap items-center gap-[var(--lull-s3)]'

// The nub inside the primary control needs something to hold, and the chevron is the same
// glyph the spine uses between crumbs, so forward keeps meaning the same thing everywhere.
// Button hides the nub from the accessible name, so nobody hears "Install right arrow".
const CHEVRON = (
  <svg fill="none" height="10" viewBox="0 0 6 10" width="6">
    <path d="m1 1 4 4-4 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
  </svg>
)

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
  // Button takes no ref, so the wrapper is what gives us a handle on the control inside
  // it -- the same move the hint bar makes for the same reason.
  const collapsedRef = useRef<HTMLSpanElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const installRef = useRef<HTMLSpanElement>(null)
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
    if (previous === 'card' && mode === 'link') collapsedRef.current?.querySelector('button')?.focus()
    // iOS and Firefox for Android offer steps instead of a button, so there the card
    // announces itself by its title rather than dropping focus back onto <body>.
    if (previous === 'link' && mode === 'card')
      (installRef.current?.querySelector('button') ?? headingRef.current)?.focus()
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
      // The collapsed offer is quiet rather than filled: the accent is the shelf's one
      // loud surface, and spending it on a link the player has already turned down would
      // make the dismissal look like it never landed.
      <span ref={collapsedRef}>
        <Button aria-expanded={false} onClick={onReopen} variant="quiet">
          {offerLabel}
        </Button>
      </span>
    )
  }

  return (
    <div className={CARD}>
      <p className={EYEBROW}>Notice</p>
      {/* THE PROMISE NOW MATCHES THE PRODUCT, and the words it replaced were flagged as
          overstated in this spot rather than quietly reworded, because rewriting a user-facing
          promise is a UX decision and not a side effect of a hook change. This is that decision,
          taken.
          `Have tomorrow ready` and `each day's puzzles are waiting on your phone before you
          open it` both claimed a prefetch that does not happen: usePrefetch asks for exactly one
          date -- today's, local -- installed or not, nothing arrives before the app is opened,
          and installing changes nothing at all about what is fetched. A player who installed on
          the strength of that sentence and opened Lull on a plane the next morning found an
          empty shelf and a promise broken.
          What installing actually buys is a launcher icon, a standalone window, and today's pack
          surviving a dead connection once the app has been opened that day. Both sentences below
          say that and nothing more. The precondition is IN the copy -- `open it once a day` --
          because it is the whole of what the offer is worth and burying it is how the last
          version went wrong. */}
      <h3 className={HEADING} ref={headingRef} tabIndex={-1}>
        Put Lull on your home screen
      </h3>
      <p className={BODY}>
        It opens like an app. Open it once a day and that day’s puzzles keep working with no connection.
      </p>
      {steps !== undefined && (
        // A button here would be a promise the browser cannot keep: neither platform
        // that lands in this branch has an install event to replay.
        <ol className={STEP_LIST}>
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}
      <div className={ACTIONS}>
        {steps === undefined && (
          <span ref={installRef}>
            <Button onClick={onInstall} trailing={CHEVRON} variant="primary">
              {offerLabel}
            </Button>
          </span>
        )}
        {/* Quiet, and therefore borderless: a bordered second control would read as a
            second offer of equal weight beside the one the card exists to present. */}
        <Button onClick={onDismiss} variant="quiet">
          Not now
        </Button>
      </div>
    </div>
  )
}
