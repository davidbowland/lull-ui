import React from 'react'

import { CELL, HALF, PAD, ROW, ROWS, WIDE } from './layout'

// THE PAD, and it is one component because it is one instrument. The cipher bench and the guess
// bench each hand-rolled a 7x4 grid of twenty-eight buttons over the same
// `'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')`, which read as a tolerable duplicate right up to the
// moment the letter order changed -- at which point it was two edits that had to agree, in two
// files, with nothing anywhere able to notice if they did not.
//
// WHAT IS SHARED IS THE SHAPE, and the split is worth stating because it is where every future
// change to this file has to land. This component owns the rows, the key sizes, the gridlines, the
// tab order and the fact that two utility keys stand at the ends of row three. It owns NO color, NO
// verdict, NO annotation and NO sentence: the guess bench's strike and the cipher bench's `= Z` are
// nodes their own boards build and pass in, because the two pads share a rectangle and share almost
// nothing else about what a key means.
//
// IT IS NOT A BOARD PROP AND NEVER BECOMES ONE. PuzzleComponentProps is six things and this is not
// among them: a board imports the pad the same way it imports FloorBar, which is a component in the
// app rather than a capability handed to it. Nothing here routes, stores, or fetches.

// SHAPE ONLY, and no color at all -- which is load-bearing rather than tidy. The cipher bench's old
// key string set `text-[var(--lull-floor-ink)]` and its utility string set
// `text-[var(--lull-floor-accent)]`, so the two words on the pad carried both at once and which one
// painted came down to the order Tailwind happened to emit them in. The guess bench had already
// split its own for exactly that reason. One color source per key, always, and it arrives as `tone`.
// No `min-w-0` here: CELL and WIDE each carry their own, because the reason for it is a flex basis
// and the flex basis is theirs. Setting it in both places emitted the utility twice on every key.
const KEY = 'flex cursor-pointer flex-col items-center justify-center gap-[2px] leading-none font-semibold'

// On the letter itself rather than on the key, so a utility key can set its own size without two
// arbitrary font-size utilities racing each other in the generated stylesheet.
const LETTER = 'text-[17px]'

// The two utility keys, sized so they read as words among single letters. `Delete` sets about 36px
// at 11.5px in Source Serif 4 with 0.05em of tracking, against the 46.6px a one-and-a-half-unit key
// draws at a 320 viewport -- room on both sides, and more of it than the four-row pad had.
const UTILITY = 'text-[11.5px] tracking-[0.05em]'

export interface LetterKey {
  // Drawn OVER the letter, inside the same relative box, so a rule through it is measured against
  // the glyph rather than against the whole key. The guess bench's strike; nothing on the cipher
  // bench.
  mark?: React.ReactNode
  // What a screen reader hears. The bare letter is never enough on either bench -- one says what
  // the key is on, the other says whether it is worth pressing -- so this is required rather than
  // defaulted to the letter.
  name: string
  // Drawn UNDER the letter. The cipher bench's `= Z`; nothing on the guess bench. A node rather
  // than a string, because the board owns how its own annotation is set.
  note?: React.ReactNode
  // The key's one color source: ground, ink, hover and active. See KEY.
  tone: string
}

export interface UtilityKey {
  // The word on the key.
  label: string
  // The accessible name, when it is not the label. `Play again` does not fit a key and `Again`
  // does, and 2.5.3 Label in Name is satisfied because the visible label is contained in the name.
  // Left undefined, the label is the name.
  name?: string
  onClick: () => void
  // As LetterKey's, and the two utility keys take a different one: they are not letters and can
  // never carry a verdict.
  tone: string
}

export interface KeypadProps {
  // The group's accessible name, and it has to FOLLOW THE KEYS. The guess bench swaps `Guess` for
  // `Play again` when the board is over, and a group still promising a `Guess` button would send a
  // screen-reader user navigating by group to look for a control that is not in it.
  label: string
  // What each letter key looks like and is called, asked once per letter per render.
  letter: (plain: string) => LetterKey
  onPress: (plain: string) => void
  // EXACTLY TWO, and the tuple is the point: they stand at the two ends of row three, which is what
  // makes that row nine cells wide like the one above it. A third tool would have nowhere to stand
  // without reflowing the rectangle, so the type refuses one rather than letting it wrap.
  //
  // [LEFT, RIGHT], AND DELETE GOES LEFT ON EVERY PAD. That is a convention this component cannot
  // enforce -- both slots take the same type -- so it is written here, where both benches read it.
  //
  // Delete is the only tool BOTH pads have, so Delete is the one that has to be in a fixed place: a
  // player who learns the eraser on one bench has to find it in the same corner on the other, and
  // that is worth more than either bench's local preference for its own second key. The right-hand
  // slot then takes whatever that bench does instead -- `Guess` on the guess bench, `Undo` on the
  // cipher bench.
  //
  // IT COSTS SOMETHING ON THE GUESS BENCH AND THE TRADE IS DELIBERATE. `Guess` is irreversible by
  // design -- a committed guess is permanent, that is the game -- and the right-hand end of the
  // bottom row is where a right thumb rests, so the unrecoverable action now sits in the most
  // mis-tappable spot on the pad. Three things pay for it: Guess does nothing at all until the row
  // is full (it answers `Fill every tile first.` and spends no attempt), it is pressed at least
  // once per row against an eraser pressed on some rows and not others, and every form on the
  // device this ships to puts the confirming control on that side.
  //
  // Wordle puts Enter left and Backspace right, and this is the one place the pad departs from it.
  utility: readonly [UtilityKey, UtilityKey]
}

export const Keypad = ({ label, letter, onPress, utility }: KeypadProps): React.ReactNode => {
  const letterKey = (plain: string): React.ReactNode => {
    const { mark, name, note, tone } = letter(plain)

    return (
      <button
        aria-label={name}
        className={`${KEY} ${CELL} ${tone}`}
        key={plain}
        onClick={() => onPress(plain)}
        type="button"
      >
        {/* `relative` is here rather than on the button so a mark is measured against the LETTER
            and not against a 59px key -- a line spanning the whole key reads as a divider between
            rows of the pad. */}
        <span aria-hidden="true" className={`relative ${LETTER}`}>
          {plain}
          {mark}
        </span>
        {note}
      </button>
    )
  }

  // NOT IN A MAP, and never put in one. The guess bench swaps one key's label, name and handler in
  // place when the board is over; rendered at a fixed position in the JSX below, React reconciles
  // the same DOM element and a keyboard player standing on that key keeps their focus. A pad
  // rebuilt from an array would drop focus to <body> and restart the next Tab at the top of the
  // page.
  const utilityKey = ({ label: word, name, onClick, tone }: UtilityKey): React.ReactNode => (
    <button aria-label={name} className={`${KEY} ${WIDE} ${UTILITY} ${tone}`} onClick={onClick} type="button">
      {word}
    </button>
  )

  return (
    // THE ROWS ARE WRITTEN OUT rather than looped, because all three genuinely differ: one is ten
    // letters, one is nine between two indents, one is seven between two tools. A loop over ROWS
    // with an index test at each end would hide that behind two conditionals and read worse than
    // the thing it describes.
    <div aria-label={label} className={PAD} role="group">
      <div className={ROW}>{ROWS[0].map(letterKey)}</div>
      <div className={ROW}>
        {/* Scenery, and the reason a keyboard looks like a keyboard. aria-hidden and empty, so a
            screen reader working the pad does not stop on either end of this row. */}
        <span aria-hidden="true" className={HALF} />
        {ROWS[1].map(letterKey)}
        <span aria-hidden="true" className={HALF} />
      </div>
      <div className={ROW}>
        {utilityKey(utility[0])}
        {ROWS[2].map(letterKey)}
        {utilityKey(utility[1])}
      </div>
    </div>
  )
}
