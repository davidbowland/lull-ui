import { normalizeAnswer } from '@rules/normalize-answer'
import React, { useState } from 'react'

import { Button } from '@components/button'
import { Plate, Shell } from '@components/enclosure'
import { FloorBar } from '@components/floor-bar'
import { MissingVowelsData, PuzzleComponentProps } from '@types'

// The one rule this component applies, and it is vendored rather than authored: the backend
// decides what counts as the answer, and normalizeAnswer exists only because the comparison runs
// over free text the player invents at play time, which no generator can enumerate in advance.
//
// `typeof answer` IS CHECKED FIRST, and it is the one guard here whose absence LATCHES.
// `isValidPuzzle` leaves `data` opaque, so a pack whose `answer` is missing, null or a number
// renders a plate that looks perfectly fine -- the empty-guess operand short-circuits while the box
// is still empty. The first keystroke then calls `onProgress` and only afterwards reaches
// `normalizeAnswer(answer)`, which throws: so the write lands and the render does not. Every later
// load restores that one character at mount, the throw happens before the player can touch
// anything, ErrorBoundary replaces the whole app with "Lull got stuck", and nothing self-heals it --
// the pack is valid so `readPack` keeps it, and no code validates a progress string. That puzzle is
// unopenable until site data is cleared by hand. Found on the cryptic bench, which copied this line.
const isCorrect = (guess: string, answer: string): boolean =>
  typeof answer === 'string' && normalizeAnswer(guess) !== '' && normalizeAnswer(guess) === normalizeAnswer(answer)

// The plate's accessible name. Read as one string by a screen reader the consonants are gibberish,
// so the visible run is hidden and the name spells the groups out instead -- a blind player gets
// the same information sighted players get from the gaps, rather than word-shaped noise.
const spellOut = (displayed: string): string =>
  `The letters are ${displayed
    .split(' ')
    .map((chunk) => chunk.split('').join(' '))
    .join(', then ')}`

// The hero. Sign cut, one weight, sized off the viewport so a short phrase fills the plate on a
// phone without a long one needing three lines.
//
// The left padding is the tracking, and it is not a fudge: letter-spacing is applied AFTER every
// glyph including the last, so a centered run carries one full space of air on its right that it
// does not carry on its left, and the phrase sits visibly off-center in its own plate. One
// tracking unit of padding on the left puts it back, on every line rather than only the first,
// which is why this is padding and not a text-indent.
const PHRASE =
  'lull-sign pl-[0.32em] text-center text-[clamp(1.75rem,9vw,2.75rem)] leading-[1.4] ' +
  'tracking-[0.32em] break-words text-[var(--lull-ink)]'

// --lull-rule, never --lull-hair: this border is the whole of what tells a player where the box
// they type into begins, and hair is decoration that must never identify a control. On the floor
// that pair is `rule on floor`, which contrast.test.ts already holds at 3:1.
//
// `min-w-0 flex-1` rather than `w-full`, and min-w-0 is the load-bearing half: a flex item's
// default `min-width: auto` refuses to shrink below its own content, so without it a long guess
// pushes Check off the end of the row instead of scrolling inside the box.
const FIELD =
  'min-h-11 min-w-0 flex-1 rounded-[var(--lull-r-md)] border border-[var(--lull-rule)] bg-[var(--lull-raised)] ' +
  'px-[var(--lull-s3)] py-[var(--lull-s2)] text-lg text-[var(--lull-ink)]'

// Wide enough for "Play again", which is what the slot has to hold rather than "Check": the two
// share one position and a slot sized to the shorter would resize the field at the exact instant
// the player wins. Source Serif semibold at 15px puts "Play again" at about 70px of glyphs, so with
// 32px of padding and 2px of border it is around 104 natural, against "Check" at about 73. 128
// clears both with room for a font fallback.
//
// A ONE-SIDED CONSTRAINT EXPRESSING A TWO-SIDED REQUIREMENT, and the gap is worth knowing about.
// What this actually needs is "the two controls are the same width"; `min-w` only says "at least
// this wide". Nothing pushes "Play again" past 128 today, but if something ever did -- a font swap,
// an enforced minimum font size -- `shrink-0` would let the button grow, the field would give up
// the difference, and reflow-at-the-win would come back with no test able to see it.
//
// It costs the field real width -- 148px at a 320 viewport -- and that is the tightest number on
// this bench. There are 24px to reclaim here if the device pass finds the readback too tight; the
// measurement above is what says they are available. See the spec's recorded risk.
const CONTROL_SLOT = 'min-w-[128px] shrink-0 justify-center'

// THE STANDING LINE, moved out of the board band with the field it belongs to. It is orientation
// rather than content: worth reading once, at rest, and dead weight under the plate for the rest
// of the solve. In the ribbon it sits directly over the box it is about.
//
// It is displaced by a message and returns on the next keystroke, because `change` clears
// `checked`. That is what lets the visible label go sr-only: the player is never composing without
// an instruction on screen, and the accessible name never goes away at all.
const INSTRUCTION = 'The vowels are gone and the spaces have moved. What is it?'

export const MissingVowelsBoard = ({
  onProgress,
  onReset,
  onSolved,
  progress,
  puzzle,
}: PuzzleComponentProps<MissingVowelsData>) => {
  const { answer, category, displayed } = puzzle.data

  // Restored once, at mount. The shell keys this component on the puzzle id, so a different
  // puzzle is a different component rather than a prop change.
  //
  // Stored progress is free text the player typed, so unlike goFigure there is nothing to
  // validate it against -- any string is a state its own input could have reached.
  const [guess, setGuess] = useState<string>(() => progress ?? '')
  const [checked, setChecked] = useState<boolean>(false)

  const solved = isCorrect(guess, answer)

  const change = (next: string): void => {
    setGuess(next)
    setChecked(false)
    onProgress(next)
    // Reported the moment it is right, without waiting for the button. Typing the last letter of
    // a phrase you have recognized should not then require finding a control.
    if (isCorrect(next, answer)) onSolved()
  }

  // No solved branch. Check is not on screen once the board is solved, and `solved` is derived
  // from the guess, which this cannot change.
  const check = (): void => setChecked(true)

  // Empties the box, which un-solves it: `solved` is derived, so clearing the guess is the whole
  // reset as far as the BOARD is concerned. The shell is told the board is empty so a puzzle left
  // this way reopens empty.
  //
  // The second call is the half the board cannot do itself. A fresh puzzle is a fresh hint ladder,
  // and the ladder lives at `lull:hints:<puzzleId>` — storage, which a board gets none of. So this
  // says "the player started over" and the shell decides what that means. What it does about it is
  // deliberately not stated here: this board names an event, and naming the key or the component
  // that answers for it would be the board reaching past the one thing it is allowed to say.
  //
  // It cannot be folded into the empty string above, tempting as that is. `change('')` is also what
  // happens when a player selects their whole answer and deletes it, and charging them their spent
  // rungs for a backspace would be the same bug goFigure avoids by keeping Clear and Play again on
  // separate paths.
  //
  // Optional-called: `onReset` is optional on the props, and a board that assumed the shell always
  // supplies it would crash on exactly the press this exists for.
  const playAgain = (): void => {
    change('')
    onReset?.()
  }

  const message = (): string => {
    if (solved) return `Solved. The answer is ${answer}.`
    // An unfinished guess is not a wrong one, so nothing is said until the player asks.
    if (!checked) return ''
    if (normalizeAnswer(guess) === '') return 'Type your answer first.'
    // NOT "the letters are all there, but the spaces are in the wrong places" -- that described a
    // state this board cannot reach. normalizeAnswer discards spacing on purpose (its own docstring
    // says so: the displayed run is respaced to lie, so a player who recovers the phrase must not
    // also have to reproduce the real boundaries). So a guess whose letters are all there WINS,
    // whatever the spacing. The old line could only ever appear when the letters were wrong, and it
    // sent the player to re-check the one thing that could not be the problem.
    return 'Not it. Check the letters — where the spaces fall doesn’t count.'
  }

  return (
    <>
      {/* Exactly two siblings, and the frame's wrapper is `display: contents`, so this element and
          the floor below become flex items of the screen column and index.css orders them into
          their bands. Nothing but the band class and its own column layout goes on it: the SHELL
          owns this box's flex, min-height and vertical overflow, because a board that forgot to
          flex would take the floor down with it. */}
      <div className="lull-board flex flex-col overflow-x-hidden">
        {/* The same 34px strip of ground the cipher bench draws, holding the same kind of fact.
            Two benches that look nothing alike still say what this phrase IS in the same place, in
            the same band -- that is the shared grammar, as against a shared container. */}
        {category !== undefined && (
          <h2 className="lull-signrow">
            <span className="truncate text-[11.5px] font-semibold tracking-[0.11em] uppercase">{category}</span>
          </h2>
        )}

        <div className="flex flex-1 flex-col gap-[var(--lull-s5)] bg-[var(--lull-plate)] pt-[var(--lull-s5)] pr-[var(--lull-gutter-right)] pb-[var(--lull-s4)] pl-[var(--lull-gutter-left)]">
          {/* The bezel goes here and nowhere else on this bench. One raised plate reads as raised;
              a board of them reads as texture, which is the failure Enclosure warns about. The
              phrase IS the puzzle, so it is the thing that carries the weight. */}
          <Shell>
            <Plate className="px-[var(--lull-s4)] py-[var(--lull-s5)]">
              <p aria-label={spellOut(displayed)} className={PHRASE} role="img">
                <span aria-hidden="true">{displayed}</span>
              </p>
            </Plate>
          </Shell>
        </div>
      </div>

      {/* The band class rides a wrapper rather than FloorBar itself because FloorBar takes no
          `className` -- `children`, `message`, `resting` and `variant` are the whole of its props,
          and this component may not edit it. The wrapper is what the screen column sees, so it is
          what has to carry the order.

          THE ONE BENCH WITHOUT THE SEAM, and it is stated here rather than left to be discovered.
          This floor used to reserve the full seam on the grounds that an OS keyboard was about to
          cover it and a floor that collapsed would move the layout when the keyboard opened. Both
          halves were wrong, and they are wrong in a new way now: the keyboard does not sit inside
          the layout, it resizes the viewport over the top of it -- which is why the shell asks for
          `interactive-widget=resizes-content` and measures the rest with useKeyboardInset, rather
          than this bench reserving pixels against it.

          What the seam is actually a promise about is where the INSTRUMENT is, and this bench's
          instrument is one row: the box you type in and the control that checks it. So the floor is
          exactly as tall as the ribbon plus that row, and it is still the same floor: same ground,
          same ribbon, same live region, same place on the screen.

          THE ROW IS 46px, NOT 44, and the two pixels are the field rather than the button. The row
          is items-center, so it takes the taller of the two: Button is min-h-11, a flat 44, while
          FIELD is text-lg -- a 28px line box -- plus 8px of padding either side plus a 1px border
          either side. Which also means FIELD's own min-h-11 never binds; it is a floor under a
          number that already clears it, kept because a future smaller type size would need it. The
          floor grows by those two pixels and nothing else moves. */}
      <div className="lull-instrument">
        <FloorBar message={message()} resting={INSTRUCTION} variant="compact">
          <div className="flex shrink-0 items-center gap-[var(--lull-s3)] pt-[var(--lull-s3)] pr-[var(--lull-gutter-right)] pl-[var(--lull-gutter-left)]">
            {/* The label is a SIBLING now, not a wrapper. An sr-only element hides its subtree, so
                a wrapping label would take the field with it; `htmlFor` was already carrying the
                association and is now the whole of it.

                The component BUILDS this id out of the puzzle id, so both ends of the reference
                are asserted -- see the suite. */}
            <label className="sr-only" htmlFor={`answer-${puzzle.id}`}>
              Your answer
            </label>
            <input
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              className={FIELD}
              // Chrome ignores autocomplete="off" for a field its heuristics have claimed, and a
              // lone text input beside a submit-shaped button at the bottom of the viewport is the
              // credential shape. These three are the opt-outs the managers themselves honor.
              data-1p-ignore
              data-form-type="other"
              data-lpignore="true"
              // Where the shell's mitigations do not land -- an engine that reads no
              // interactive-widget key and offers no visual viewport to measure -- the OS keyboard
              // still covers the floor, and its own action key is then the only control the player
              // can reach. So it has to do what the button does, and it is named for the job so the
              // key reads "Go" rather than "return".
              enterKeyHint="go"
              id={`answer-${puzzle.id}`}
              onChange={(event) => change(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && check()}
              // readOnly, NOT disabled. A solved board takes no more keystrokes, but a disabled
              // input is dropped from the tab order and skipped by a screen reader's forms mode --
              // so the answer the player just won with would become unreachable and unreadable.
              // readOnly stays focusable, stays announced, and keeps the floor's own focus ring.
              readOnly={solved}
              spellCheck={false}
              type="text"
              value={guess}
            />
            {/* Two buttons rather than one that changes its mind, because they do not do the same
                thing to the board. The FIELD is not swapped with them: it holds the winning answer
                and it is the focused element at the moment of the win, so rebuilding this row would
                drop focus to <body>. React keeps a stable element type at a stable position, so the
                node, the caret and the selection all survive.

                Play again takes no `keepsFocusOnPress`. The composer contract exists to hold a
                keyboard open over a field being typed in; a solved board is readOnly and has
                nothing left to type. */}
            {solved ? (
              <Button className={CONTROL_SLOT} onClick={playAgain}>
                Play again
              </Button>
            ) : (
              <Button className={CONTROL_SLOT} keepsFocusOnPress onClick={check}>
                Check
              </Button>
            )}
          </div>
        </FloorBar>
      </div>
    </>
  )
}
