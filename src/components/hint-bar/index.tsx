import React, { useId, useRef, useState } from 'react'

import { Button } from '@components/button'
import { readHints, writeHints } from '@services/storage'
import { HintLadder } from '@types'

export interface HintBarProps {
  hints: HintLadder
  puzzleId: string
  // `docked` is the shell's own band between the board and the instrument, so it is a fixed strip
  // that neither gives nor takes a pixel. `inline` is for the tile bench, which has no band of its
  // own and sets the bar inside its own column.
  variant?: 'docked' | 'inline'
}

// The bar's footprint, and the only thing the variant changes. `lull-hintbar` is the band order the
// stylesheet declares, so the bar takes its place in the screen column by naming itself rather than
// by whatever wraps it.
const VARIANT = {
  docked:
    'lull-hintbar h-[60px] shrink-0 border-t border-[var(--lull-hair)] bg-[var(--lull-ground)] ' +
    'pr-[var(--lull-gutter-right)] pl-[var(--lull-gutter-left)]',
  inline: 'h-auto px-[var(--lull-s4)] py-[var(--lull-s2)]',
} as const

// Anchored to the TOP edge of the bar and taken out of flow, which is the whole point: the
// instrument below is a sibling in the same flex column, and anything that grew inside that column
// would push it down. Nothing here can, because nothing here occupies flow at all.
//
// Inset by the GUTTER, not by `inset-x-0`, and the difference arrived with the layout. An absolutely
// positioned box resolves its offsets against the padding box of its positioned ancestor -- which is
// this bar, and the bar now carries the page gutter itself rather than inheriting it from a padded
// column. Under `inset-x-0` a rounded, bordered, shadowed card had its corners cut off flat by the
// screen edge, and in landscape on a notched phone it ran under the cutout, since the instrument is
// the only band that re-applies env(safe-area-inset-*).
//
// The height bound stops the sheet short of both the instrument and the top of the screen, so a
// wordy ladder cannot be drawn off the top of the viewport where no scrollbar can bring it back.
//
// CLAMPED, with a floor, and the floor is the whole fix. The bound alone is
// 100dvh - seam - bar - clearance, which is fine in portrait and collapses in landscape: at a
// 390dvh phone it computes to 14px, and at 320dvh it goes negative. Against the sheet's own 32px
// of padding that leaves nothing at all -- so opening a hint relabelled the button, moved focus,
// and displayed no text, inside a zero-height overflow-y-auto box that touch cannot scroll. A
// component built to protect the seam became the one thing on the bench that silently did nothing.
//
// clamp() with a 140px floor means the sheet is always at least readable. Where the viewport
// genuinely cannot spare that, the frame's column has already switched from clipping to scrolling
// -- see puzzle-frame -- so the overflow has somewhere to go.
const SHEET =
  'absolute right-[var(--lull-gutter-right)] bottom-full left-[var(--lull-gutter-left)] mb-[var(--lull-s2)] flex ' +
  'max-h-[clamp(140px,calc(100dvh-var(--lull-seam)-60px-var(--lull-s7)),420px)] ' +
  'flex-col gap-[var(--lull-s3)] overflow-y-auto rounded-[var(--lull-r-lg)] border border-[var(--lull-rule)] ' +
  'bg-[var(--lull-raised)] p-[var(--lull-s4)] shadow-[0_8px_28px_rgba(0,0,0,0.16)] dark:shadow-[0_8px_28px_rgba(0,0,0,0.55)]'

const LIST = 'flex list-decimal flex-col gap-[var(--lull-s2)] pl-[var(--lull-s5)] text-[var(--lull-ink)]'

const SHEET_HEAD = 'flex items-center justify-between gap-[var(--lull-s3)]'

// A rung says which hints are spent, so it is drawn with the load-bearing boundary colours rather
// than with `--lull-hair`: hair is decoration and must never be the thing a state is read from.
// The colour is not carrying the state alone either -- the control beside it counts the rungs out
// in words, which is what satisfies WCAG 1.4.1.
const RUNG = 'h-[5px] w-4 rounded-[3px] border border-[var(--lull-rule)]'

// The whole state of the ladder, said in words, on the one control the bar offers. The label always
// names what the press will DO, which is what stops any state being a dead end. It used to read
// "All hints open" and refuse the press -- a true statement of the state, and useless as a control:
// with the sheet covering the whole board on a phone and Escape the only other exit, a touch-only
// player had no way to see the board again.
//
// IT READS THE SHEET BEFORE IT READS THE LADDER, and that order is load-bearing now that the sheet
// comes back shut. A control that only ever opened the NEXT rung would charge a returning player a
// hint to re-read the ones they had already paid for -- the mirror of the bug the sheet's own Hide
// button fixed, where wanting the board back cost a rung. So while there is something in the sheet
// and the sheet is shut, the press shows it, free; with the sheet open there is nothing left to
// reveal but the ladder, and the control goes back to being the ladder.
const controlLabel = (hints: HintLadder, isOpen: boolean, opened: number): string => {
  if (!isOpen && opened > 0) return `Show ${opened} hint${opened === 1 ? '' : 's'}`
  if (opened < hints.length) return `Open hint ${opened + 1} of ${hints.length}`
  return 'Hide hints'
}

/**
 * The ladder, rendered by the SHELL and never by a game component.
 *
 * Missing Vowels, Cryptogram and Phrazle are one phrase in three costumes, so a hint about what the
 * phrase MEANS serves all three -- and a board that never learns hints exist cannot leak one.
 *
 * No time gate, no penalty, no cost. Rungs open in order because a ladder is only meaningful in
 * order. On a solved puzzle it renders exactly as it always does: the answer is already on screen,
 * so there is nothing left to protect.
 *
 * Opened rungs are drawn in a sheet that OVERLAYS the board rather than in a panel that shares the
 * column with it. The instrument sits `--lull-seam` up from the bottom edge on every bench, in
 * every state, and a hint that could push it down would break the one promise all three benches
 * make together.
 */
export const HintBar = ({ hints, puzzleId, variant = 'docked' }: HintBarProps): React.ReactNode => {
  // Read once, at mount. The frame keys the view on the puzzle id, so a different puzzle is a
  // different component rather than a prop change, and re-reading storage on every render would
  // hand this component back its own writes.
  const [opened, setOpened] = useState(() => readHints(puzzleId, hints.length))

  // Open state is a VIEW concern and is never persisted: `lull:hints:<puzzleId>` stays the opened
  // count and only the opened count, so a closed sheet is not an unopened rung.
  //
  // ALWAYS SHUT, and never derived from the count. Deriving it looked like generosity -- a returning
  // player got their rungs back for free -- but the count cannot tell the two cases apart: a player
  // who opened a hint once and shut it got it thrown back over the board on every later visit, and
  // on a solved puzzle the sheet covered the answer they came back to look at. There is no stored
  // fact that distinguishes "I want these up" from "I read these yesterday", so the bar stops
  // guessing and opens on a press.
  //
  // The press is free where it used to cost a rung: see controlLabel, which offers the rungs already
  // paid for before it offers the next one.
  const [isOpen, setIsOpen] = useState(false)

  // The Button component takes no ref, and the reveal control has to be findable by name after the
  // sheet closes: a sheet that vanished while focus was inside it would drop focus to <body>, and
  // the next Tab would restart at the top of the page. The wrapper is what gives us a handle.
  const controlRef = useRef<HTMLSpanElement>(null)
  const labelId = useId()
  const sheetId = useId()

  const isSpent = opened >= hints.length

  const close = (): void => {
    // Focus first, then hide. React flushes the state change after this handler returns, so by the
    // time the sheet leaves the accessibility tree the focus it held has already moved somewhere
    // real (WCAG 2.4.3).
    controlRef.current?.querySelector('button')?.focus()
    setIsOpen(false)
  }

  const press = (): void => {
    // Rungs already paid for come back first, and they come back free. The same branch is the
    // pointer dismissal's other half -- Escape was once the sheet's only exit, which on a touch
    // device is no exit at all.
    if (!isOpen && opened > 0) {
      setIsOpen(true)
      return
    }
    // Nothing left to reveal, so the control is the sheet's toggle. A control that only refuses is
    // not a control.
    if (isSpent) {
      close()
      return
    }
    const next = opened + 1
    setOpened(next)
    writeHints(puzzleId, next)
    // Asking for a hint is asking to see it. A rung that opened inside a shut sheet would read as a
    // button that did nothing.
    setIsOpen(true)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'Escape' || !isOpen) return
    close()
  }

  return (
    <section
      aria-labelledby={labelId}
      // `relative` is what the sheet is measured against, so the overlay is bounded by this bar's
      // top edge rather than by whatever the frame happens to wrap it in.
      className={`relative flex items-center ${VARIANT[variant]}`}
      onKeyDown={handleKeyDown}
    >
      {/* The live region wraps the list rather than duplicating its newest entry, so a screen
          reader announces only the rung that just appeared. `aria-atomic="false"` is what makes
          that true and is not optional: role="status" carries an implicit aria-atomic="true" in
          ARIA 1.2, and under it opening rung 3 re-reads rungs 1 and 2 with it. Mounted empty from
          the start on a fresh puzzle: a role="status" element inserted with its content already in
          it is routinely missed by NVDA and JAWS, which announce changes inside a region they are
          already watching. It therefore sits OUTSIDE everything that can be hidden.

          The sheet's own Hide control is inside it, and that is a change with a cost that was
          weighed rather than missed: the first reveal now reads "Hints, Hide, <rung 1>" instead of
          just the rung. Every LATER rung is unaffected, because aria-atomic="false" announces only
          the nodes that changed and the header is static. The alternative was a sheet a touch-only
          player could not close without spending every remaining hint, which is a worse thing to
          have and a worse thing to say.

          Zero-size in flow, so it can sit in the row without spacing it. */}
      <div aria-atomic="false" role="status">
        {/* The hide is an undecorated wrapper, NOT the sheet. Tailwind v4's preflight ships
            `[hidden]:where(:not([hidden="until-found"]))` with `display: none !important`, which
            would in fact outrank the sheet's own `flex` -- but a base-layer reset is not where a
            correctness guarantee belongs, and this wrapper carries no display utility, so the
            attribute stands on its own. */}
        <div hidden={!isOpen} id={sheetId}>
          {/* Focusable because it scrolls and every rung inside it is plain text: a scrollable
              region with no focusable descendant cannot be scrolled from the keyboard at all (axe
              scrollable-region-focusable). jest-axe cannot catch that coming apart -- jsdom lays
              nothing out, so scrollHeight is always 0 and the rule never fires. */}
          <section aria-label="Open hints" className={SHEET} tabIndex={0}>
            {/* The way out, and it has to be here rather than only on the bar below.
                The bar's own control is the LADDER: while a rung is still unspent it reads
                "Open hint 2 of 3" and opening is the only thing it can do, so a player who
                wanted the board back had exactly two exits -- press Escape, which a touch
                device does not have, or spend every remaining hint to turn the control into
                "Hide hints". Wanting to see the phrase again cost a hint.

                So the sheet carries its own dismissal, where the thing being dismissed is,
                and it runs the same `close` -- focus returns to the bar's control, because
                this button is inside the element about to leave the accessibility tree. */}
            {/* The label is STATIC, and a paragraph rather than a heading. Static because this
                header sits inside the live region: aria-atomic="false" announces the nodes that
                changed, so a label counting the open rungs would re-announce itself alongside
                every new one. A paragraph because the sheet is drawn over a board whose heading
                levels belong to the shell, and a heading here would either skip a level or claim
                one it does not own.

                Gated on there being a rung to head, which is what keeps the live region EMPTY at
                mount -- the property this bar's whole announcement story rests on. A region that
                arrives with text in it is a region a screen reader was never watching. */}
            {opened > 0 && (
              <div className={SHEET_HEAD}>
                <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--lull-muted)] uppercase">Hints</p>
                <Button onClick={close} size="sm" variant="quiet">
                  Hide
                </Button>
              </div>
            )}
            <ol className={LIST}>
              {hints.slice(0, opened).map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      <div className="mr-auto flex flex-col gap-[var(--lull-s1)]">
        <span className="text-[11px] font-semibold tracking-[0.14em] text-[var(--lull-muted)] uppercase" id={labelId}>
          Hints
        </span>
        {/* Scenery. The control's own label counts the rungs out in words, so nothing here is the
            only carrier of anything. */}
        <span aria-hidden="true" className="flex gap-[3px]">
          {hints.map((hint, index) => (
            <span
              className={`${RUNG} ${index < opened ? 'border-[var(--lull-accent)] bg-[var(--lull-accent)]' : 'bg-[var(--lull-hair)]'}`}
              key={hint}
            />
          ))}
        </span>
      </div>

      {/* Never unmounted and never `disabled`: a browser blurs a disabled element, focus falls to
          <body>, and the next Tab restarts at the top of the page. It is no longer aria-disabled
          either -- spending the last rung turns it into the sheet's toggle rather than into a
          control that says "All hints open" and does nothing.

          aria-expanded and aria-controls are what let a screen reader user know the sheet is a
          thing this button opens and closes, which is the relationship the old flowed drawer
          carried and the first version of this bar dropped. */}
      <span ref={controlRef}>
        <Button aria-controls={sheetId} aria-expanded={isOpen} onClick={press} size="sm">
          {controlLabel(hints, isOpen, opened)}
        </Button>
      </span>
    </section>
  )
}
