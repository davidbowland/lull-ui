import { normalizeAnswer } from '@rules/normalize-answer'
import React, { useState } from 'react'

import { MissingVowelsData, PuzzleComponentProps } from '@types'

// The one rule this component applies, and it is vendored rather than authored: the backend
// decides what counts as the answer, and normalizeAnswer exists only because the comparison runs
// over free text the player invents at play time, which no generator can enumerate in advance.
const isCorrect = (guess: string, answer: string): boolean =>
  normalizeAnswer(guess) !== '' && normalizeAnswer(guess) === normalizeAnswer(answer)

// The board's one button, whichever of the two it currently is.
const ACTION =
  'min-h-11 rounded-full border border-[var(--lull-border)] px-4 text-[var(--lull-ink)] ' +
  'disabled:opacity-40 enabled:cursor-pointer'

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
    return 'Not it. The letters are all there, but the spaces are in the wrong places.'
  }

  return (
    <section aria-label="Missing Vowels" className="flex flex-col gap-5">
      <h2 className="text-2xl text-[var(--lull-ink)]">{category}</h2>

      {/* The consonants are the puzzle. Read as one string by a screen reader they would be
          gibberish, so the visible run is aria-hidden and an explicit label spells it out with the
          groups named -- a blind player gets the same information sighted players get from the
          gaps, rather than a word-shaped noise. */}
      <p
        aria-label={`The letters are ${displayed
          .split(' ')
          .map((chunk) => chunk.split('').join(' '))
          .join(', then ')}`}
        className="rounded-xl border border-[var(--lull-border)] px-4 py-3 text-center text-2xl tracking-[0.3em] text-[var(--lull-ink)]"
        role="img"
      >
        <span aria-hidden="true">{displayed}</span>
      </p>

      <p className="text-[var(--lull-ink)]">The vowels are gone and the spaces have moved. What is it?</p>

      <label className="flex flex-col gap-2 text-[var(--lull-ink)]" htmlFor={`answer-${puzzle.id}`}>
        Your answer
        <input
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          className="min-h-11 rounded-xl border border-[var(--lull-border)] px-4 text-lg text-[var(--lull-ink)]"
          id={`answer-${puzzle.id}`}
          onChange={(event) => change(event.target.value)}
          // readOnly, NOT disabled. A solved board takes no more keystrokes, but a disabled input
          // is dropped from the tab order and is skipped by a screen reader's forms mode -- so the
          // answer the player just won with would become unreachable and unreadable. readOnly
          // stays focusable, stays announced, and still refuses the keystroke.
          readOnly={solved}
          spellCheck={false}
          type="text"
          value={guess}
        />
      </label>

      {/* Always mounted, empty until there is something to say. A role="status" element inserted
          with its message already in it is routinely missed by NVDA and JAWS, which announce
          changes inside a region they are already watching. Solved and wrong are both carried in
          text -- never by colour alone. */}
      <p className="min-h-6 text-[var(--lull-ink)] empty:min-h-0" role="status">
        {message()}
      </p>

      {/* Two buttons rather than one that changes its mind, because they do not do the same thing
          to the board. Focus is safe across the swap: the winning keystroke is typed in the box, so
          this control is never the focused element at the moment it is replaced. */}
      <div>
        {solved ? (
          <button className={ACTION} onClick={playAgain} type="button">
            Play again
          </button>
        ) : (
          <button className={ACTION} onClick={check} type="button">
            Check
          </button>
        )}
      </div>
    </section>
  )
}
