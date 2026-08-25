import { normalizeAnswer } from '@rules/normalize-answer'
import React, { useEffect, useId, useRef, useState } from 'react'

import { decode, encode, Guesses, MAX_GUESS } from './progress'
import { Button } from '@components/button'
import { FloorBar } from '@components/floor-bar'
import { AnagramEntry, PuzzleComponentProps, ThemedAnagramsData } from '@types'

// The one rule this component applies, and it is vendored rather than authored: the backend decides
// what counts as the answer, and normalizeAnswer exists only because the comparison runs over free
// text the player invents at play time, which no generator can enumerate in advance.
//
// COPIED WHOLE from missingvowels/index.tsx, all three clauses, so the two benches cannot drift on
// what an empty or an absent answer means.
//
// `typeof answer` IS CHECKED FIRST, and it is the one guard whose absence LATCHES. isValidPuzzle
// leaves `data` opaque, so an entry whose `answer` is missing or is a number renders four rows that
// look perfectly fine, because the empty-guess operand short-circuits while every box is empty. The
// first keystroke then persists progress and only afterwards calls normalizeAnswer(answer), which
// throws -- so the write lands and the render does not. On every later load the stored character is
// restored at mount and the throw happens before the player can touch anything, the root error
// boundary swaps in "Lull got stuck", and nothing self-heals it: the pack is valid, so readPack
// keeps it, and no code validates a progress string.
//
// THE EMPTY-GUESS CLAUSE IS THE KIND A TIDY-UP DELETES, and it is load-bearing. normalizeAnswer
// maps a string with no alphanumerics to '', so on a pack whose answer is '' the equality alone
// reports every empty box as right at mount: four chips, `4 of 4 right`, and onSolved on a board
// nobody has touched. Silent, and it claims the win on the player's behalf.
const isRight = (guess: string, answer: string): boolean =>
  typeof answer === 'string' && normalizeAnswer(guess) !== '' && normalizeAnswer(guess) === normalizeAnswer(answer)

// A row this board can actually draw.
//
// STRUCTURAL, in isValidPuzzle's and hintsOf's spirit: it checks what this component DEREFERENCES
// and nothing else. `scramble` goes to spellOut, which calls .split on it, so a non-string throws
// during render -- and a throw during render is not a blank row. ErrorBoundary catches it and swaps
// the whole app for "Lull got stuck", which its own comment calls the last resort for what storage
// and the registry were supposed to have validated.
//
// `answer` IS DELIBERATELY NOT CHECKED HERE, and that is not an oversight. isRight already carries
// `typeof answer === 'string'`, and a fixture depends on a row with an unusable answer still
// RENDERING: a board that refused those rows would hide the state rather than survive it, and the
// guards that stop a blank answer winning the game for the player would have nothing left to be
// tested against.
//
// ONE fixture against the clause named above, and TWO against the stricter one it is easy to reach
// for. `unusableAnswerThemedAnagrams` is `answer: undefined` and breaks under `typeof answer ===
// 'string'`; `blankAnswerThemedAnagrams` is `answer: ''`, which IS a string and sails through that
// check -- it only breaks under a non-blank test like `answerOf`'s `answer.trim() !== ''`. An
// earlier version of this comment said two against the named clause, which was one too many.
//
// `typeof null` IS 'object', which is why the null clause is written out rather than assumed. A pack
// can hold a null member -- JSON says so -- and without that clause the very next read is
// `null.scramble`.
const isEntry = (entry: unknown): entry is AnagramEntry =>
  typeof entry === 'object' && entry !== null && typeof (entry as AnagramEntry).scramble === 'string'

// The win, and it is the COMPLETE news: it replaces the fourth row's own sentence rather than
// following it, because `SPATULA is right — 0 to go.` becomes false the instant this is true. It
// does not restate the four answers, which are standing in the four boxes the player is looking at.
const SOLVED = 'Solved. You got all four.'

// THE STANDING LINE, and it is the one rule of this game nobody can guess on arrival -- the exact
// analogue of the tile bench's left-to-right rule and the cipher bench's one-substitution rule. The
// theme on the sign row says what the four rows are about; it does not say that all four answers fit
// it, and that is the fact the puzzle turns on.
//
// It goes in the floor rather than under the sign row for two reasons. It sits directly above the
// control it is about, and the board band is the one that scrolls at 320 -- a rule printed at the top
// of a scrolling band is a rule that leaves the screen the moment the player starts working.
//
// Passed as FloorBar's `resting`, which is a SIBLING of the live region and never a child: a
// role="status" element mounted with text already in it is a region NVDA and JAWS were never
// watching, which would cost this bench every announcement it makes.
const INSTRUCTION = 'The letters in each row spell one word, and all four fit the theme.'

// 128px is sized for "Play again", which is what the slot has to hold rather than "Check": the two
// share one position and a slot sized to the shorter would move the control's edge at the exact
// instant the player wins. THE MEASUREMENT IS IN missingvowels/index.tsx and is not repeated here --
// one number derived in two places disagrees the first time either is re-measured. This is a
// cross-reference, which fails loudly because a reader follows it, rather than a copy, which fails
// silently.
const CONTROL_SLOT = 'min-w-[128px] shrink-0 justify-center'

// Appended to a repeated message so a live region has something to announce. `say` with an
// identical string is an Object.is bail-out: the DOM text never changes, and role="status" is keyed
// to a change rather than to a write. It matters here for exactly one case and that case is real --
// a player who presses Check twice out of doubt. Written as the escape rather than as
// the character: a literal zero-width space is invisible in source, so an editor, a formatter or a
// careless selection can delete it and leave a constant that is the empty string and a mechanism
// that does nothing. Alternated on the low bit of a counter rather than accumulated, so the mark
// stays one character however long the session runs.
const REPEAT_MARK = '\u200b'

// COPIED FROM missingvowels/index.tsx, NOT IMPORTED. It is module-private there, and exporting it
// so a second board can reach into the first is a coupling that outlasts the five lines it saves.
// Two uses is not a pattern.
//
// A scramble read as one string is gibberish, so the visible run is hidden and the element's NAME
// spells the letters out instead: a blind player gets the same letters a sighted player reads off
// the plate, rather than word-shaped noise.
const spellOut = (displayed: string): string =>
  `The letters are ${displayed
    .split(' ')
    .map((chunk) => chunk.split('').join(' '))
    .join(', then ')}`

// The sign over the working surface. `.lull-signrow` (index.css) is the whole band -- height,
// ground, hairlines and gutter -- because three of the four benches draw the same one, and a band
// that three benches share is the grammar rather than a string copied four times.
//
// Sticky, for the cipher bench's reason: .lull-board is the one band that flexes and therefore the
// one that scrolls, this board scrolls in three of the four viewport cases, and letting it scroll
// would take `2 of 4 right` off the top of the screen -- the number a player checks most and the
// only place it is written. The theme goes with it, and the theme is the fact all four rows are
// about.
const SIGN_ROW = 'lull-signrow sticky top-0'
const THEME = 'truncate text-[11.5px] font-semibold tracking-[0.11em] uppercase'
const TALLY = 'ms-auto shrink-0'

// The rows' own column. .lull-board carries no padding of its own -- index.css:254-259 is four
// declarations and none of them is padding -- so this element supplies the page gutter, the same way
// the sibling bench's inner column does. Forget it and the letters run to the screen edge and every
// width the spec measured is wrong by 32px. Nothing in this suite can assert it: a class string read
// back would prove a string was written rather than that a gutter was drawn, and style assertions
// are banned. It is carried by the device check and by this comment.
const ROWS =
  'flex flex-1 flex-col gap-[var(--lull-s4)] bg-[var(--lull-plate)] py-[var(--lull-s4)] ' +
  'pr-[var(--lull-gutter-right)] pl-[var(--lull-gutter-left)]'

// The scramble line and the box under it, 4px apart, as one 76px row. They are one object: the
// thing being worked on and the thing you work on it with, which is what lets the browser's own
// reveal-on-focus bring both into view together when the keyboard is up.
const ROW = 'flex flex-col gap-[4px]'

// Sign cut and tracked, like the sibling bench's phrase, and smaller: nine letters is not a phrase
// and this band has four rows to place rather than one. No pl-[0.32em] correction, because these
// runs are left-aligned rather than centered -- the padding on that bench exists only to re-center
// a run whose trailing letter-space pushed it off center.
const SCRAMBLE =
  'lull-sign text-[clamp(1.25rem,6vw,1.625rem)] leading-[1.2] tracking-[0.28em] break-words text-[var(--lull-ink)]'

// --lull-rule, never --lull-hair: this border is the whole of what tells a player where the box
// they type into begins, and hair is decoration that must never identify a control. `min-w-0
// flex-1` rather than `w-full`, and min-w-0 is the load-bearing half: a flex item's default
// `min-width: auto` refuses to shrink below its own content, so without it a long guess pushes the
// chip off the end of the row instead of scrolling inside the box.
//
// scroll-mt-[38px] IS THE ONE MITIGATION NOTHING IN THIS SUITE CAN DEFEND, and it is shipped here
// rather than in the hardening task because this is the commit that creates the element it goes on.
// With the keyboard up the board band scrolls, and the browser's own reveal-on-focus would pin the
// focused box to the top of the scrollport with its scramble just above the fold -- the letters the
// player needs to read while typing. The scramble line is about 26px and the gap under it is 4, so
// 30 is the minimum that clears the letters and 38 leaves the row some air. jsdom lays nothing out,
// and reading the class back would prove a string was written rather than that a box was revealed,
// so this number is carried by the device check and by this comment.
const BOX =
  'min-h-11 min-w-0 flex-1 scroll-mt-[38px] rounded-[var(--lull-r-md)] border border-[var(--lull-rule)] ' +
  'bg-[var(--lull-raised)] px-[var(--lull-s3)] py-[var(--lull-s2)] text-lg text-[var(--lull-ink)]'

// Ink on plate, a pair contrast.test.ts already holds. The check glyph beside it is aria-hidden
// decoration; the WORD is the carrier, because nothing on this board may be told by a mark alone.
const CHIP = 'flex shrink-0 items-center gap-[4px] text-[12.5px] font-semibold text-[var(--lull-ink)]'

export const ThemedAnagramsBoard = ({
  onProgress,
  onReset,
  onSolved,
  progress,
  puzzle,
}: PuzzleComponentProps<ThemedAnagramsData>): React.ReactNode => {
  const { entries, theme } = puzzle.data

  // REFUSED WHOLE, never in part -- the refusal `decode` makes one file over and the one
  // gofigure/board.ts states in the same words: a half-drawn board is "a state with no test and no
  // way back out", and here it is worse than that, because a puzzle showing two of four rows looks
  // like one the player can finish while it is one they cannot.
  //
  // `entries` IS THE LAST UNGUARDED DEREFERENCE ON THIS BOARD. isValidPuzzle leaves `data` opaque, so
  // the wire can deliver a string, a null member, or nothing at all where the type promises four
  // entries -- and every one of those is a throw during render rather than a blank row.
  //
  // EXACTLY FOUR, and the length clause is the half that matters most. Every consumer below assumes
  // four: the tally's `of 4` is a literal, `decode` returns a four-tuple whatever the pack says, and
  // `solved` compares a count against `rows.length`.
  //
  // THREE VALID ENTRIES WAS THE WORST SHAPE THIS BOARD COULD BE HANDED, and it passed
  // every-is-an-entry cleanly. Fill all three and the tally reads `3 of 4 right` while the floor
  // announces `Solved. You got all four.` and offers `Play again` -- and because the player
  // TRANSITIONS into solved in-session, the mount-seeded ref does not swallow it, so `onSolved`
  // fires and the shell writes the win to `lull:meta`, where solved ids are never pruned. A false
  // win, kept forever, on a puzzle nobody finished. Pressing the Play again it offers then wipes the
  // rungs the player really did spend. The rowless guard stopped at length 0 and this is strictly
  // worse than what it stopped.
  //
  // FIVE GOES THE SAME WAY, and refusing is better than either alternative I weighed. A fifth row
  // left readOnly, or handed a controlled '', still draws a board that looks playable and cannot be
  // won -- `solved` would need five rights and the drafts only carry four. That is the state this
  // file already refuses to draw two paragraphs up. `decode` refuses a string that is not exactly
  // four parts, for this reason; this is the same rule on the other side of the same board.
  const rows: AnagramEntry[] = Array.isArray(entries) && entries.length === 4 && entries.every(isEntry) ? entries : []

  // Restored once, at mount. The shell keys this component on the puzzle id, so a different puzzle
  // is a different component rather than a prop change. `decode` refuses a malformed string whole,
  // so this is four drafts or four empties and never a half-restored board.
  const [guesses, setGuesses] = useState<Guesses>(() => decode(progress))

  // A TRANSIENT, so it is empty at mount, which is what keeps the region unoccupied on a first
  // render: NVDA and JAWS announce changes inside a region they are ALREADY watching. Anything this
  // board wants to say at rest goes through FloorBar's `resting` instead, which is a sibling of the
  // region and never inside it.
  const [message, setMessage] = useState({ nonce: 0, text: '' })

  // Every write to the ribbon goes through here, so no caller has to remember that saying the same
  // thing twice is a different job from saying it once. The counter is what the DOM sees change.
  const say = (text: string): void => setMessage((previous) => ({ nonce: previous.nonce + 1, text }))

  // ONE useId FOR THE WHOLE BOARD, composed with the row index. React guarantees uniqueness per
  // component instance, so four rows cannot collide and neither can two boards -- which is the case
  // CLAUDE.md names as the day duplicate ids become real. puzzle.id would also work today and does
  // not survive that day. Both of these are IDREF targets: boxId is pointed at by the row's label's
  // htmlFor, lettersId by the box's aria-describedby, and the suite resolves both ends of both.
  const uid = useId()
  const boxId = (index: number): string => `${uid}-box-${index}`
  const lettersId = (index: number): string => `${uid}-letters-${index}`

  // DERIVED, NEVER LATCHED, and locking is a consequence of the derivation rather than a second
  // stored fact that could disagree with it. A restored board recomputes all four locks from the
  // guesses alone, which is why progress stores guesses and nothing else.
  //
  // Locking on a correct prefix cannot misfire: the scramble and the answer are the same multiset
  // and the same length, proved at construction, so no longer string over those letters is ever a
  // legal answer -- a player who typed SPATULA and meant to keep going had already typed it.
  // `rows` IS AT MOST FOUR AND `current` IS EXACTLY FOUR, so this index is always in range. It used
  // to carry a `?? ''` against a five-entry pack, whose fifth row read `current[4]` as undefined and
  // threw inside normalizeAnswer during render -- but `rows` now refuses any length but four, so
  // there is no fifth row to index and the fallback became unreachable. It is gone rather than kept
  // as belt-and-braces, because an unreachable guard with eleven lines arguing for it reads to the
  // next person as a live hazard, and the coverage report called it out as the only uncovered branch
  // in the file.
  const rightIn = (current: Guesses): boolean[] => rows.map((entry, index) => isRight(current[index], entry.answer))

  const rights = rightIn(guesses)
  const right = rights.filter(Boolean).length
  // `rows.length > 0 &&` IS THE WHOLE GUARD, and it landed one commit early because that is the
  // commit that made it destructive. `right === rows.length` alone is `0 === 0` on a pack this board
  // could not draw -- and `isValidPuzzle` leaves `data` opaque, so the wire can deliver one. That
  // used to be a wrong sentence: the floor stood `Solved. You got all four.` over a board with no
  // rows. Once the control became a ternary it turned into a `Play again` button, and one press
  // reaches the shell's `removeHints` and deletes `lull:hints:<puzzleId>` -- the rungs a player
  // actually spent, on a board that never had a box to type in. The hints come off `puzzle.hints`,
  // not off `entries`, so an intact ladder beside a malformed `entries` is exactly the shape that
  // loses something.
  //
  // NOT what the plan says it prevents. Its text has a rowless board firing `onSolved` and the shell
  // recording a false win, and that is already impossible: the mount-seeded `reported` ref never
  // sees a transition, so `onSolved` is not called. Measured, not assumed.
  const solved = rows.length > 0 && right === rows.length

  // Reported from an effect guarded by a ref seeded at MOUNT, rather than from an inline call
  // inside `change`. Everything on this board is derived: `solved` is a value with no single event
  // that produces it, and Play again can un-solve it, so the report belongs where the value is read
  // and not at whichever handler happened to change a guess. Seeding with the mount-time value is
  // what makes "not at mount for a restored solved board" structural instead of argued -- the shell
  // marked that puzzle solved when the player actually won it.
  const reported = useRef(solved)
  useEffect(() => {
    if (solved && !reported.current) onSolved()
    reported.current = solved
  }, [onSolved, solved])

  // The cast is the tuple coming back from map, which types as string[] because map cannot know the
  // length it was handed. Nothing else changes shape here: one row's draft is replaced and the
  // other three are the same strings.
  //
  // It calls onProgress and says at most one sentence, and it NEVER calls onReset. Writing '' when
  // the last box is emptied is not a signal that the player started over -- charging them their
  // spent rungs for a backspace is the trap CLAUDE.md documents, and `onReset` has exactly one
  // caller, which is `playAgain` below and is reached only by a press.
  const change = (index: number, next: string): void => {
    const updated = guesses.map((guess, at) => (at === index ? next : guess)) as Guesses

    setGuesses(updated)
    onProgress(encode(updated))

    // At most one row can change per event, because one box receives the keystroke, so at most one
    // sentence is produced and there is nothing to announce over. A locked row is readOnly and
    // fires no change, so reaching this line means the row was not right a moment ago.
    const after = rightIn(updated)
    if (after[index]) {
      const remaining = after.length - after.filter(Boolean).length
      // Digits rather than words, matching every other tally in the product, and an em dash rather
      // than a full stop so the sentence reads as one report rather than two.
      say(remaining === 0 ? SOLVED : `${rows[index].answer} is right — ${remaining} to go.`)
    }
  }

  // The ribbon's string, carrying the repeat mark on every other message. Empty stays exactly empty
  // -- FloorBar renders nothing at all for '', which is what keeps the live region unoccupied at
  // mount, and a mark in there would make it non-empty and cost the first announcement.
  const announced = message.text === '' ? '' : `${message.text}${REPEAT_MARK.repeat(message.nonce % 2)}`

  // ONE CONTROL FOR THE WHOLE BOARD, and it adjudicates nothing -- the rows already lock themselves
  // on the keystroke that makes them right. What it does is say a sentence, because a wrong word
  // deserves one: until the first row locks, silence and "broken" look identical.
  //
  // THE SOLVED ARM IS REACHABLE, and it is reachable exactly one way. The floor's control is
  // `Play again` on a solved board, but every box is readOnly rather than disabled and a readOnly
  // input still delivers keydown -- so the player who just won and pressed their keyboard's action
  // key lands here. Without this arm they are told `Type an answer first.`, which is the one
  // sentence that is never true on a board holding four right answers.
  //
  // ONLY THE ROWS STILL IN PLAY are asked about. Three rows won and one empty is a board that owes
  // one answer, so the question is about the row the player still owes rather than about the three
  // they finished -- otherwise a board whose only typing is already right is answered `Not yet.`
  //
  // normalizeAnswer decides what "typed something" means, exactly as it decides what "right" means,
  // so three spaces is an empty box rather than a wrong attempt.
  const check = (): void => {
    if (solved) {
      say(SOLVED)
      return
    }

    const pending = guesses.filter((_guess, index) => !rights[index])

    say(
      pending.every((guess) => normalizeAnswer(guess) === '')
        ? // The sibling bench's `Type your answer first.` with the possessive dropped, because with
          // four boxes "your answer" names none of them.
          'Type an answer first.'
        : // `Not yet.`, never `Not it.`: three rows can be right while one is not, and "Not it"
          // passes judgment on the whole board. The second half points at the real trick -- the
          // letters are all there and every one of them is used.
          'Not yet. Each answer uses every letter in its row, once each.',
    )
  }

  // The whole reset as far as the BOARD is concerned, because everything on it is derived: `rights`,
  // `right` and `solved` all come out of `guesses`, so four empty strings drop the four chips, put
  // the tally back to `0 of 4 right` and unlock every box with nothing to tear down. The four boxes
  // are readOnly while their rows are right, so this cannot be routed through `change`: a locked row
  // fires no change event, and a reset that waited for one would empty nothing.
  //
  // THE THIRD LINE IS NOT TIDINESS. FloorBar draws `resting` only while `message === ''`
  // (floor-bar/index.tsx:141), so a press that leaves `Solved. You got all four.` standing in the
  // transient puts the player on an empty board that is still being told it is solved, and the line
  // that says what the game is never comes back. THE NONCE IS CARRIED RATHER THAN RESET because it
  // is a counter with no reason to rewind, and for no stronger reason than that: the parity is not
  // load-bearing across this press. Clearing the text on the same line is what makes the next
  // message differ from '' whatever the parity was, so resetting it to 0 and incrementing it both
  // leave every test in this file green -- measured, after an earlier version of this comment
  // claimed a reset would make two identical messages silent again. It would not.
  //
  // The last line is the half the board cannot do itself. A fresh puzzle is a fresh hint ladder, and
  // the ladder lives at `lull:hints:<puzzleId>` -- storage, which a board gets none of. So this names
  // an EVENT and the shell decides what it means; naming the key, the route or the component that
  // answers for it would be the board reaching past the one thing it may say.
  //
  // It cannot be folded into the empty progress string above, tempting as that is. `encode` writes ''
  // whenever every box is empty, which is also what a player who deletes their four drafts produces,
  // and charging them their spent rungs for a backspace is the trap CLAUDE.md documents.
  //
  // Optional-called: `onReset` is optional on the props, and a board that assumed the shell always
  // supplies it would crash on exactly the press this exists for.
  const playAgain = (): void => {
    const cleared: Guesses = ['', '', '', '']

    setGuesses(cleared)
    onProgress(encode(cleared))
    setMessage((previous) => ({ nonce: previous.nonce, text: '' }))
    onReset?.()
  }

  // Handed to FloorBar SEPARATELY from `announced`, and that separation is the whole reason the prop
  // exists: the resting line is rendered as a sibling of the live region, so a restored solved board
  // shows its own sentence without a word of it entering a region nobody was watching at mount. It
  // is displaced by any message, because FloorBar draws it only while `message === ''`.
  const resting = solved ? SOLVED : INSTRUCTION

  return (
    // EXACTLY TWO SIBLINGS IN A FRAGMENT -- .lull-board and .lull-instrument -- because the frame
    // wraps them in a `display: contents` box and index.css orders them into bands with the shell's
    // hint bar between. Nothing here learns which band it landed in.
    <>
      {/* A named landmark rather than a heading: the board already sits under the page's h1, and a
          lone <h2> above it would buy a heading level for a word. The name is the TYPE, because a
          reader moving by landmark is choosing a band and not reading content. */}
      <section aria-label="Themed Anagrams" className="lull-board flex flex-col overflow-x-hidden">
        {/* Both facts are read off the puzzle's own data, which the shell cannot see. */}
        <p className={SIGN_ROW}>
          {/* `data` is JSON off the network that isValidPuzzle deliberately leaves opaque, so `theme`
              can be an object -- and an object rendered as a React child throws `Objects are not
              valid as a React child` DURING RENDER. ErrorBoundary catches it, which is worse than it
              sounds: one malformed field in one puzzle replaces the whole app with "Lull got stuck".
              One expression is the whole guard, and '' draws an empty sign row rather than a broken
              one -- the tally beside it is still true, and the four rows are still playable. */}
          <span className={THEME}>{typeof theme === 'string' ? theme : ''}</span>
          {/* Outside every live region, deliberately: it is the silent visual twin of the sentence
              the ribbon just said, so a session's worth of counting announces nothing. No special
              case at 4 of 4 -- a tally that turns into a sentence at the end is a second string to
              test, and the ribbon already says the win. */}
          <span className={TALLY}>{`${right} of 4 right`}</span>
        </p>

        {/* An <ol> so a reader is told there are four of these and which one they are in. No decimal
            markers: the box's own accessible name carries the ordinal, and two numbering systems on
            one line is what hint-bar's LIST comment warns about.

            role="list" is stated rather than left implicit, and it is not redundant in the browser
            this app has to work in: a list styled with `list-style: none` loses its list semantics in
            Safari with VoiceOver, which is exactly the styling a marker-less list gets. jsdom keeps
            the role either way, so the assertion below cannot tell you this -- the reason is here. */}
        <ol className={ROWS} role="list">
          {rows.map((entry, index) => (
            // Keyed by index because the array is a fixed four-tuple in wire order that this board
            // never sorts, filters or reorders -- the one case where an index key is stable.
            <li className={ROW} key={index}>
              {/* The visible run is aria-hidden and this element's NAME spells the letters out.
                  role="img" is right here and wrong on the cryptic bench one file over: a scramble is
                  word-shaped noise with a second encoding to translate, and a cryptic clue is a
                  grammatical sentence whose surface reading is the whole joke. */}
              <p aria-label={spellOut(entry.scramble)} className={SCRAMBLE} role="img">
                <span aria-hidden="true">{entry.scramble}</span>
              </p>
              <div className="flex items-center gap-[var(--lull-s3)]">
                {/* The label is a SIBLING, never a wrapper: sr-only hides its subtree, so a wrapping
                    label would take the box with it. htmlFor is the whole of the association. */}
                <label className="sr-only" htmlFor={boxId(index)}>{`Answer ${index + 1} of 4`}</label>
                {/* THE DESCRIPTION HAS TO BE TEXT, IN ITS OWN ELEMENT. Pointing aria-describedby at
                    the role="img" paragraph above -- whose aria-label already holds this exact
                    string -- computes to "" under this repo's dom-accessibility-api: a description is
                    resolved from the target's text CONTENT, and the visible run in that paragraph is
                    aria-hidden. The id would still resolve and every role query would still pass. The
                    same sentence appears twice, in two elements, because naming and describing are
                    separate computations with separate rules and one element cannot serve both.

                    AND IT IS aria-hidden, which is not the contradiction it looks like. A description
                    target is traversed by the accessible-description computation whether or not it is
                    hidden -- verified against this repo's dom-accessibility-api, which returns the
                    sentence either way. What aria-hidden removes is the SECOND reading: sr-only text
                    is still in the browse order, so without it a reader moving down the board hears
                    this sentence from the role="img" paragraph, again from this span, and a third time
                    when the box takes focus. Twelve utterances of four sentences. Hidden, the span
                    does the one job it exists for and nothing else. */}
                <span aria-hidden="true" className="sr-only" id={lettersId(index)}>
                  {spellOut(entry.scramble)}
                </span>
                <input
                  aria-describedby={lettersId(index)}
                  // Answers are conventionally written in caps and normalizeAnswer folds case anyway,
                  // so forced capitals on iOS only makes editing a mid-word typo worse. The rest is
                  // the credential-shape opt-out: four adjacent text inputs at the bottom of a
                  // viewport is the strongest form of that shape in the product, and these are the
                  // attributes 1Password, LastPass and Chrome's own heuristics honor.
                  autoCapitalize="none"
                  autoComplete="off"
                  autoCorrect="off"
                  className={BOX}
                  data-1p-ignore
                  data-form-type="other"
                  data-lpignore="true"
                  // Where the shell's keyboard mitigations do not land, the OS keyboard covers the
                  // floor and its own action key is the only control the player can reach. The
                  // handler below is what makes that key run Check; this is what names it, so the
                  // key reads "Go" rather than "Return".
                  enterKeyHint="go"
                  id={boxId(index)}
                  // The cap decode already enforces, said at the writer as well: a paste longer than
                  // this would otherwise be stored and then refused on the next load, and the
                  // player's four drafts would come back empty with nothing to explain it.
                  maxLength={MAX_GUESS}
                  // NO `name`. A named input is half of what a form autofill heuristic looks for, and
                  // nothing here submits anything.
                  onChange={(event) => change(index, event.target.value)}
                  // The composition guard is not defensive noise: an IME commit and an Android
                  // glide-typing commit both deliver Enter at a word boundary, so a handler reading
                  // only `event.key` checks the board in the middle of a word the player is still
                  // writing. The sibling bench has this deferred as its own commit; new code should
                  // not ship a defect that is already written down.
                  onKeyDown={(event) => !event.nativeEvent.isComposing && event.key === 'Enter' && check()}
                  // readOnly, NOT disabled. A solved row takes no more keystrokes, but a disabled
                  // input is dropped from the tab order and skipped by a screen reader's forms mode,
                  // so the word the player just won with would become unreachable and unreadable.
                  readOnly={rights[index]}
                  spellCheck={false}
                  type="text"
                  value={guesses[index]}
                />
                {rights[index] && (
                  <p className={CHIP}>
                    <span aria-hidden="true">✓</span>
                    {/* The word in its own element, so it can be found and asserted on its own rather
                        than through the glyph beside it. The glyph is decoration; this is the fact. */}
                    <span>Right</span>
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* The band class rides a wrapper rather than FloorBar itself because FloorBar takes no
          className -- children, message, resting and variant are the whole of its props, and this
          component may not edit it.

          `compact`, because this bench's instrument is one row: one control, under a ribbon that is
          the only live region on this bench. */}
      <div className="lull-instrument">
        <FloorBar message={announced} resting={resting} variant="compact">
          {/* The gutters are the band's, matching the rows above, so the control's right edge lines
              up with the boxes' right edge. `justify-end` because the control is alone in this row:
              the box it is about is on the board, which is the whole trade this bench makes. */}
          <div className="flex shrink-0 items-center justify-end pt-[var(--lull-s3)] pr-[var(--lull-gutter-right)] pl-[var(--lull-gutter-left)]">
            {/* variant="default", never floorPrimary. The accent is a scarce mark -- the spine pip,
                the selected cipher square, one primary action -- and this screen already spends it
                on the hint bar's spent rungs, which paint --lull-accent directly above this floor.

                keepsFocusOnPress: the composer contract exists so a press does not collapse the
                software keyboard over the field being typed in, and that is this bench's press even
                though the field is in the other band.

                TWO BUTTONS RATHER THAN ONE THAT CHANGES ITS MIND, because they do not do the same
                thing to the board -- but they are ONE ternary at ONE position, not two sibling
                conditionals. React keeps a stable element type at a stable position, so the node
                survives the swap and focus stays on the control the player just pressed; rebuilt
                instead, focus would drop to <body> and the next Tab would restart at the top of the
                page. The four BOXES are not swapped with them either: they hold the winning words,
                and one of them is the focused element at the moment of an in-session win.

                Play again takes no keepsFocusOnPress. The composer contract exists to hold a
                software keyboard open over a field being typed in; a solved board's four boxes are
                readOnly and there is nothing left to type. */}
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
