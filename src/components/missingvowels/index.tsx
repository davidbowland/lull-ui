import { normalizeAnswer } from '@rules/normalize-answer'
import React, { useState } from 'react'

import { Button } from '@components/button'
import { Plate, Shell } from '@components/enclosure'
import { FloorBar } from '@components/floor-bar'
import { MissingVowelsData, PuzzleComponentProps } from '@types'

// The one rule this component applies, and it is vendored rather than authored: the backend
// decides what counts as the answer, and normalizeAnswer exists only because the comparison runs
// over free text the player invents at play time, which no generator can enumerate in advance.
const isCorrect = (guess: string, answer: string): boolean =>
  normalizeAnswer(guess) !== '' && normalizeAnswer(guess) === normalizeAnswer(answer)

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
// glyph including the last, so a centred run carries one full space of air on its right that it
// does not carry on its left, and the phrase sits visibly off-centre in its own plate. One
// tracking unit of padding on the left puts it back, on every line rather than only the first,
// which is why this is padding and not a text-indent.
const PHRASE =
  'lull-sign pl-[0.32em] text-center text-[clamp(1.75rem,9vw,2.75rem)] leading-[1.4] ' +
  'tracking-[0.32em] break-words text-[var(--lull-ink)]'

// --lull-rule, never --lull-hair: this border is the whole of what tells a player where the box
// they type into begins, and hair is decoration that must never identify a control.
const FIELD =
  'min-h-11 w-full rounded-[var(--lull-r-md)] border border-[var(--lull-rule)] bg-[var(--lull-raised)] ' +
  'px-[var(--lull-s3)] py-[var(--lull-s2)] text-lg text-[var(--lull-ink)]'

export const MissingVowelsBoard = ({
  onProgress,
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
  // reset. The shell is told the board is empty so a puzzle left this way reopens empty.
  const playAgain = (): void => change('')

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

          <p className="text-[var(--lull-ink)]">The vowels are gone and the spaces have moved. What is it?</p>

          <label
            className="flex flex-col gap-[var(--lull-s2)] text-[12.5px] text-[var(--lull-muted)]"
            htmlFor={`answer-${puzzle.id}`}
          >
            Your answer
            <input
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              className={FIELD}
              // The OS keyboard is about to cover the floor this bench yields to it, and Check can
              // end up underneath it. The keyboard's own action key is then the only control still
              // on screen, so it has to do what the button does -- and it is named for the job so
              // the key reads "Go" rather than "return".
              enterKeyHint="go"
              id={`answer-${puzzle.id}`}
              onChange={(event) => change(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && check()}
              // readOnly, NOT disabled. A solved board takes no more keystrokes, but a disabled
              // input is dropped from the tab order and is skipped by a screen reader's forms mode
              // -- so the answer the player just won with would become unreachable and unreadable.
              // readOnly stays focusable, stays announced, and still refuses the keystroke.
              readOnly={solved}
              spellCheck={false}
              type="text"
              value={guess}
            />
          </label>
        </div>
      </div>

      {/* The band class rides a wrapper rather than FloorBar itself because FloorBar takes only
          `children`, `message` and `variant`, and this component may not edit it. The wrapper is
          what the screen column sees, so it is what has to carry the order.

          THE ONE BENCH WITHOUT THE SEAM, and it is stated here rather than left to be discovered.
          This floor used to reserve the full 228px on the grounds that an OS keyboard was about to
          cover it and a floor that collapsed would move the layout when the keyboard opened. Both
          halves turned out to be wrong. The OS keyboard does not sit inside the layout at all -- it
          resizes the visual viewport over the top of it -- so reserving room for it reserved room
          for nothing; and on a laptop, where there is no OS keyboard in the first place, the bench
          opened with 228px of near-black holding one button.

          What the seam is actually a promise about is where the INSTRUMENT is, and this bench's
          instrument is a single control. So the floor is exactly as tall as the ribbon plus that
          control, and it is still the same floor: same ground, same ribbon, same live region, same
          place on the screen. The constant that survives is the one worth keeping -- the floor is
          where you operate the bench from -- rather than a number the bench had no use for. */}
      <div className="lull-instrument">
        <FloorBar message={message()} variant="compact">
          <div className="flex shrink-0 pt-[var(--lull-s3)] pr-[var(--lull-gutter-right)] pl-[var(--lull-gutter-left)]">
            {/* Two buttons rather than one that changes its mind, because they do not do the same
                thing to the board. The swap is safe from the focus problem that governs Go
                Figure!'s tiles: the winning keystroke is typed in the box, so this control is
                never the focused element at the moment it is replaced. */}
            {solved ? <Button onClick={playAgain}>Play again</Button> : <Button onClick={check}>Check</Button>}
          </div>
        </FloorBar>
      </div>
    </>
  )
}
