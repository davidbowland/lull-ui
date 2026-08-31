import React, { useEffect, useId, useRef, useState } from 'react'

import { Button } from '@components/button'
import { readHints, writeHints } from '@services/storage'
import { HintLadder } from '@types'

export interface HintBarProps {
  // Controlled mode, and ONE object rather than two optionals. A bar handed `opened` without
  // `onOpen` could not advance, and one handed `onOpen` without `opened` would report against a
  // count it does not hold. Two independent optionals make that a comment; one object makes it a
  // type error.
  //
  // IT WAS BUILT FOR THE goFigure BENCH and it now serves four callers, which is the test that the
  // seam was in the right place rather than a widening of it: PuzzleFrame builds a `control` for
  // every type carrying a registry hint adapter -- Cryptogram, Phrazle and Themed Anagrams -- and
  // HintBar needed no contract change to be told.
  //
  // What every controlled caller has in common is where the COUNT lives: in the board's own progress
  // string, beside whatever the rungs did, rather than in `lull:hints:<puzzleId>`. goFigure owns that
  // string itself, so handing the count down is also what keeps that subtree free of storage -- see
  // the derived `opened` below. The other three keep it there through PuzzleFrame and their adapter,
  // and the board is never told.
  //
  // "ITS RUNGS DO SOMETHING TO THE BOARD" IS NOT THE CONDITION, and Phrazle is the case that says so:
  // its rungs are sentences that touch no tile, no color and no row, and it is controlled anyway,
  // because its ladder is stored where its guesses are. Controlled means the count is somebody
  // else's. It says nothing about what a rung touches.
  control?: { onOpen: (nextOpened: number) => void; opened: number }
  hints: HintLadder
  puzzleId: string
  // A COUNT the shell raises when the player starts the puzzle over, not a boolean and not a
  // handler. The bar reads its stored count once, in a state initializer, and subscribes to
  // nothing -- which is right for its normal life and leaves it blind to a key the shell has just
  // deleted underneath it. This is how it is told.
  //
  // It counts rather than toggles because the same puzzle can be started over any number of times
  // in one sitting. A boolean would be `true` after the first Play again and `true` again after the
  // second, so the second reset would hand this component a prop it already holds, the effect below
  // would not run, and the ladder would sit where the player had just left it.
  //
  // Optional and 0 by default, so a bar whose caller has no reset to report never enters the effect
  // at all. THAT IS NOT THE SAME AS "NO SHELL BEHIND IT", and the controlled bar is the case that
  // proves it: goFigure passes `control` AND this together, because moving `control.opened` back to
  // zero leaves the SHEET standing -- an empty list drawn over a fresh board, with a keyboard that
  // declines every key -- and this signal is the only thing that shuts it from out there. PuzzleFrame
  // passes both as well, for the three adapter types and for the pack ones alike. Every caller in the
  // app is signaled; what the default covers is a caller with nothing to say.
  resetSignal?: number
  // The answer, composed by the CALLER and rendered verbatim -- the same contract `hint.text` has,
  // for the same reason. A phrase bench's answer is its phrase and goFigure's is an expression drawn
  // with × and ÷ rather than * and /, so the one thing they have in common is being a sentence
  // somebody else wrote. This bar renders one and derives neither.
  //
  // OPTIONAL, and its absence is a real state rather than a migration artifact: a bench with no
  // answer to give ends its ladder exactly where it always did, with the control turning into the
  // sheet's toggle. Nothing here invents a fallback.
  solution?: string
  // `docked` is the shell's own band between the board and the instrument, so it is a fixed strip
  // that neither gives nor takes a pixel. `inline` is for the tile bench, which has no band of its
  // own and sets the bar inside its own column. `bare` is for a bench that puts the bar in a row it
  // already owns: the control and the sheet, and nothing else at all.
  variant?: 'bare' | 'docked' | 'inline'
}

// The bar's footprint, and the only thing the variant changes. `lull-hintbar` is the band order the
// stylesheet declares, so the bar takes its place in the screen column by naming itself rather than
// by whatever wraps it.
const VARIANT = {
  // No band, no padding, no ground. The bar is a control sitting in someone else's row, so it
  // contributes nothing but the control and the sheet that control opens. `inline` was tried here
  // first and does not fit: its `py-2` makes 8 + 44 + 8 = 60px out of a 44px row, and its `px-4`
  // re-applies a gutter the row already carries.
  bare: '',
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
// of padding that leaves nothing at all -- so opening a hint relabeled the button, moved focus,
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

// FIXED, not absolute, and both halves of that matter. This is the sheet a `bare` bar opens, and a
// `bare` bar is anchored in a control row rather than in a band of its own -- which puts two
// overflow-y-auto ancestors above it, FloorBar's well and `.lull-board`. Either one clips an
// absolutely positioned box, so the sheet above would be cut off rather than drawn over the board,
// and there is no unclipped ancestor anywhere on that bench.
//
// Its horizontal offsets fail for a second and independent reason. An absolutely positioned box
// resolves them against the padding box of its positioned ancestor, which for a ~170px control
// yields a ~138px sheet tucked under Undo. Fixed resolves them against the viewport, so the page
// gutters mean the page gutters.
//
// The cost of `fixed`, stated rather than left to be found: the sheet no longer scrolls with the
// bench. The frame's column is `overflow-y-auto` under the ceiling index.css gives `.lull-bench`,
// so every viewport shorter than the bands it holds scrolls internally -- and a fixed sheet stays
// pinned to the viewport while the control that opened it moves. Scrolled away from the bottom,
// the sheet therefore hangs above the seam with its control somewhere else on the screen. That is
// the lesser of two evils by a wide margin, because the alternative is not "the sheet moves with
// the control" but "the sheet is clipped away entirely" -- there is no unclipped ancestor on that
// bench to be absolute inside of.
//
// Positioned off the SEAM PLUS THE INSET, and the second term is the whole correctness of the line.
// --lull-seam is the instrument's BUDGET, not its footprint: floor-bar sizes its band as
// `calc(var(--lull-seam) + env(safe-area-inset-bottom))`, and index.css records the rule that the
// inset is added to the seam and never taken out of it. So the floor's top edge sits at
// 240 + inset from the bottom of the viewport, and a sheet pinned at 248 sat 26px INSIDE the floor
// on any iPhone X-class device in portrait -- covering the top half of the 52px ribbon, which is
// the always-mounted live region the bench announces through. The claim two paragraphs up, that the
// sheet clears the instrument whatever happens to be in it, was the thing that was wrong.
//
// The clamp carries the same term for the same reason: without it the available height overstates
// the viewport by the inset, on exactly the devices that have one.
//
// The 140px floor is carried over from the docked clamp and is the same fix for the same bug:
// without it the height expression collapses to 14px on a 390dvh phone in landscape, and a
// component built to protect the seam silently displayed nothing. The docked clamp also subtracts a
// 60px band, which this path does not have, so the expression is rewritten rather than reused.
//
// One caveat, and it is a trap laid for the future rather than a live condition: a transformed
// ancestor contains a fixed box, so `position: fixed` inside one stops meaning "the viewport". No
// component applies `.lull-rise` today -- `grep -rn "lull-rise" src` comes back with the stylesheet
// and nothing else -- so nothing is currently animating a transform above this sheet. Do not put
// one there.
const SHEET_FIXED =
  'fixed right-[var(--lull-gutter-right)] left-[var(--lull-gutter-left)] ' +
  'bottom-[calc(var(--lull-seam)+env(safe-area-inset-bottom)+var(--lull-s2))] flex ' +
  'max-h-[clamp(140px,calc(100dvh-var(--lull-seam)-env(safe-area-inset-bottom)-var(--lull-s7)),420px)] ' +
  'flex-col gap-[var(--lull-s3)] overflow-y-auto rounded-[var(--lull-r-lg)] border border-[var(--lull-rule)] ' +
  'bg-[var(--lull-raised)] p-[var(--lull-s4)] shadow-[0_8px_28px_rgba(0,0,0,0.16)] dark:shadow-[0_8px_28px_rgba(0,0,0,0.55)]'

// `list-decimal` is a CROSS-REPO contract, not a styling choice, and it is the reason lull-api's
// goFigure copy says "the 2nd operator FROM THE LEFT" rather than just "the 2nd operator". That band
// orders its rungs by how much each reveals, so its positions come out 2, 1, 3 -- and rung 1 renders
// here beside a marker reading "1.", which is two numbering systems asserting different ordinals on
// one line. "From the left" anchors the ordinal to the BOARD so the marker can only be read as list
// position. Dropping the decimal marker because the numbers look redundant would silently make the
// upstream wording read as a non-sequitur.
const LIST = 'flex list-decimal flex-col gap-[var(--lull-s2)] pl-[var(--lull-s5)] text-[var(--lull-ink)]'

const SHEET_HEAD = 'flex items-center justify-between gap-[var(--lull-s3)]'

// A rung says which hints are spent, so it is drawn with the load-bearing boundary colors rather
// than with `--lull-hair`: hair is decoration and must never be the thing a state is read from.
// The color is not carrying the state alone either -- the control beside it counts the rungs out
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
//
// TWO STRINGS, NOT ONE, and the second one is arithmetic on the goFigure bench rather than anything
// about hints. Three controls share that bench's 44px row now -- Undo, Clear and this one -- and
// `gofigure/index.tsx` establishes 320px as a supported viewport, which leaves 288px to put them in.
// Undo (~72) plus Clear (~68) plus "Open hint 1 of 3" (~148) plus two 12px gaps is ~312. The row is
// `flex-wrap`, so it does not truncate, it WRAPS -- and a wrap adds 44 + 12 = 56px to a tray
// budgeted at 179px inside a 240px `--lull-seam`. The seam is the one invariant every bench in this
// app keeps, so the label is what has to give.
//
// It is this control and not Undo or Clear because this control is the only one of the three with a
// spare name to give. WCAG 2.5.3 requires the accessible name to CONTAIN the visible label, so the
// text that can be dropped from the screen is exactly the text that survives in the name: "Hint 1 of
// 3" is a substring of "Open hint 1 of 3" -- case aside, on which see the branch below -- while
// "Undo" is the whole of "Undo the last tile"'s
// visible half and has nowhere left to shrink to. Undo and Clear already pay nothing for their long
// forms -- those are `aria-label`s, and an `aria-label` costs no width at all.
//
// SHORTENED IN EVERY VARIANT, not only in `bare`, and this is a decision rather than a shortcut.
// `docked` and `inline` sit in bands with room to spare, so the width argument above does not reach
// them and a `variant` parameter here would have been easy to add. Three reasons not to:
//
// First, a label that depends on the layout is a label that says different words for the same state
// on two benches, and the bench whose words are wrong is then the bench whose tests do not cover
// them. `controlLabel` takes the ladder, the sheet and the count -- everything that can change what
// the control MEANS -- and nothing about where it is drawn. One code path is one set of words.
//
// Second, the shorter phrase is better copy on the phrase benches rather than merely narrower there.
// `docked` and `inline` draw a band whose visible label already reads "Hints", an inch from a
// control that used to read "Open hint 1 of 3" -- the word twice, in two type sizes, saying one
// thing. "Hint 1 of 3" beside a heading that says "Hints" reads as the pager it is.
//
// Third, the accessible name does not move. `Open hint 1 of 3`, `Show 2 hints` and `Hide hints` are
// exactly what they were, in every variant and both modes, which is why the four other suites that
// render this bar keep passing untouched -- every one of them finds this control by name. What
// changed is pixels, and pixels are what the seam is made of.
//
// The split is applied to EVERY state the function produces, so the control keeps one voice across
// a session instead of dropping its verb on one press and keeping it on the next. `Hide hints` is
// the state whose two halves come out the same string, and that is the split applied rather than the
// split skipped: there is no noun form that says what the press does. "Hints" would be a heading
// rather than a control, it would collide with the band's own visible "Hints" label on `docked`, and
// its case breaks 2.5.3's containment; "Hide" alone would put a second button reading exactly "Hide"
// an inch from the sheet's own, doing the same job. It is also ten characters against "Hint 1 of
// 3"'s eleven, so it never binds the row and has nothing to buy.
interface ControlLabel {
  // What a screen reader says. Always carries the verb, because a name that only counted rungs would
  // tell a reader what the control is ABOUT rather than what pressing it does.
  name: string
  // What the row draws. The count survives here rather than the verb, because the count is what this
  // file's WCAG 1.4.1 argument rests on -- the rung markers are aria-hidden scenery, so these words
  // are the only non-color carrier of how much of the ladder is spent.
  visible: string
}

const controlLabel = (hints: HintLadder, isOpen: boolean, opened: number, hasSolution: boolean): ControlLabel => {
  // THE ONE STATE WHOSE TWO HALVES ARE THE SAME STRING BY WIDTH RATHER THAN BY NECESSITY, unlike
  // "Hide hints" above it. There is a shorter noun -- "Answer" -- and it is not taken: at eleven
  // characters "Show answer" is exactly as wide as "Hint 1 of 3", which is the label the goFigure
  // row was measured against, so it buys nothing and costs the verb.
  //
  // It is returned from TWO states, and they are different presses saying one true thing. Shut and
  // already revealed, the press puts the sheet back up; open with every rung spent, the press spends
  // the reveal. Both end with the answer on screen, which is what the label promises and the only
  // thing this control has ever promised -- "the label always names what the press will DO".
  const revealed = hasSolution && opened > hints.length
  if (revealed && !isOpen) return { name: 'Show answer', visible: 'Show answer' }

  if (!isOpen && opened > 0) {
    // CLAMPED, and the clamp is defensive rather than load-bearing: the branch above catches every
    // revealed count this bar can produce. What it guards is a count of one past the ladder arriving
    // with no `solution` beside it -- a caller that dropped the prop but kept the stored count -- which
    // would otherwise paint "4 hints" over a ladder that has three.
    const spent = Math.min(opened, hints.length)
    const rungs = `${spent} hint${spent === 1 ? '' : 's'}`
    return { name: `Show ${rungs}`, visible: rungs }
  }
  // The shared half is the ORDINAL and not the word, so each form can start in its own register:
  // the name is a command and the visible label is a title. That leaves "Hint" capitalized on screen
  // and "hint" lowercase inside the name, which is a case difference rather than a containment
  // failure -- 2.5.3 matches without regard to case.
  //
  // NOTHING AUTOMATED CHECKS THAT, and nothing could: 2.5.3 is a relationship between two strings,
  // and a rule that has not been told which two are supposed to be related cannot tell a legitimate
  // pair from two unrelated labels. What holds the containment up is the paired assertions in
  // `describe('the control label')` -- each finds the control by its accessible name and then reads
  // what is painted, so the two cannot be checked against different buttons -- and this comment. Do
  // not add a state here without adding that pair.
  if (opened < hints.length) {
    const ordinal = `${opened + 1} of ${hints.length}`
    return { name: `Open hint ${ordinal}`, visible: `Hint ${ordinal}` }
  }
  // The ladder is spent and there is still something left to give, so the control offers it rather
  // than becoming a toggle. This is the state the reveal was built for: three rungs paid, the puzzle
  // still not seen, and -- before this -- nowhere left to go.
  if (hasSolution && !revealed) return { name: 'Show answer', visible: 'Show answer' }
  return { name: 'Hide hints', visible: 'Hide hints' }
}

/**
 * The ladder, rendered by the SHELL and never by a game component.
 *
 * IT DOES NOT KNOW WHERE A RUNG CAME FROM, and since 2026-08-31 half the catalog answers that
 * differently. Missing Vowels, Cryptic Clue and goFigure carry a ladder on the pack. Cryptogram,
 * Phrazle and Themed Anagrams compute theirs on the device, from vendored rules, against what the
 * player has already established -- because their rungs are about LETTERS rather than about what a
 * phrase MEANS, and a letter is worth nothing to a player who already holds it. That is precisely
 * why the first two changed: they used to take the shared phrase ladder, which is a hint aimed at a
 * different game. Missing Vowels is the one bench where that ladder was always the right one, and it
 * still gets it. This bar is handed an array either way and decides only WHEN a rung is shown.
 *
 * A BOARD NEVER WRITES THE HINT FIELD, AND TWO BOARDS READ IT. That is the rule `registry/index.ts`
 * and `puzzle-frame/index.tsx` both state, said here so this file agrees rather than inventing a
 * third phrasing: the shell is the only writer, and a board reads hint state exactly when a hint
 * changes what it DRAWS. Cryptogram locks a revealed letter into its grid and Themed Anagrams pins
 * letters into position, so both must; Phrazle's rungs move no tile and its board is handed no way
 * to. "A board that never learns hints exist cannot leak one" was the older and prettier promise,
 * and it is not the one this bar's callers keep.
 *
 * No time gate, no penalty, no cost. Rungs open in order because a ladder is only meaningful in
 * order. On a solved puzzle it renders exactly as it always does: the answer is already on screen,
 * so there is nothing left to protect.
 *
 * Opened rungs are drawn in a sheet that OVERLAYS the board rather than in a panel that shares the
 * column with it. The instrument sits `--lull-seam` up from the bottom edge on every bench, in
 * every state, and a hint that could push it down would break the one promise all four benches
 * make together.
 */
export const HintBar = ({
  control,
  hints,
  puzzleId,
  resetSignal = 0,
  solution,
  variant = 'docked',
}: HintBarProps): React.ReactNode => {
  // Read once, at mount. The frame keys the view on the puzzle id, so a different puzzle is a
  // different component rather than a prop change, and re-reading storage on every render would
  // hand this component back its own writes.
  //
  // NOT READ AT ALL when controlled, which is the ternary's whole job and not a micro-optimization,
  // and it now has two reasons rather than one. One controlled caller is the goFigure BOARD, and
  // `CLAUDE.md` says a puzzle component gets no storage -- a bar that read the count and then
  // discarded it would satisfy the behavior and quietly break the rule, so a test spies on
  // `readHints` rather than on the count. The other three are PuzzleFrame with an adapter in hand,
  // where the count is already in the board's progress string: a read here would be a second store
  // for one number, and the two can disagree.
  //
  // WHICH MODE A BAR IS IN IS FIXED FOR ITS LIFETIME, and nothing here enforces that. The
  // initializer closes over the first render's `control`, so a bar mounted controlled and then
  // handed `control === undefined` falls back to the sentinel 0 rather than to the player's stored
  // count, and the next press writes that zero over whatever they had paid for. The type permits
  // the switch and no runtime check forbids it; every caller in this repo passes `control` from a
  // literal that is present or absent for the whole mount. If a caller ever needs to change mode,
  // it must change the component's `key` instead -- a different mode is a different bar.
  const [storedOpened, setStoredOpened] = useState(() => (control ? 0 : readHints(puzzleId, hints.length)))

  // DERIVED PER RENDER, and deliberately not state. Threading `control.opened` through the lazy
  // initializer above is the obvious-looking version and is wrong in a way nothing else here would
  // catch: a lazy initializer runs exactly once, so the bar would freeze at whatever the owner held
  // at mount and never move again. `opened` is a prop when there is a controller and state when
  // there is not, which is the only arrangement under which both modes are actually correct.
  const opened = control?.opened ?? storedOpened

  // Open state is a VIEW concern and is never persisted at all: what is stored is the opened count
  // and only the opened count, so a closed sheet is not an unopened rung. WHERE that count is stored
  // is the caller's business and not this component's -- `lull:hints:<puzzleId>` when the bar is
  // uncontrolled, the board's own progress string when an owner holds it, in which case this file
  // writes no key of any kind.
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
  // The wrapper the `hidden` attribute lives on, so the reset effect below can ask whether focus is
  // about to be hidden rather than assume it. Nothing else needs it.
  const sheetRef = useRef<HTMLDivElement>(null)
  const labelId = useId()
  const sheetId = useId()

  // What a reset says out loud, and it is empty in every other state. See the render below for why
  // it is a piece of state rather than a constant the markup gates on `resetSignal`.
  const [announcement, setAnnouncement] = useState('')

  const isSpent = opened >= hints.length

  // The reveal has ITS OWN COUNT rather than a boolean beside the ladder's, and that is what makes
  // starting over work without a line of code: one number carries the rungs and the answer, so one
  // erasure takes both. A separate `revealed` flag would need its own store, its own reset and its
  // own validation, and could disagree with the count in a state no test would think to write.
  //
  // WHICH ERASURE depends on where the number lives, and both benches get the property for free. On
  // an uncontrolled bar the shell deletes `lull:hints:<puzzleId>` and the board writes ''. On a
  // controlled one the count is in the board's own progress string, so the board's `onProgress('')`
  // takes the rungs and the reveal together -- the adapter's `merge` answers a board write of '' with
  // '' -- and `removeHints` is a no-op on a key nothing wrote.
  const hasSolution = solution !== undefined
  const isRevealed = hasSolution && opened > hints.length

  // Computed once and destructured at the call site, rather than called twice in the markup. Two
  // calls would be two chances for the name and the visible text to be derived from different state
  // -- which is precisely the pairing WCAG 2.5.3 is about, and precisely the kind of drift no test
  // written against a single render would catch.
  const label = controlLabel(hints, isOpen, opened, hasSolution)

  // The label and the SECTION THAT NAMES ITSELF WITH IT go together, and taking one without the
  // other is the bug this pair exists to prevent. Dropping only the visible "Hints" text leaves
  // `aria-labelledby` pointing at an id no longer in the document -- an aria-valid-attr-value
  // violation -- and an unnamed region nested inside the region the host bench already declares.
  //
  // Nothing load-bearing goes with them. The rung markers are aria-hidden scenery, and this file's
  // WCAG 1.4.1 argument rests on the control's own label counting the rungs out in words, which
  // `bare` keeps unchanged.
  const isBare = variant === 'bare'
  const Frame = isBare ? 'div' : 'section'
  const frameProps = isBare ? {} : { 'aria-labelledby': labelId }

  const close = (): void => {
    // Focus first, then hide. React flushes the state change after this handler returns, so by the
    // time the sheet leaves the accessibility tree the focus it held has already moved somewhere
    // real (WCAG 2.4.3).
    controlRef.current?.querySelector('button')?.focus()
    setIsOpen(false)
  }

  // The player started the puzzle over. Everything this bar holds -- the count, the open sheet, the
  // drawn rungs -- goes back to what it was at mount.
  //
  // A SIGNAL AND AN EFFECT, not a changed `key` on this component, and the difference is focus. A
  // key that changes is React's instruction to destroy a subtree and build a new one, and React
  // ships no focus handling with that instruction: the focused element simply stops existing and
  // the browser falls back to <body>, from which the next Tab restarts at the top of the page. That
  // is the exact failure this file's `close` was written to avoid, and the remount reintroduced it
  // one component up. It was invisible in Chrome, which focuses a <button> when a pointer press
  // lands on it, so the press on the board's Play again had already taken focus off this bar --
  // Safari on macOS and iOS and Firefox on macOS do not, so a player who had reached the hint
  // control with the keyboard still held it when the board reset and lost it.
  //
  // Keeping the node also keeps the role="status" region below alive across the reset, which
  // matters on its own and is what makes the announcement possible at all: a live region inserted
  // into the document with its content already in it is routinely missed by NVDA and JAWS, which
  // announce changes inside a region they are ALREADY watching. A remount destroyed and rebuilt
  // that region every time, so anything it was given to say arrived in a region no reader had
  // subscribed to.
  //
  // Focus is moved only when the sheet is about to take it away, rather than unconditionally
  // through `close`. Unconditional is wrong in the ordinary case: the player pressed Play again on
  // the BOARD, and in Chrome that button now holds focus, so calling `close` here would yank focus
  // out of the board and into the hint bar for a press that had nothing to do with hints. The
  // condition is what makes this a rescue rather than a grab -- it fires only when the focused
  // element is inside the sheet that is about to be hidden.
  useEffect(() => {
    if (resetSignal === 0) return
    if (sheetRef.current?.contains(document.activeElement) === true) {
      controlRef.current?.querySelector('button')?.focus()
    }
    setIsOpen(false)
    // Harmless and skipped in controlled mode -- `opened` is read off the prop there -- and the
    // owner is the one that resets its own count. Written unconditionally because a branch here
    // would be a second statement of which mode this bar is in.
    setStoredOpened(0)
    setAnnouncement('Hints reset.')
  }, [resetSignal])

  const press = (): void => {
    // The reset has been read by now, so it stops being said. Left standing it would sit in the
    // live region beside the rung the player just opened, and a reader working through the region
    // would meet a sentence about a reset that happened two presses ago.
    setAnnouncement('')
    // Rungs already paid for come back first, and they come back free. The same branch is the
    // pointer dismissal's other half -- Escape was once the sheet's only exit, which on a touch
    // device is no exit at all.
    if (!isOpen && opened > 0) {
      setIsOpen(true)
      return
    }
    // Nothing left to reveal, so the control is the sheet's toggle. A control that only refuses is
    // not a control.
    //
    // "Nothing left" now means the ANSWER is gone too, not just the rungs. A bench with a solution
    // still standing falls through to the advance below, where one past the ladder is the reveal --
    // see `controlLabel`, whose "Show answer" state is exactly this gap.
    if (isSpent && (isRevealed || !hasSolution)) {
      close()
      return
    }
    // Reported or persisted, never both. A controlled bar owns no count, so it says what the next
    // one would be and lets the owner decide -- if the owner declines, the COUNT stays where it is,
    // which is the correct behavior and the reason the count is not mirrored locally.
    //
    // The sheet still opens, and that is deliberate rather than an oversight in the sentence above:
    // the sheet is a view concern in both modes and the owner is told the count and nothing else,
    // so it has no way to ask for a shut one. A declined press therefore opens a sheet with an
    // empty list in it -- which is why the sheet's header is gated on the sheet being open rather
    // than on there being a rung in it. See the render below: an open sheet always carries its own
    // Hide, so "the owner said no" is a sheet the player can close rather than a trap.
    const next = opened + 1
    if (control) {
      control.onOpen(next)
    } else {
      setStoredOpened(next)
      writeHints(puzzleId, next)
    }
    // Asking for a hint is asking to see it. A rung that opened inside a shut sheet would read as a
    // button that did nothing.
    setIsOpen(true)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'Escape' || !isOpen) return
    close()
  }

  return (
    <Frame
      // `relative` is what the DOCKED and INLINE sheet is measured against, so the overlay is
      // bounded by this bar's top edge rather than by whatever the frame happens to wrap it in. It
      // does nothing for `bare`, whose sheet is fixed and therefore measured against the viewport --
      // harmless there, and cheaper to keep than to make conditional on nothing.
      className={`relative flex items-center ${VARIANT[variant]}`}
      onKeyDown={handleKeyDown}
      {...frameProps}
    >
      {/* The live region wraps the list rather than duplicating its newest entry, so a screen
          reader announces only the rung that just appeared. `aria-atomic="false"` is what makes
          that true and is not optional: role="status" carries an implicit aria-atomic="true" in
          ARIA 1.2, and under it opening rung 3 re-reads rungs 1 and 2 with it. Mounted empty on
          EVERY first render, not merely on a fresh puzzle: a role="status" element inserted with its
          content already in it is routinely missed by NVDA and JAWS, which announce changes inside a
          region they are already watching. It therefore sits OUTSIDE everything that can be hidden.

          "Empty" is a property of three separate things arriving at nothing together, and each one
          is gated where it is drawn rather than here: the reset line needs a signal, and the sheet's
          header and its rung list both need an open sheet, which the bar never is on a first render.
          The last of those was the returning player's bug -- `hidden` does not empty a subtree, so a
          stored count of 2 put two <li> in this region before any reader was watching it.

          The sheet's own Hide control is inside it, and that is a change with a cost that was
          weighed rather than missed: the first reveal now reads "Hints, Hide, <rung 1>" instead of
          just the rung. Every LATER rung is unaffected, because aria-atomic="false" announces only
          the nodes that changed and the header is static. The alternative was a sheet a touch-only
          player could not close without spending every remaining hint, which is a worse thing to
          have and a worse thing to say.

          Zero-size in flow, so it can sit in the row without spacing it. */}
      <div aria-atomic="false" role="status">
        {/* What a reset sounds like, and without it a reset sounded like nothing at all: the
            focused button is silently renamed from "Open hint 2 of 3" back to "Open hint 1 of 3"
            and screen readers do not re-read a focused element when its label changes, the rung
            markers are aria-hidden scenery, and the sheet just vanishes. A player who pressed Play
            again heard the board's own news and nothing about the ladder.

            It can only be said here because the reset no longer remounts this component. The region
            above outlives the reset now, so a reader is already watching it when this line arrives
            -- which is the whole difference between an announcement and a node inserted into a
            region nobody subscribed to.

            KEYED ON THE SIGNAL, which is what makes a second reset audible. The text is the same
            every time, so re-rendering the same node with the same string is not a change and
            announces nothing; a new key makes React remove the node and insert a fresh one, and an
            inserted node is exactly what aria-atomic="false" reads out. It is a piece of state
            rather than markup gated on `resetSignal` directly so that the next press can take it
            back down -- see `press`.

            sr-only rather than visible: the bar is a 60px band with a name, three rung markers and
            a control in it, and there is no room for a sentence that is only true for one press. */}
        {announcement !== '' && (
          <p className="sr-only" key={resetSignal}>
            {announcement}
          </p>
        )}
        {/* The hide is an undecorated wrapper, NOT the sheet. Tailwind v4's preflight ships
            `[hidden]:where(:not([hidden="until-found"]))` with `display: none !important`, which
            would in fact outrank the sheet's own `flex` -- but a base-layer reset is not where a
            correctness guarantee belongs, and this wrapper carries no display utility, so the
            attribute stands on its own. */}
        <div hidden={!isOpen} id={sheetId} ref={sheetRef}>
          {/* Focusable because it scrolls and every rung inside it is plain text: a scrollable
              region with no focusable descendant cannot be scrolled from the keyboard at all. No
              static rule finds this under jsdom -- nothing is laid out, so scrollHeight is always 0
              and the box never reports itself as scrollable. What guards it is a test that tabs
              backwards from the control and expects to land here; see "is reachable from the
              keyboard, so a player can scroll it". */}
          <section aria-label="Open hints" className={isBare ? SHEET_FIXED : SHEET} tabIndex={0}>
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

                GATED ON THE SHEET BEING OPEN, not on there being a rung in it, and the difference
                is a trap rather than a tidiness. `press` opens the sheet whether or not the count
                moved, and a controlled owner is allowed to decline -- goFigure is exactly the owner
                with reason to, since a solved board or a locked slot has nothing left to give. Under
                `opened > 0` that press drew a sheet over the board with an empty list in it and NO
                Hide button, and pressing again re-entered the same branch. Escape was the only exit
                and a touch device does not have one: the same trap this header was added to fix,
                reachable from the other side. Gating on `isOpen` makes "the sheet is open" and "the
                sheet can be closed" one condition, so the two cannot come apart again.

                The gate it replaced was there to keep the live region EMPTY at mount, and `isOpen`
                keeps that for the same case and strictly better: the sheet is shut on the first
                render in every variant and both modes, so this header can never be in the region
                when it is inserted. The list below now carries the same gate, for the same reason
                -- see its own comment. */}
            {isOpen && (
              <div className={SHEET_HEAD}>
                <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--lull-muted)] uppercase">Hints</p>
                <Button onClick={close} size="sm" variant="quiet">
                  Hide
                </Button>
              </div>
            )}
            {/* `hint.text` is rendered VERBATIM and nothing here derives a word of it. A rung is
                authored by whoever built the ladder, which is also the only place that knows what a
                rung is allowed to give away -- lull-api for the three types that carry one on the
                pack, and the type's own registry adapter over a vendored rule for the three that
                compute theirs on the device. This bar decides when a rung is shown, never what it
                says, and it cannot tell the two authors apart.

                KEYED BY INDEX, which is correct here for the reason index keys are usually wrong
                elsewhere. A key has to be stable for the thing it identifies, and the failure mode
                of an index is a list that is reordered, inserted into or filtered, where position i
                stops naming the same item and React reuses the wrong node. This list can do none of
                those: it is `hints.slice(0, opened)` over a fixed array, `opened` only ever climbs,
                and a rung's position in the ladder IS its identity -- the decimal marker beside it
                says so. Position i names rung i for the life of the mount, so an index is not a
                stand-in for identity here, it is the identity.

                IT USED TO BE KEYED ON THE TEXT, and that rested on a guarantee that has stopped
                covering the catalog. lull-api rejects any phrase whose three hints collapse to fewer
                than three distinct strings and builds each goFigure rung off a distinct ordinal over
                a permutation of slots 0 1 2 -- so a duplicate rung was a bug in the pack, not a state
                this list had to survive, and nothing in this repo re-checked it. Since 2026-08-31
                three of the six types never send their rungs through lull-api at all: Cryptogram,
                Phrazle and Themed Anagrams compute theirs on the device, so that warrant covers half
                the benches and nothing on-device replaces it.

                The three builders cannot produce a duplicate today -- each ladder draws at most one
                rung of each kind and each kind composes its own sentence frame, and the two cipher
                letters a cryptogram ladder can name are drawn from a pool the first has already left
                -- but no decoder rejects one. A hand-edited progress string naming the same kind
                twice reaches this list, because a stored ladder is untrusted input everywhere else in
                this file's neighborhood and is treated as such. So the key stops resting on anybody's
                promise about the text and rests on the shape of the list instead.

                WHAT A DUPLICATE KEY WOULD HAVE COST IS NOT A CRASH, which is worth saying because it
                is what made the old key survivable for so long: React answers two children under one
                key with a console warning saying non-unique keys may cause children to be duplicated
                and/or omitted, and on this path it happens to render both. Undefined behavior behind
                a warning nobody reads is a worse thing to ship than a visible break, and it is the
                reason the row that pins this asserts the LADDER -- see "says one thing twice" in the
                suite -- rather than asserting anything about the key.

                GATED ON THE SHEET BEING OPEN, like the header above, and this gate is about the
                live region rather than about the sheet. `hidden` does not empty a subtree: it takes
                the sheet out of the accessibility tree and leaves every node inside it in the
                document. So a returning player whose stored count is 2 used to mount two <li>
                already inside the role="status" region -- which is the exact arrangement this file
                documents NVDA and JAWS as missing, since they announce changes inside a region they
                are ALREADY watching and a region that arrives with its content in it has nothing to
                change. The first rung that player opened was therefore announced into a region no
                reader had subscribed to, and the players it hit are the ones most likely to open a
                rung: the ones who already know where the ladder is.

                It changes what the sheet HOLDS, not what it says. The rungs behind `hidden` were
                already invisible and already unreachable, so nothing a player can see or hear
                changes except the announcement that now lands.

                The <ol> goes rather than only its children, and the difference is not cosmetic. An
                empty <ol> left standing would be an inserted list of no items at the moment the
                sheet opens -- and the reason the header is inside the live region at all is that
                aria-atomic="false" reads the nodes that CHANGED. A list element appearing and then
                filling is two changes where the player asked for one. */}
            {isOpen && (
              <ol className={LIST}>
                {hints.slice(0, opened).map((hint, index) => (
                  <li key={index}>{hint.text}</li>
                ))}
              </ol>
            )}
            {/* OUTSIDE the list, and that is a statement about what this is rather than a layout
                choice. The <ol> is the ladder -- whoever builds one orders its rungs by how much each
                reveals, lull-api on the pack benches and the type's own builder on the three that
                compute theirs, and the decimal markers beside them are that order made visible. An
                answer appended as a fourth <li> would be numbered "4." by the marker and read as the
                next rung in a ladder that has three -- or in one that has two, which the adapter
                benches and Cryptic Clue both legitimately ship.

                It carries the same VERBATIM contract as a rung: the caller composed the sentence,
                including whether it hedges. goFigure's must, because its ladder pins an operator
                tuple and not an expression -- many accepted solutions share that tuple -- so the
                bench that knows which says so, and this bar says nothing at all.

                GATED ON THE SHEET BEING OPEN, like the header and the list, and for the same live
                region reason: `hidden` takes the sheet out of the accessibility tree and leaves
                everything inside it in the document, so a returning player whose stored count is the
                revealed one would mount this paragraph already inside the role="status" region --
                the arrangement NVDA and JAWS are documented to miss, since they announce changes
                inside a region they are ALREADY watching.

                A <p> and not a heading, for the reason the sheet's own label is one: the heading
                levels on screen belong to the shell, and a heading here would either skip a level or
                claim one it does not own. */}
            {isOpen && isRevealed && (
              <p className="border-t border-[var(--lull-rule)] pt-[var(--lull-s3)] text-[var(--lull-ink)]">
                {solution}
              </p>
            )}
          </section>
        </div>
      </div>

      {/* The band's own furniture: the name it goes by and the markers that show what is spent.
          Gated together with the <section> above, because the `id` this label carries is the thing
          that section names itself with -- keeping one without the other leaves a dangling
          aria-labelledby, which is why the pair is decided once, in `isBare`, rather than twice
          here. */}
      {!isBare && (
        <div className="mr-auto flex flex-col gap-[var(--lull-s1)]">
          <span className="text-[11px] font-semibold tracking-[0.14em] text-[var(--lull-muted)] uppercase" id={labelId}>
            Hints
          </span>
          {/* Scenery. The control's own label counts the rungs out in words, so nothing here is the
              only carrier of anything.

              Keyed by INDEX, the same as the sheet's list above and for a stronger version of the
              same reason: these markers carry no identity at all -- they are three positions that
              fill in, not three rungs. Keying them on rung text would hand React duplicate keys on a
              list it reconciles every time `opened` changes, and the failure mode there is a stale or
              missing marker rather than a console warning. */}
          <span aria-hidden="true" className="flex gap-[3px]">
            {hints.map((_hint, index) => (
              <span
                className={`${RUNG} ${index < opened ? 'border-[var(--lull-accent)] bg-[var(--lull-accent)]' : 'bg-[var(--lull-hair)]'}`}
                key={index}
              />
            ))}
          </span>
        </div>
      )}

      {/* Never unmounted and never `disabled`: a browser blurs a disabled element, focus falls to
          <body>, and the next Tab restarts at the top of the page. It is no longer aria-disabled
          either -- spending the last rung turns it into the sheet's toggle rather than into a
          control that says "All hints open" and does nothing.

          aria-expanded and aria-controls are what let a screen reader user know the sheet is a
          thing this button opens and closes, which is the relationship the old flowed drawer
          carried and the first version of this bar dropped. */}
      <span ref={controlRef}>
        <Button aria-controls={sheetId} aria-expanded={isOpen} aria-label={label.name} onClick={press} size="sm">
          {label.visible}
        </Button>
      </span>
    </Frame>
  )
}
