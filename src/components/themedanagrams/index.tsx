import { pinnedDisplay, pinnedIndices } from '@rules/hint-themed-anagrams'
import { normalizeAnswer } from '@rules/normalize-answer'
import React, { useEffect, useId, useRef, useState } from 'react'

import { isRight } from './answers'
import { decode, decodeHints, encode, Guesses, MAX_GUESS } from './progress'
import { Button } from '@components/button'
import { FloorBar } from '@components/floor-bar'
import { AnagramEntry, PuzzleComponentProps, ThemedAnagramsData } from '@types'

// THE ARRANGEMENTS A ROW CAN BE DRAWN IN, in wire order, or none at all if this board cannot draw
// the row. Every read of the letters on this bench goes through here.
//
// TWO SHAPES, AND BOTH ARE LIVE. lull-api now ships `scrambles`, a list of 1 to 4 that the reshuffle
// control cycles through; before that it shipped one `scramble`. The old shape is not history: it is
// what the deployed API answers with until the list change ships, and it is what every `lull:pack:`
// a device has already cached holds for as long as that pack is kept -- so it outlives the deploy
// rather than ending at it. A reader that took `scrambles` alone would refuse all four rows and draw
// a sign row over nothing, on a pack that is perfectly good.
//
// A SINGULAR ENTRY YIELDS A ONE-MEMBER LIST rather than a special case downstream, so exactly one
// thing in this file knows there were ever two shapes. It also lands in the state the new contract
// already has a rule for: length 1 means nothing to cycle to, and the control hides itself.
//
// THE LIST IS TAKEN AS GIVEN. It is never sorted, deduped, re-shuffled or extended here -- every
// member is separated from every other by a rule lull-api applied, and each was checked against the
// charged-string blocklist as a composed string. An arrangement this app invented would have passed
// neither gate, which is why this bench no longer permutes anything itself.
//
// EVERY MEMBER IS CHECKED, not just the first. `data` is opaque JSON, so `["ELKTET", 42]` is a list
// whose second press hands a number to spellOut and throws during render -- and the press that
// reaches it can be minutes after the mount that would have caught it.
const arrangementsOf = (entry: unknown): string[] => {
  // `typeof null` IS 'object', which is why the null clause is written out rather than assumed. A
  // pack can hold a null member -- JSON says so -- and without it the very next read is
  // `null.scrambles`.
  if (typeof entry !== 'object' || entry === null) {
    return []
  }

  const { scramble, scrambles } = entry as { scramble?: unknown; scrambles?: unknown }

  if (Array.isArray(scrambles)) {
    // An empty list is refused rather than falling through to `scramble`. The contract says there is
    // never a zero -- an entry that drew nothing costs the whole puzzle rather than shipping empty --
    // so a list that is present and empty is a malformed entry and not a legacy one.
    return scrambles.length > 0 && scrambles.every((run) => typeof run === 'string') ? scrambles : []
  }

  return typeof scramble === 'string' ? [scramble] : []
}

// A row this board can actually draw.
//
// STRUCTURAL, in isValidPuzzle's and hintsOf's spirit: it checks what this component DEREFERENCES
// and nothing else. The letters go to spellOut, which calls .split on them, so a non-string throws
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
// ASKED AS "does this row have letters to draw", which is one question rather than two. The null
// clause, the object clause and the string clause all live in `arrangementsOf` now, so there is no
// second place that can learn a different answer about the same entry -- and a row this refuses is
// exactly a row whose letters could not be read.
const isEntry = (entry: unknown): entry is AnagramEntry => arrangementsOf(entry).length > 0

// The win, and it is the COMPLETE news: it replaces the fourth row's own sentence rather than
// following it, because `SPATULA is right — 0 to go.` becomes false the instant this is true. It
// does not restate the four answers, which are standing in the four boxes the player is looking at.
const SOLVED = 'Solved. You got all four.'

// What a shuffle says, and it is said because a press that changes only the letters on the plate
// changes NOTHING a screen reader is watching: the four runs are inside role="img" elements whose
// names are re-computed silently, so without this sentence the control is a button that does
// nothing at all for the one reader who cannot check the plate.
//
// It reports the whole of what happened and claims nothing about the rows it left alone. A solved
// row keeps its letters -- see `reshuffle` -- and `Letters shuffled.` is still true of a board where
// three of the four moved, where `All the letters moved.` would not be.
const SHUFFLED = 'Letters shuffled.'

// The `d` of one path, stroked with no fill, like every other glyph in this product. A ring with a
// gap in the top right and an arrow turning clockwise out of it -- the refresh mark every player
// already knows, which is the whole reason this control can be an icon rather than a word.
//
// A 0 0 24 24 VIEWBOX DRAWN AT 18px, where the shelf's chips are a 12 box drawn at 12. The size is
// what the arrowhead needs: at a 16 box the head has about two units of run against a 1.5-unit
// stroke and renders as a blob with a ring behind it, which is what the first draft of this did.
// Rasterized and looked at, not reasoned about. 2/24 of 18px is 1.5px on screen -- the same hairline
// every other glyph here draws.
//
// TWO SUBPATHS IN ONE `d`, the way the shelf's state glyphs are written: the ring with its tangent
// tail, then the right-angle bracket that caps the tail. A BRACKET AND NOT A CHEVRON, because the
// chevron's two arms meet at a point that fills in at this weight while the bracket's meet at a
// corner that does not. The arc is a 300-degree sweep, which is why the large-arc flag is 1 -- at 0
// the same two endpoints describe the 60-degree stub the gap is cut out of, and the mark becomes a
// comma.
const REFRESH_GLYPH = 'M18.52 15.04A8 8 0 1 1 16.66 6.64L19.49 9.47M19.49 4.47v5h-5'

// THE STANDING LINE, and it is the one rule of this game nobody can guess on arrival -- the exact
// analog of the tile bench's left-to-right rule and the cipher bench's one-substitution rule. The
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

// The box's description: the letters, and which of them a rung has already put in place.
//
// THE SECOND SENTENCE IS NOT A REPEAT OF THE ROW ABOVE, and that is why it is here rather than left
// to the per-letter images. A reader who browses the row meets each letter and hears "revealed" on
// the pinned ones; a reader who tabs straight into the box meets only this string, and without the
// clause they would be told the letters and not which of them are true -- which is the entire thing
// the rung bought.
//
// It is silent when nothing is pinned, so an unhinted board's description is byte for byte what it
// always was.
const describeRow = (displayed: string, pinned: ReadonlySet<number>): string => {
  const revealed = [...displayed].filter((_letter, at) => pinned.has(at))
  if (revealed.length === 0) return spellOut(displayed)

  // `is`/`are` rather than a bracketed plural. This string is spoken, and "1 letter(s)" is a
  // sentence no reader should have to parse aloud.
  const verb = revealed.length === 1 ? 'is' : 'are'
  return `${spellOut(displayed)}. ${revealed.join(', ')} ${verb} revealed and in place.`
}

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

// A letter a rung pinned into its true position. WEIGHT AND AN UNDERLINE, never hue alone -- the
// same call the cipher bench makes for its revealed squares, and for the same WCAG 1.4.1 reason: the
// letters around it are already --lull-ink on --lull-plate, and a pinned tile told apart by which of
// two inks it draws is a tile nobody with a color vision deficiency can find.
//
// A RULE UNDER THE LETTER rather than a box around it. These runs are tracked at 0.28em and wrap on
// word boundaries; a border would give each pinned letter its own edge inside a line of loose
// letters and read as a second grid. An underline sits in the space the tracking already leaves and
// says "this one is fixed" without changing the line's rhythm.
//
// None of that is what carries the fact. The tile's accessible NAME says "S, revealed", so a reader
// who sees no rule at all is told plainly; the treatment here is for the player looking at the row.
// jsdom lays nothing out and style assertions are banned in this repo, so this string is carried by
// the device check and by this comment.
const PINNED = 'font-semibold underline decoration-2 underline-offset-4'

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
  const [guesses, setGuesses] = useState<Guesses>(() => decode(progress).guesses)

  // The arrangements each row can be drawn in, in wire order. Derived rather than stored, because
  // it is a read of the pack and the pack does not change under this component.
  const arrangements: string[][] = rows.map(arrangementsOf)

  // WHICH ARRANGEMENT EACH ROW IS SHOWING, which is a view of the pack and never a fact about the
  // puzzle. All at 0 on arrival, because `scrambles[0]` is the board as it first appears; a press
  // steps each row one along its own list and wraps.
  //
  // AN INDEX RATHER THAN THE STRING, and the difference is worth stating: an index cannot hold
  // letters the pack never shipped. The first version of this control permuted the run itself with
  // Fisher-Yates, which put an arrangement on screen that had passed none of lull-api's gates --
  // neither the difficulty dial nor the charged-string check, which is run over every member of the
  // composed list precisely because this button reaches all of them.
  //
  // DELIBERATELY NOT PERSISTED, and that is the design rather than a corner cut. Progress is the
  // player's WORK -- what they typed -- and which arrangement they pressed their way to is not work.
  // Storing it would put a display position in a key `decode` would then have to parse, and the
  // grammar there is four drafts and nothing else. So a walk away and back redraws `scrambles[0]`,
  // the board as the pack presents it.
  const [cursors, setCursors] = useState<number[]>(() => rows.map(() => 0))

  // The letters a row is showing. The cursor is only ever written modulo its own row's length, so
  // this is always in range and needs no fallback.
  const runOf = (index: number): string => arrangements[index][cursors[index]]

  // WHAT THE LADDER HAS PINNED, READ OFF THE LIVE `progress` PROP ON EVERY RENDER -- never off the
  // mount-time state above, and that is the whole of why a bought rung appears at once.
  //
  // The shell writes a purchase into this board's own progress string and then re-renders it with a
  // new `progress`. The four drafts were read in a lazy initializer at mount and have not moved, so
  // a board that took its pins from state would sell a rung, charge for it, and show nothing until
  // the player reloaded the page. Re-reading here is two `lastIndexOf` calls and a split of at most
  // a dozen characters, against a remount that would throw away everything typed but unsaved and
  // reset all four rows to `scrambles[0]`.
  //
  // THE BOARD READS THIS AND NEVER WRITES IT. `encode` still writes the four drafts and nothing
  // else, and PuzzleFrame re-attaches the tail through the adapter's `merge` -- so the board cannot
  // clobber a rung on its next keystroke, which is the failure the one-writer rule exists to make
  // unrepresentable. It knows nothing about hints beyond this list: no ladder, no count, no
  // sentence, no control.
  const spent = decodeHints(progress).hints

  // WHETHER THIS ROW CAN BE PINNED AT ALL, asked once so the two functions below cannot disagree.
  //
  // `answer` IS CHECKED HERE BECAUSE `isEntry` DELIBERATELY DOES NOT -- see its comment: a row with
  // an unusable answer still has to RENDER, or the guards that stop a blank answer winning the game
  // would have nothing left to be tested against. `pinnedDisplay` spreads the answer and returns a
  // run of the ANSWER'S length, so an absent one throws during render and a blank one would replace
  // the row's letters with nothing at all.
  //
  // THE LENGTH COMPARISON IS THE SECOND HALF and it is not belt and braces. lull-api proves every
  // scramble is a permutation of its answer at construction, but `data` is opaque JSON off the
  // network, so a pack CAN arrive with the two out of step -- and pinning would then quietly redraw
  // the row at the answer's length, adding or dropping tiles the player was counting.
  const canPin = (index: number): boolean => {
    const { answer } = rows[index]
    return typeof answer === 'string' && answer.length === runOf(index).length && answer.length > 0
  }

  // Which positions of a row's answer the ladder has handed over.
  const pinnedIn = (index: number): ReadonlySet<number> =>
    canPin(index) ? pinnedIndices(spent, index, rows[index].answer.length) : new Set<number>()

  // THE RUN AS IT IS DRAWN: revealed letters standing in their true positions, the rest filling the
  // gaps in the current scramble's own order, skipping one occurrence per pinned letter.
  //
  // TWO ALTERNATIVES WERE REJECTED AND ARE RECORDED HERE so the call site does not relitigate them,
  // with the reasons from `pinnedDisplay`'s own doc comment. RE-SHUFFLING THE UNPINNED REMAINDER
  // churns letters the player is actively reading, so the board would change more than the hint
  // justifies -- a rung that bought one fact must not move the other six tiles. CHOOSING A PRE-GATED
  // SCRAMBLE THAT ALREADY HAS THE LETTER IN PLACE cannot work at all: lull-api's severity dial
  // MINIMIZES positional agreement -- `maxSharedPositions` is `floor(length / 3)` -- so usually no
  // member of `scrambles` has the revealed letter where the answer wants it, and a row would
  // silently fail to pin with nothing to say why.
  //
  // A row with nothing pinned takes the same path rather than a branch around it: with an empty
  // pinned set the pool is the scramble in its own order and every position takes the next letter,
  // so `pinnedDisplay` is the identity there and one code path is one thing to reason about.
  const displayOf = (index: number): string =>
    canPin(index) ? pinnedDisplay(rows[index].answer, runOf(index), pinnedIn(index)) : runOf(index)

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
  // raises `onReset`, which the shell answers by writing `''` over the whole record -- taking the
  // rungs a player actually spent, on a board that never had a box to type in. THE STORE MOVED AND
  // THE HAZARD DID NOT: it used to be the shell's `removeHints` deleting `lull:hints:<puzzleId>`,
  // and it is now the ladder co-located in this board's own progress string. The shape that loses
  // something is still the same one, because `isEntry` here and `entriesOf` in ./hints.ts read
  // different fields -- four intact `answer`s beside malformed `scrambles` empty `rows` while the
  // adapter still builds a ladder, so there is a purchase with no board under it.
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
  //
  // THAT DISTINCTION IS NOW LOAD-BEARING RATHER THAN TIDY. The shell drops the ladder on `onReset`
  // and nowhere else, so the signal this handler withholds is the only thing standing between a
  // backspace and a lost purchase. Adding an `onReset()` here would empty the hint bar every time a
  // player cleared their last draft.
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
  // The last line is the half the board cannot do itself, and it is the WHOLE of how the ladder gets
  // thrown away. The rungs live in the progress string above, and the '' on the line before this one
  // does not clear them: the adapter's `merge` re-attaches the stored tail to every board write,
  // including this one, because it has to. What the shell does with this signal is write '' over the
  // whole record -- see `onReset` in puzzle-frame -- and `removeHints` beside it is a no-op on a key
  // nothing wrote. The signal also does the half a deletion never covers: it tells the MOUNTED hint
  // bar to shut its sheet and stop announcing yesterday's rungs.
  //
  // It still names an EVENT and lets the shell decide what it means. Naming the key, the route or
  // the component that answers for it would be the board reaching past the one thing it may say --
  // which is exactly why this line survives a change that moved the storage out from under it.
  //
  // IT CANNOT BE FOLDED INTO THE EMPTY PROGRESS STRING ABOVE, and that is now a correctness claim
  // rather than a preference. `encode` writes '' whenever every box is empty, which is also what a
  // player who backspaces their last draft produces -- so an adapter that read '' as "start over"
  // would charge them their spent rungs for a keystroke, which is the trap CLAUDE.md documents. It
  // used to be accepted here rather than solved, on the argument that keeping the ladder beside four
  // empty boxes would lie to `wasSolvedBefore` and the shelf. It would not: those flags mean "this
  // player has started this puzzle", and a player who has spent two hints on it has started it. This
  // line is what tells the two empties apart, and it is the reason the trap is closed.
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

  // The only press on this bench that touches neither the drafts nor storage.
  //
  // ONE STEP ALONG THE PACK'S OWN LIST, wrapping to the start after the last -- never a fifth
  // arrangement of this app's invention. Each row wraps on ITS OWN length, because the length varies
  // per entry: a board holding four and one is normal, and one press moves the first row to its
  // second arrangement while the second row stays where it is.
  //
  // IT NEVER CALLS onProgress, and that is the whole of "the new order is not saved". There is
  // nothing to write: the drafts are untouched, so the string the shell already holds is still
  // exactly right, and a call here would hand it an identical value and mark the puzzle started on a
  // board nobody has typed in.
  //
  // A ROW THAT IS ALREADY RIGHT KEEPS ITS LETTERS. The player finished it, the box is readOnly and
  // the chip beside it says so; moving the plate under a won row churns the one part of the board
  // they are done with, and for a moment it reads as though the row came undone. `rights` is this
  // render's, computed from the same `guesses` the updater is not touching, so the two cannot
  // disagree.
  //
  // A PINNED LETTER STAYS PUT ACROSS A SHUFFLE, and this function needs no line for it. The cursor
  // moves, `displayOf` recomputes from the new scramble, and `pinnedDisplay` puts the revealed
  // letters back at their true indices while the remainder fills the gaps in the new arrangement's
  // order. So the press cycles exactly what the player has left to work out and leaves what they
  // bought alone -- which is the property that would have been lost had the pinning been folded into
  // `cursors` instead of computed at draw time.
  const reshuffle = (): void => {
    setCursors((current) =>
      current.map((cursor, index) => (rights[index] ? cursor : (cursor + 1) % arrangements[index].length)),
    )
    say(SHUFFLED)
  }

  // WHETHER THERE IS ANYWHERE TO GO, which is the whole of when this control is offered. The
  // contract is explicit that a reshuffle hides itself at length 1 -- there is nothing to cycle to,
  // and a button that visibly does nothing reads as a bug in the app.
  //
  // Asked per row and only of the rows STILL IN PLAY, which subsumes the two guards this used to
  // carry separately. A board with no rows has nothing to ask about, and a solved board has no row
  // in play -- so neither `rows.length > 0` nor `!solved` has to be written out beside it, and there
  // is one condition rather than three that can disagree.
  const canReshuffle = rows.some((_entry, index) => !rights[index] && arrangements[index].length > 1)

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
          {/* The entry goes unread here because the letters come from `runOf(index)`, which resolves
              the row's cursor against its own list of arrangements. Still mapped over `rows` rather
              than over `arrangements`: `rows` is the guarded four-tuple, and a board that took its
              row count from anywhere else would draw whatever length that thing happened to hold. */}
          {rows.map((_entry, index) => (
            // Keyed by index because the array is a fixed four-tuple in wire order that this board
            // never sorts, filters or reorders -- the one case where an index key is stable.
            <li className={ROW} key={index}>
              {/* ONE role="img" PER LETTER **ONLY WHERE A RUNG HAS PINNED SOMETHING**, and one image
                  over the whole run everywhere else. A scramble is word-shaped noise with a second
                  encoding to translate -- that is why the letters are images at all, here and not on
                  the cryptic bench one file over, whose clue is a grammatical sentence with a surface
                  reading that is the whole joke.

                  The SPLIT is what the pinning bought. A pinned tile is a fact about ONE letter, and
                  the children of a role="img" are not exposed at all, so a single image could only
                  say it in prose -- which leaves "which letter is true" resolvable only by counting
                  along a sentence. Split, each letter names itself, a pinned one names itself as
                  revealed, the row reads "S revealed, O, W, H" letter by letter, and
                  `getByRole('img', { name: 'S, revealed' })` is an assertion about the accessibility
                  tree rather than about a class.

                  IT IS A COST WHERE THERE IS NOTHING TO PIN, which is why it is a branch rather than
                  the shape of every row. Splitting unconditionally put up to NINE image nodes per row
                  -- thirty-six on an untouched board -- where the reader used to meet four, one per
                  row, each spelling its letters in a breath. That is a browse order nine times longer
                  on the state a player is in before they have bought anything, to carry a distinction
                  that does not exist there. So a row with an empty pinned set keeps exactly the
                  markup it had before the ladder existed, and the box's own `aria-describedby` below
                  carries the letters either way.

                  Keyed by position because these are letters at fixed indices of a run this board
                  never sorts or filters -- the same case the row keys above are. */}
              {pinnedIn(index).size === 0 ? (
                <p aria-label={spellOut(displayOf(index))} className={SCRAMBLE} role="img">
                  <span aria-hidden="true">{displayOf(index)}</span>
                </p>
              ) : (
                <p className={SCRAMBLE}>
                  {[...displayOf(index)].map((letter, at) => (
                    <span
                      aria-label={pinnedIn(index).has(at) ? `${letter}, revealed` : letter}
                      className={pinnedIn(index).has(at) ? PINNED : undefined}
                      key={at}
                      role="img"
                    >
                      {letter}
                    </span>
                  ))}
                </p>
              )}
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
                  {describeRow(displayOf(index), pinnedIn(index))}
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
          {/* The gutters are the band's, matching the rows above, so the verdict control's right
              edge lines up with the boxes' right edge. `justify-end` because the row is packed to
              that edge: the boxes these controls are about are on the board, which is the whole
              trade this bench makes. */}
          <div className="flex shrink-0 items-center justify-end gap-[var(--lull-s3)] pt-[var(--lull-s3)] pr-[var(--lull-gutter-right)] pl-[var(--lull-gutter-left)]">
            {/* THE SHUFFLE, and it is a `{cond && ...}` slot rather than a third arm of the ternary
                below on purpose. JSX children are positional, so `false` occupies this slot when the
                board is solved and the verdict control keeps the index it has always had -- which is
                what the paragraph below is protecting, and what a control spliced into the list
                instead of blanked in place would quietly break.

                OFFERED ONLY WHEN THERE IS SOMEWHERE TO GO -- see `canReshuffle`, which asks the one
                question the other three conditions were approximations of. A solved board, a board
                with no rows, and a pack whose every entry shipped a single arrangement all answer it
                the same way, and the last of those is the shape on the network today.

                variant="default", never quiet. The floor is dark in BOTH themes and `quiet` is drawn
                in --lull-muted, which contrast.test.ts asserts is unreadable on the light floor -- it
                is the same trap the `floorPrimary` paragraph below describes from the other side.

                AN ICON WITH A NAME, never a bare glyph. WCAG 2.5.3 wants the name to be the words a
                speaking player would use, and "Shuffle letters" is what they would say; the path is
                aria-hidden decoration, exactly like the Right chip's tick on the board. Icon-only is
                what keeps the second control from reading as a second offer of equal weight beside
                Check -- the argument the button primitive's `quiet` variant makes, made with size
                here because the color it makes it with is not available on this band.

                keepsFocusOnPress for the reason Check has it: the player presses this while typing,
                and a press that collapsed the software keyboard would take the four rows they are
                reading with it. */}
            {canReshuffle && (
              <Button aria-label="Shuffle letters" className="shrink-0" keepsFocusOnPress onClick={reshuffle}>
                <svg
                  aria-hidden="true"
                  className="shrink-0"
                  fill="none"
                  height="18"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  width="18"
                >
                  <path d={REFRESH_GLYPH} />
                </svg>
              </Button>
            )}
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
