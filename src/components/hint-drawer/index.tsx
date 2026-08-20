import React, { useId, useState } from 'react'

import { readHints, writeHints } from '@services/storage'
import { HintLadder } from '@types'

export interface HintDrawerProps {
  // Drops the visible "Hints" heading and tightens the stack, for a shell that has no vertical
  // space to give -- Cryptogram docks a 26-key pad to the bottom of the viewport and the phrase cap
  // between them is 98px at a 320 viewport. The heading plus its gap is 40px of that, spent on a
  // word the reveal button underneath already says.
  //
  // Nothing accessible is lost: the section keeps aria-label="Hints", so the region is still named
  // and still reachable by landmark. Absent means today's drawer, so Missing Vowels is untouched.
  compact?: boolean
  hints: HintLadder
  puzzleId: string
}

// aria-disabled variants, not disabled:, and the same set the Go Figure tiles use: the button
// stays genuinely enabled so that pressing the last rung does not blur it, which means the
// disabled: variants would never match and a spent control would look identical to a live one.
const REVEAL =
  'min-h-11 cursor-pointer rounded-full border border-[var(--lull-border)] px-4 text-[var(--lull-ink)] ' +
  'aria-disabled:cursor-default aria-disabled:opacity-40'

// Borderless, like the install card's quiet action, and for the same reason: a disclosure that
// carried the same border as the reveal button would read as a second offer of equal weight beside
// the one control this drawer exists to present.
const TOGGLE = 'min-h-11 cursor-pointer text-[var(--lull-ink-muted)] hover:text-[var(--lull-ink)]'

const LIST = 'flex list-decimal flex-col gap-2 pl-6 text-[var(--lull-ink)]'
// COMPACT ONLY. A max-height binds whenever the content is taller than it, not only when the
// surrounding layout is short -- that is what flex-basis and min-height do. Left ungated, this bound
// applied to Missing Vowels too: at a 568x320 landscape viewport 40vh is 128px, three prose rungs
// clear that easily, and the ladder became an internally scrolling box inside an already scrolling
// page. Missing Vowels is supposed to be untouched by the docked layout, so the bound goes on with
// it and comes off with it.
const BOUNDED_LIST = `${LIST} max-h-[40vh] overflow-y-auto`

/**
 * The ladder, rendered by the SHELL and never by a game component.
 *
 * Missing Vowels, Cryptogram and Phrazle are one phrase in three costumes, so a hint about what the
 * phrase MEANS serves all three -- and a board that never learns hints exist cannot leak one. Every
 * future phrase type gets this for free.
 *
 * No time gate, no penalty, no cost. Rungs open in order because a ladder is only meaningful in
 * order. On a solved puzzle it renders exactly as it always does: the answer is already on screen,
 * so there is nothing left to protect.
 *
 * Revealed hints fold away because the drawer shares vertical budget with the board above it. Three
 * open rungs are ~188px, and Cryptogram pins the phrase to the top and docks a 26-key keypad to the
 * bottom with ~326px between them -- so a permanently open ladder drops the phrase from four rows of
 * letters to two, and asking for help shrinks the thing you are trying to solve.
 */
export const HintDrawer = ({ compact = false, hints, puzzleId }: HintDrawerProps): React.ReactNode => {
  // Read once, at mount. The frame keys the view on the puzzle id, so a different puzzle is a
  // different component rather than a prop change, and re-reading storage on every render would
  // hand this component back its own writes.
  const [revealed, setRevealed] = useState(() => readHints(puzzleId, hints.length))

  // Folded is VIEW state and nothing else. `lull:hints:<puzzleId>` stays the revealed count and only
  // the revealed count -- collapsing writes nothing, and a folded drawer is not an unrevealed one.
  //
  // Deliberately not persisted, and deliberately folded at mount rather than restored:
  //
  //  - Persisting it would need a second key under the `lull:` namespace, which means another
  //    prefix scan, another pattern filter, another self-heal on a malformed value and another
  //    branch in the prefetch pruner -- the whole storage contract, bought for a fold.
  //  - The only moment the choice is felt is the moment the board mounts, and that is exactly the
  //    moment the phrase needs the room. A player returning to a puzzle has already read the hints
  //    they opened; re-opening the ladder for them spends the vertical budget Cryptogram needs on
  //    text they have seen.
  //  - Folded is recoverable in one tap and says how many hints are waiting, so the default costs a
  //    returning player nothing they cannot get back instantly. The opposite default costs them
  //    half the board every single time.
  const [isOpen, setIsOpen] = useState(false)
  const listId = useId()

  const isSpent = revealed >= hints.length

  const reveal = (): void => {
    // The control is aria-disabled rather than unmounted or `disabled`, so it can still be clicked.
    // The guard is what makes the label honest.
    if (isSpent) {
      return
    }
    const next = revealed + 1
    setRevealed(next)
    writeHints(puzzleId, next)
    // A reveal that landed inside a folded list would look like a button that did nothing. Asking
    // for a hint is asking to see it.
    setIsOpen(true)
  }

  const toggle = (): void => setIsOpen(!isOpen)

  return (
    <section aria-label="Hints" className={`flex min-h-0 flex-col ${compact ? 'gap-2' : 'gap-3'}`}>
      {!compact && <h2 className="text-lg text-[var(--lull-ink)]">Hints</h2>}

      {/* Named with its count, so folded still says what is in there. "Show 2 revealed hints" next
          to "Reveal hint 3 of 3" cannot be mistaken for an offer of new ones. Not `disabled` in any
          state and never unmounted while the player is toggling it: a browser blurs a disabled
          element, focus lands on <body>, and the next Tab restarts at the top of the page. */}
      {revealed > 0 && (
        <div>
          <button aria-controls={listId} aria-expanded={isOpen} className={TOGGLE} onClick={toggle} type="button">
            {isOpen ? 'Hide' : 'Show'} {revealed} revealed hint{revealed === 1 ? '' : 's'}
          </button>
        </div>
      )}

      {/* The live region wraps the list rather than duplicating its newest entry, so a screen
          reader announces only the rung that just appeared. `aria-atomic="false"` is what makes
          that true and is not optional: role="status" carries an implicit aria-atomic="true" in
          ARIA 1.2, and under it revealing rung 3 re-reads rungs 1 and 2 with it. Mounted empty from
          the start: a role="status" element inserted with its content already in it is routinely
          missed by NVDA and JAWS, which announce changes inside a region they are already watching.
          The region itself never folds -- it has to stay mounted and watched for that to hold.

          The fold is an undecorated wrapper, NOT the <ol>. Tailwind v4's preflight would in fact
          hide the list either way -- it ships `[hidden]:where(:not([hidden="until-found"]))` with
          `display: none !important`, which outranks `flex` on the same element. The wrapper is here
          so the fold does not rest on that: preflight is a dependency this component would
          otherwise silently acquire, and a base-layer reset is not where a correctness guarantee
          belongs. The wrapper carries no display utility, so the attribute stands on its own. */}
      <div aria-atomic="false" role="status">
        <div hidden={!isOpen} id={listId}>
          {/* Bounded and scrollable under the docked layout, and nowhere else. Cryptogram pins the
              phrase to the top and docks a 26-key pad to the bottom, leaving a phrase cap of 98px
              at a 320 viewport against a hard floor of 96px -- so three open rungs would push the
              cap under its floor. The list gives up the space instead; the keypad never does.

              tabIndex travels WITH the bound and is not decoration. Every rung is plain text, so a
              scrollable list here has nothing focusable in it, and a scrollable region with no
              focusable descendant must be focusable itself or a keyboard user cannot scroll to the
              rungs below the fold (axe scrollable-region-focusable). jest-axe cannot catch that
              pairing coming apart: jsdom lays nothing out, scrollHeight is always 0, and the rule
              never fires -- so the tab order is asserted directly in the suite instead. */}
          <ol className={compact ? BOUNDED_LIST : LIST} tabIndex={compact ? 0 : undefined}>
            {hints.slice(0, revealed).map((hint) => (
              <li key={hint}>{hint}</li>
            ))}
          </ol>
        </div>
      </div>

      {/* Never unmounted and never `disabled`, for the reason the toggle above carries: the player
          presses this with focus on it, and both a removed element and a disabled one drop focus to
          <body>, so the next Tab restarts at the top of the page. Spending the last rung leaves it
          in place, aria-disabled, saying so -- and `reveal` returns early, so a tap does nothing. */}
      <div>
        <button aria-disabled={isSpent} className={REVEAL} onClick={reveal} type="button">
          {isSpent ? 'All hints revealed' : `Reveal hint ${revealed + 1} of ${hints.length}`}
        </button>
      </div>
    </section>
  )
}
