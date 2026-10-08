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
  // "This bar just sold the answer." Fired on the press that carries `opened` past the ladder, and on
  // no other press, so a caller can put the finished board on screen instead of leaving the player to
  // copy the answer out of the sheet.
  //
  // UNCONTROLLED CALLERS ONLY, AND THAT ASYMMETRY IS THE POINT rather than an omission. A controlled
  // owner is handed the next count through `control.onOpen` and is ALLOWED TO DECLINE -- the count
  // then stays where it is, which this file documents and goFigure relies on. This bar cannot see a
  // decline, so a signal fired from here would tell an owner the answer was sold on a press the owner
  // itself refused. An owner already knows: it holds the ladder, it holds the count, and it is the one
  // that said yes. So it detects its own reveal inside `onOpen`, and this exists for the bar that owns
  // the count -- where the write has already happened by the time it fires, and there is nothing left
  // to refuse.
  //
  // It carries no argument and names no destination, which is the line `onReset` drew on
  // `PuzzleComponentProps` and the same line this stays on: the caller learns THAT the answer went
  // out, never what it was or where to put it.
  onReveal?: () => void
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
  // `sign` is the shell's: the control laid over the right end of the board's sign row, from the
  // hint dock puzzle-frame renders above the board, with a sheet that drops from that row over the
  // board. `bare` is for a bench that puts the bar in a row it already owns -- goFigure's tray: the
  // control and the sheet, and nothing else at all.
  //
  // `docked` and `inline` are gone. `docked` was a 60px band between the board and the instrument,
  // and the band was the cost the larger-window cut removed; `inline` had no caller left in the app,
  // and with `docked` gone it would have been the only reader of a sheet sized for that band.
  variant?: 'bare' | 'sign'
}

// The bar's footprint, and the only thing the variant changes.
const VARIANT = {
  // No band, no padding, no ground. The bar is a control sitting in someone else's row, so it
  // contributes nothing but the control and the sheet that control opens. `relative` does nothing
  // here -- the bare sheet is fixed and measured against the viewport -- and is kept because it has
  // always been on this root and costs nothing.
  bare: 'relative flex items-center',
  // IN FLOW AND NOT POSITIONED, and the second half is load-bearing. The root spans the dock's full
  // width at zero height and puts the control at its right end, one pixel down so it sits inside
  // the sign row's top hairline rather than on it. Because neither this root nor anything between it
  // and the sheet is positioned, the sheet's containing block is the DOCK, which spans the bench --
  // an absolutely positioned root would itself become the containing block and shrink the sheet to
  // the control's 116px. `overflow-visible` because the control is taller than a zero-height box.
  sign: 'flex h-0 items-start justify-end overflow-visible pt-px pr-[var(--lull-gutter-right)]',
} as const

// THE SHEET IS A POPUP, and both variants share everything about it but where it is anchored. It
// used to be a plate laid over the board and nothing more: the same raised ground as the board under
// it, a quiet "Hide" in its corner, and nothing marking the board as covered. Players kept typing
// into a board they could no longer see, and were refused in a ribbon they were not looking at. Now
// a scrim (SCRIM below) dims the whole bench while it is open, this surface carries the dark shadow
// in both themes so it lifts off the scrim as a separate object, and its corner holds a bordered
// Close button with an X.
//
// The border is --lull-rule, the boundary token, because over the scrim this card IS the thing a
// player has to find the edge of.
const SHEET_SURFACE =
  'flex flex-col gap-[var(--lull-s3)] overflow-y-auto rounded-[var(--lull-r-lg)] border border-[var(--lull-rule)] ' +
  'bg-[var(--lull-raised)] p-[var(--lull-s4)] shadow-[0_8px_28px_rgba(0,0,0,0.55)]'

// The sheet a `sign` bar opens: dropped from the sign row, out of flow, so no length of hint text can
// move anything -- not the board, not the seam.
//
// ANCHORED TO THE DOCK, which is the positioned box this sheet resolves against (see `sign` above).
// The dock and the sign row start at the same y and stick together, so `top: 46px + s2` is the sign
// row's bottom edge plus a margin, at every scroll position.
//
// Inset by the GUTTER, not by `inset-x-0`. Under `inset-x-0` a rounded, bordered, shadowed card has
// its corners cut off flat by the screen edge, and in landscape on a notched phone it runs under the
// cutout, since the instrument is the only band that re-applies env(safe-area-inset-*).
//
// THE HEIGHT BOUND IS THE SCREEN BELOW THE SIGN ROW, and the seam is no longer in it. It used to be
// the BOARD's height below the sign row -- the bench less the crown, the sign row, the 240px seam
// and the inset, clamped between 140 and 420 -- because the sheet was a plate on the board and the
// keypad was still live beside it. On a 495px phone that calc came to about 45px, the 140px floor
// won, and the sheet scrolled inside itself with rung 3 cut off and its bottom edge on the keypad.
// The sheet is modal now: the scrim covers the keypad and nothing under it takes a press, so there is
// nothing left down there for it to stay off. What it must still clear is the crown, worst case
// (on screen, which is how every bench opens), the sign row it drops from, its top margin, and a
// --lull-s4 of air above the bottom of the bench: 712px → 542, 495px → 317. Three rungs and an
// answer measure about 200-250 at 375px wide.
//
// `overflow-y: auto` stays only as the last resort, for content taller than the screen -- a writing
// bench with the software keyboard up -- and no floor or ceiling clamps it any more. A negative calc
// (a landscape phone with the keyboard up) resolves to 0 rather than invalidating the declaration.
//
// `z-2` ranks it inside the dock, above the scrim's `z-1` and below the control's `z-3`; the dock's
// own `z-index: 2` is what puts all three over the sign row and the instrument. index.css holds the
// scale.
const SHEET_DROP =
  'absolute top-[calc(46px+var(--lull-s2))] right-[var(--lull-gutter-right)] left-[var(--lull-gutter-left)] z-2 ' +
  'max-h-[calc(var(--lull-bench-h)-var(--lull-crown)-46px-var(--lull-s2)-var(--lull-s4))] ' +
  SHEET_SURFACE

// THE SCRIM: the whole bench dimmed while the sheet is open, so the board reads as covered rather
// than as something still waiting for a key. Fixed to the viewport, so it covers the crown, the board,
// the ribbon and the keypad whichever band this bar happens to be mounted in.
//
// It takes the press, and that is half its job. A tap that lands on it shuts the sheet and reaches
// nothing underneath -- the scrim is on top, so it is the element hit, and no key, square or tile
// below it ever sees the event. It shuts on `click` and not on `pointerdown`: unmounting the scrim on
// the down would leave the up and the click to land on whatever was under the finger, which on a
// phone is a key of the pad. `pointerdown` is still canceled, so the press moves no focus on the way.
//
// aria-hidden and unfocusable: it carries no text and no role, and a reader dismisses the sheet
// through the Close button or Escape, which the scrim only duplicates for a pointer.
//
// --lull-scrim is the dark ground at 55% in BOTH themes, so a light board reads as covered too.
// `z-1` ranks it under the sheet and the control in whichever stacking context this bar sits in --
// the dock on a `sign` bench, the instrument on goFigure.
const SCRIM = 'fixed inset-0 z-1 bg-[var(--lull-scrim)]'

// THE CONTROL RIDES ABOVE THE SCRIM, so the button that opened the popup is still there to press --
// it buys the next rung, or shuts the sheet when nothing is left -- and reads as "on" while it is.
// Positioned so its `z-3` applies; on the `sign` bar it is the SPAN that is positioned and never the
// root, whose absence of `relative` is what makes the dock the sheet's containing block.
const CONTROL_LAYER = 'relative z-3'

// The Close button's mark: two strokes, drawn in the button's own ink. Hidden from the name, which
// is the button's "Close hints"; nobody says "Close X".
const CloseMark = (): React.ReactNode => (
  <svg
    aria-hidden="true"
    className="shrink-0"
    fill="none"
    height="16"
    stroke="currentColor"
    strokeLinecap="round"
    strokeWidth="1.75"
    viewBox="0 0 16 16"
    width="16"
  >
    <path d="m4 4 8 8M12 4l-8 8" />
  </svg>
)

// THE SIGN CONTROL IS TWO BOXES: a 44px TARGET a thumb can find (WCAG 2.5.5), and a 32px PILL inside
// it that is all a player sees. One 44px pill filled the 46px sign row hairline to hairline, and the
// focus ring -- 2px at a 3px offset, index.css's `:focus-visible` -- reached 5px past it, so with the
// row stuck at the top of the bench the scroller cut the ring's top edge off. The pill is centered
// in the target, which the root's `pt-px` sets 1px down inside the row's top hairline: pill at
// 7-39px of the row, ring at 2-44px, inside both hairlines with a pixel to spare.
//
// So the RING MOVES TO THE PILL. The button's own outline is turned off by `.lull-hint-target` in
// index.css -- NOT by a `focus-visible:outline-none` utility, which was tried and drew two rings.
// index.css's `:focus-visible` is unlayered and every utility lives in `@layer utilities`, and an
// unlayered rule beats a layered one whatever the specificity, so the utility never applied; the
// override has to be unlayered too. The pill draws the same ring when the button holds focus,
// through `group-focus-visible:` (no unlayered rule targets the pill, so that utility applies). The accent is the ring's own color,
// restated: the sign row is a light surface, not the floor, so index.css's floor override does not
// apply here either way.
//
// A native <button> rather than the shared Button, because the target is transparent and the face
// is the pill, and Button draws its face on the element that takes the press. Giving every Button
// caller a second box to fix one row would be the wider change for the narrower problem. The pill
// RESTATES Button's `default` variant at `sm` -- border, ground, inset light, 13.5px semibold, px-3,
// the press scale and its easing -- so a change to that face has to be made here too.
//
// The target's width is --lull-hint-w, so the row can reserve exactly that much: index.css pads
// `.lull-bench[data-hint-dock] .lull-signrow` by the same token. The pill spans it, and its ring's
// 5px overhang falls in the gutter on the right and the reserve's --lull-s3 on the left. Centered
// because the labels vary in length inside a box that does not.
const SIGN_TARGET = 'lull-hint-target group flex h-11 w-[var(--lull-hint-w)] cursor-pointer items-center'
const SIGN_PILL =
  'flex h-8 w-full items-center justify-center rounded-[var(--lull-pill)] border border-[var(--lull-rule)] ' +
  'bg-[var(--lull-raised)] px-[var(--lull-s3)] text-[13.5px] font-semibold text-[var(--lull-ink)] ' +
  'shadow-[inset_0_1px_1px_rgba(255,255,255,0.55)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.09)] ' +
  'transition-transform duration-[380ms] ease-[cubic-bezier(0.22,0.68,0.12,1)] group-active:scale-[0.98] ' +
  'group-focus-visible:outline-2 group-focus-visible:outline-offset-[3px] group-focus-visible:outline-[var(--lull-accent)] ' +
  // PRESSED WHILE THE SHEET IS OPEN, read off the target's own `aria-expanded` so the face and what a
  // reader is told cannot disagree. Ink ground and plate text, an existing high-contrast pair in both
  // themes, so above the scrim the control reads as the thing that is "on".
  'group-aria-expanded:border-[var(--lull-ink)] group-aria-expanded:bg-[var(--lull-ink)] ' +
  'group-aria-expanded:text-[var(--lull-plate)] group-aria-expanded:shadow-none'

// The same pressed state on goFigure's control, which is the shared Button and sits on the FLOOR --
// dark in both themes. Ink on the floor would be a near-black pill on near-black ground in the light
// theme, and floor-ink is the unpressed face's own near-white there, so neither reads as a change.
// The floor's accent pair (floorPrimary's, 7.07:1 light and 8.78:1 dark) differs from the unpressed
// face in both themes.
const BARE_PRESSED =
  'aria-expanded:border-[var(--lull-floor-accent)] aria-expanded:bg-[var(--lull-floor-accent)] ' +
  'aria-expanded:text-[var(--lull-floor)] aria-expanded:shadow-none'

// FIXED, not absolute, and both halves of that matter. This is the sheet a `bare` bar opens, and a
// `bare` bar is anchored in a control row rather than in a band of its own -- which puts it inside
// FloorBar's overflow-y-auto well and, above that, the bench, which is the column's one scroller.
// Either one clips an absolutely positioned box, so the sheet above would be cut off rather than
// drawn over the board, and there is no unclipped ancestor anywhere on that bench.
//
// Its horizontal offsets fail for a second and independent reason. An absolutely positioned box
// resolves them against the padding box of its positioned ancestor, which for a ~170px control
// yields a ~138px sheet tucked under Undo. Fixed resolves them against the viewport, so the page
// gutters mean the page gutters.
//
// ANCHORED NEAR THE TOP, like SHEET_DROP, rather than above the tray as it used to be. Pinned to the
// seam, the sheet could only grow upward into whatever the board left above the 240px instrument --
// about 200px on a 495px phone, which is less than three rungs and an expression need -- and it
// scrolled inside itself. With the scrim over the tray there is no reason left to keep off it, so
// the sheet starts a --lull-s2 under the crown (worst case: the crown on screen, which is how the
// bench opens) and may grow down to a --lull-s4 above the bottom inset: 712px -> 572, 495px -> 355.
// It overlays the tray where it is tall enough to reach it, and the control it would cover is the
// one whose job the sheet's own Close button is doing.
//
// Fixed, so it does not scroll with the bench, and that costs nothing now: the scrim is fixed too,
// and while both are up nothing under them is reachable to scroll to.
//
// --lull-kb is not subtracted: this bench has no text input to raise a keyboard.
//
// `.lull-instrument` is sticky with `z-index: 1`, which makes it a stacking context and nests this
// sheet's `z-2` -- and the scrim's `z-1` -- inside it: rank 2 within the instrument, rank 1 against
// the page. That is enough to cover the board, because nothing on goFigure's board has a z-index;
// index.css records why.
//
// One caveat, and it is a trap laid for the future rather than a live condition: a transformed
// ancestor contains a fixed box, so `position: fixed` inside one stops meaning "the viewport". No
// component applies `.lull-rise` today -- `grep -rn "lull-rise" src` comes back with the stylesheet
// and nothing else -- so nothing is currently animating a transform above this sheet or its scrim.
// Do not put one there.
const SHEET_FIXED =
  'fixed top-[calc(var(--lull-crown)+var(--lull-s2))] right-[var(--lull-gutter-right)] left-[var(--lull-gutter-left)] z-2 ' +
  'max-h-[calc(100dvh-var(--lull-crown)-var(--lull-s2)-var(--lull-s4)-env(safe-area-inset-bottom))] ' +
  SHEET_SURFACE

// `list-decimal` is a CROSS-REPO contract, not a styling choice, and it is the reason lull-api's
// goFigure copy says "the 2nd operator FROM THE LEFT" rather than just "the 2nd operator". That band
// orders its rungs by how much each reveals, so its positions come out 2, 1, 3 -- and rung 1 renders
// here beside a marker reading "1.", which is two numbering systems asserting different ordinals on
// one line. "From the left" anchors the ordinal to the BOARD so the marker can only be read as list
// position. Dropping the decimal marker because the numbers look redundant would silently make the
// upstream wording read as a non-sequitur.
const LIST = 'flex list-decimal flex-col gap-[var(--lull-s2)] pl-[var(--lull-s5)] text-[var(--lull-ink)]'

const SHEET_HEAD = 'flex items-center justify-between gap-[var(--lull-s3)]'

// The whole state of the ladder, said in words, on the one control the bar offers. The label always
// names what the press will DO, which is what stops any state being a dead end. It used to read
// "All hints open" and refuse the press -- a true statement of the state, and useless as a control:
// with the sheet covering the whole board on a phone and Escape the only other exit, a touch-only
// player had no way to see the board again.
//
// IT READS THE SHEET BEFORE IT READS THE LADDER, and that order is load-bearing now that the sheet
// comes back shut. A control that only ever opened the NEXT rung would charge a returning player a
// hint to re-read the ones they had already paid for -- the mirror of the bug the sheet's own Close
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
// SHORTENED IN EVERY VARIANT, not only in `bare` -- and on `sign` the width argument reaches it on
// its own: that control is a fixed --lull-hint-w (116px) laid over the sign row, and "Open hint 1 of
// 3" at ~148 would not fit in it. But the split was made for every variant before that was true, and
// the reasons it was are still the reasons a `variant` parameter here would be wrong:
//
// First, a label that depends on the layout is a label that says different words for the same state
// on two benches, and the bench whose words are wrong is then the bench whose tests do not cover
// them. `controlLabel` takes the ladder, the sheet and the count -- everything that can change what
// the control MEANS -- and nothing about where it is drawn. One code path is one set of words.
//
// Second, the shorter phrase is better copy rather than merely narrower. On the sign row it is the
// ONLY word for hints on screen -- the band that once headed it "Hints" is gone -- and "Hint 1 of 3"
// reads as what it is, a pager over the ladder, where "Open hint 1 of 3" reads as an instruction.
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
// rather than a control, it would say nothing about whether the press opens or shuts, and its case
// breaks 2.5.3's containment; "Hide" alone would be a bare verb an inch from the sheet's own
// Close, doing the same job under a different word. It is also ten characters against "Hint 1 of
// 3"'s eleven, so it never binds the row and has nothing to buy.
interface ControlLabel {
  // What a screen reader says. Always carries the verb, because a name that only counted rungs would
  // tell a reader what the control is ABOUT rather than what pressing it does.
  name: string
  // What the row draws. The count survives here rather than the verb, because the count is what this
  // file's WCAG 1.4.1 argument rests on -- no variant draws rung markers any more, and when the docked
  // band did they were aria-hidden scenery, so these words are the only carrier of how much of the
  // ladder is spent.
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
 * A BOARD NEVER WRITES THE HINT FIELD, AND ALL THREE ADAPTER BOARDS READ IT. That is the rule
 * `registry/index.ts` and `puzzle-frame/index.tsx` both state, said here so this file agrees rather
 * than inventing a third phrasing: the shell is the only writer, and a board reads hint state exactly
 * when a hint changes what it DRAWS. Cryptogram locks a revealed letter into its grid, Themed
 * Anagrams pins letters into position, and Phrazle strikes and fills keys on its pad -- its rungs
 * move no tile, but they are statements about the alphabet, and a keyboard is an alphabet. "A board
 * that never learns hints exist cannot leak one" was the older and prettier promise, and it is not
 * the one this bar's callers keep.
 *
 * No time gate, no penalty, no cost. Rungs open in order because a ladder is only meaningful in
 * order. On a solved puzzle it renders exactly as it always does: the answer is already on screen,
 * so there is nothing left to protect.
 *
 * THAT SENTENCE IS THE CALLER'S TO KEEP AND IT WAS BRIEFLY UNTRUE. A pack ladder is fixed, so a
 * solved puzzle draws the same bar it always did; a COMPUTED one is folded against live state, and
 * two of the three adapters had nothing left to choose once every square or every row was right --
 * so they answered null, PuzzleFrame drew no bar, and what was then a 60px `shrink-0` band unmounted on the
 * winning keystroke, re-laying out the board underneath it. Worse on cryptogram, where an unlocked
 * square can still be cleared: the band flickered as a player toggled the last letter. Both adapters
 * now fall back to the ladder a fresh board would have shown, so this file's promise holds on all six
 * benches and null means only "this pack has no ladder at all".
 *
 * Opened rungs are drawn in a sheet that OVERLAYS the board rather than in a panel that shares the
 * column with it. The instrument sits `--lull-seam` up from the bottom edge on every bench, in
 * every state, and a hint that could push it down would break the one promise all four benches
 * make together.
 */
export const HintBar = ({
  control,
  hints,
  onReveal,
  puzzleId,
  resetSignal = 0,
  solution,
  variant = 'sign',
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

  // The control is a shared Button on `bare` and a native <button> on `sign`, and it has to be
  // findable after the sheet closes: a sheet that vanished while focus was inside it would drop
  // focus to <body>, and the next Tab would restart at the top of the page. The wrapper is the one
  // handle both variants share.
  const controlRef = useRef<HTMLSpanElement>(null)
  // The wrapper the `hidden` attribute lives on, so the reset effect below can ask whether focus is
  // about to be hidden rather than assume it. Nothing else needs it.
  const sheetRef = useRef<HTMLDivElement>(null)
  const sheetId = useId()
  // The dialog's name, which is its own visible "Hints" heading. An IDREF built here and resolved
  // here; `aria-labelledby` is the kind that cannot rot silently, since breaking it takes the
  // dialog's name and the suite finds the dialog by that name.
  const headingId = useId()
  // The two things focus moves between inside the popup: where it lands on open, and the scroller
  // the Tab cycle visits when -- and only when -- the content is taller than the screen.
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)

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
  // controlled one the count is in the board's own progress string, and the board's `onReset()` is
  // what takes the rungs and the reveal together: PuzzleFrame answers that signal by writing '' over
  // the whole record, and `removeHints` is a no-op on a key nothing wrote. NOT the board's
  // `onProgress('')` beside it -- an adapter's `merge` extends every board write including that one,
  // because '' is also what an emptied last box produces and a backspace must not cost a purchase.
  const hasSolution = solution !== undefined
  const isRevealed = hasSolution && opened > hints.length

  // Computed once and destructured at the call site, rather than called twice in the markup. Two
  // calls would be two chances for the name and the visible text to be derived from different state
  // -- which is precisely the pairing WCAG 2.5.3 is about, and precisely the kind of drift no test
  // written against a single render would catch.
  const label = controlLabel(hints, isOpen, opened, hasSolution)

  // A NAMED REGION ON THE SIGN ROW, and no region at all on `bare`. The shell's control is a
  // landmark of its own -- it sits outside the board, in the hint dock -- so a reader can reach
  // "Hints" from the landmark list. Its name is an `aria-label` and not a visible heading: the docked
  // band used to label itself with a visible "Hints" span through `aria-labelledby`, and that span,
  // like the three rung markers beside it, has gone. The control's own words already count ("Hint 2
  // of 3", "2 hints", "Show answer"), and a 116px control laid over a 46px row has no room for a
  // heading to repeat them. A string attribute also cannot dangle the way an IDREF can.
  //
  // `bare` stays a plain <div>: it sits in goFigure's tray, which is its own region, and a second
  // landmark nested inside it would name one row of controls twice.
  const isBare = variant === 'bare'
  const Frame = isBare ? 'div' : 'section'
  const frameProps = isBare ? {} : { 'aria-label': 'Hints' }

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

  // THE DENOMINATOR MOVES UNDER THE PLAYER, and when it does this control changes what pressing it
  // DOES while telling nobody. Buy rungs 1 and 2 on a Themed Anagrams board of four five-letter
  // answers, then solve the other three entries: the adapter's ladder folds from three rungs to two,
  // `opened` is still 2, and `controlLabel` flips "Open hint 3 of 3" to "Show answer" on a button
  // that may be the one the player is standing on. Screen readers do not re-read a focused element
  // when its label changes -- the same fact the reset announcement above exists for -- so a keyboard
  // or reader player presses what they were told was another hint and is handed the whole answer.
  //
  // FOUR CONDITIONS, AND EACH ONE EXCLUDES A CASE THIS MUST NOT FIRE ON. The sheet has to be OPEN,
  // because that is the only state in which the flip is silent: shut, the control reads "Show 2
  // hints" on both sides of the fold and nothing about it has changed. The ladder has to have
  // SHRUNK, so growing a speculative tail says nothing. `opened` has to be UNCHANGED, which is what
  // separates a fold happening underneath the player from the press that spends a rung -- a purchase
  // moves the count in the same render the tail shortens, and announcing there would talk over the
  // rung the player just bought. And the offer has to have crossed from a rung to the ANSWER: a
  // ladder that shortens above the count still offers a rung, and one with no `solution` beside it
  // becomes "Hide hints", which takes nothing away.
  //
  // ANNOUNCING IS THE FLOOR RATHER THAN THE FIX, and the stronger version was considered and not
  // taken here: refusing the next press, or making the reveal need a second one, is a rule about
  // what a control OFFERS and it would have to hold for goFigure's bar and the pack benches too.
  // This is the one thing that can be done inside a component that is handed a ladder and a count
  // and told nothing about where either came from.
  const offered = useRef({ length: hints.length, opened })
  useEffect(() => {
    const was = offered.current
    offered.current = { length: hints.length, opened }

    if (!isOpen || hints.length >= was.length || opened !== was.opened) return
    if (opened < hints.length || was.opened >= was.length || !hasSolution) return
    setAnnouncement('No hints are left. This button now shows the answer.')
  }, [hasSolution, hints.length, isOpen, opened])

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
    // Close, so "the owner said no" is a sheet the player can close rather than a trap.
    const next = opened + 1
    if (control) {
      control.onOpen(next)
    } else {
      setStoredOpened(next)
      writeHints(puzzleId, next)
      // AFTER the count is written, and only on the press that crosses the ladder. `next` is one past
      // `hints.length` exactly when this press is the reveal, which is the same test `controlLabel`
      // and `isRevealed` above both make -- said here as arithmetic on `next` rather than read off
      // `isRevealed`, because that flag describes the state BEFORE this press and is false on the
      // very press being reported.
      //
      // Guarded on `hasSolution` as well, because without one the advance below is just the ladder
      // running out and the control becoming the sheet's toggle. There is no answer to have sold.
      if (hasSolution && next > hints.length) onReveal?.()
    }
    // Asking for a hint is asking to see it. A rung that opened inside a shut sheet would read as a
    // button that did nothing.
    setIsOpen(true)
  }

  // INTO THE POPUP ON OPEN, onto its Close button, from every path that opens it: a fresh rung, the
  // free reopen, a declined controlled press. A dialog that left focus behind on the control would
  // leave a keyboard player standing outside the thing that just covered the screen, and a reader
  // hearing the control's new label rather than the dialog. Keyed on the TRANSITION: a press on the
  // control while the sheet is already up -- the next rung, the reveal -- leaves focus where the
  // press put it, which "leaves focus on the control that revealed the answer" pins.
  //
  // Shutting needs nothing here: every path that shuts the sheet runs `close` or the reset effect,
  // and both move focus back to the control before the sheet leaves the tree.
  useEffect(() => {
    if (isOpen) closeRef.current?.focus()
  }, [isOpen])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (!isOpen) return
    if (event.key === 'Escape') {
      close()
      return
    }
    if (event.key === 'Tab') cycle(event)
  }

  // THE TAB CYCLE, and it holds THREE stops rather than the dialog's own one or two: the Close
  // button, the dialog's body when it scrolls, and the hint CONTROL, which sits outside the dialog
  // element above the scrim. The control is in the ring on purpose. It is the only way to buy the
  // next rung or the answer, and every way of reaching it again from outside -- Close, Escape --
  // shuts the sheet, after which the control's press is the FREE reopen and never the next rung. A
  // ring of Close alone would leave a keyboard player able to open rung 1 and never rung 2: a trap
  // in the ladder, where the pointer player just presses the pill. Nothing else on the page is in
  // the ring, so focus never reaches the covered board.
  //
  // The body is a stop only when it actually scrolls, because a scroller a keyboard cannot focus
  // cannot be scrolled from the keyboard -- and one that does not scroll is a stop that does
  // nothing. jsdom lays nothing out, so under test it never scrolls and the ring is two stops.
  //
  // Only presses made from inside the ring are handled. This listener is on the bar's root, so it
  // sees Tab from the control and from the dialog and from nothing else.
  const cycle = (event: React.KeyboardEvent<HTMLElement>): void => {
    const dialog = dialogRef.current
    const ring = [
      closeRef.current,
      dialog !== null && dialog.scrollHeight > dialog.clientHeight ? dialog : null,
      controlRef.current?.querySelector('button') ?? null,
    ].filter((stop): stop is HTMLElement => stop !== null)
    const active = document.activeElement
    // Focus on the dialog's body when it is not a stop -- a click on a rung's text puts it there --
    // counts as standing on Close, the dialog's first stop.
    const at = ring.findIndex((stop) => stop === active)
    const from = at === -1 && dialog?.contains(active) === true ? 0 : at
    if (from === -1) return
    event.preventDefault()
    ring[(from + (event.shiftKey ? ring.length - 1 : 1)) % ring.length].focus()
  }

  return (
    <Frame
      // The whole class comes from VARIANT, because on `sign` the ABSENCE of `relative` is the point:
      // the sheet must resolve against the dock around this root, not against this root.
      className={VARIANT[variant]}
      onKeyDown={handleKeyDown}
      {...frameProps}
    >
      {/* First in the root so it paints under the sheet and the control at any rank; see SCRIM.
          Mounted only while the sheet is open, so a shut bar draws nothing over the bench. */}
      {isOpen && (
        <div
          aria-hidden="true"
          className={SCRIM}
          data-hint-scrim=""
          onClick={close}
          onPointerDown={(event) => event.preventDefault()}
        />
      )}
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

          The sheet's own Close control is inside it, and that is a change with a cost that was
          weighed rather than missed: the first reveal now reads "Hints, Close hints, <rung 1>"
          instead of just the rung. Every LATER rung is unaffected, because aria-atomic="false" announces only
          the nodes that changed and the header is static. The alternative was a sheet a touch-only
          player could not close without spending every remaining hint, which is a worse thing to
          have and a worse thing to say.

          Zero-size in flow, so it can sit in the row without spacing it. */}
      <div aria-atomic="false" role="status">
        {/* What a reset sounds like, and without it a reset sounded like nothing at all: the
            focused button is silently renamed from "Open hint 2 of 3" back to "Open hint 1 of 3"
            and screen readers do not re-read a focused element when its label changes, nothing
            else on the row draws the count, and the sheet just vanishes. A player who pressed Play
            again heard the board's own news and nothing about the ladder.

            It can only be said here because the reset no longer remounts this component. The region
            above outlives the reset now, so a reader is already watching it when this line arrives
            -- which is the whole difference between an announcement and a node inserted into a
            region nobody subscribed to.

            KEYED ON THE SIGNAL AND THE SENTENCE, which is what makes a second reset audible and a
            second KIND of announcement audible after it. The reset's text is the same every time, so
            re-rendering the same node with the same string is not a change and announces nothing; a
            new key makes React remove the node and insert a fresh one, and an inserted node is
            exactly what aria-atomic="false" reads out. The sentence joined the key when a second
            announcement arrived -- the ladder folding under a standing offer, see `offered` above --
            because two different strings under one key are a text change inside a node a reader is
            already watching, which is the weaker of the two things this region can do. It is a piece
            of state rather than markup gated on `resetSignal` directly so that the next press can
            take it back down -- see `press`.

            sr-only rather than visible: the bar is a 116px control laid over a 46px row, and there
            is no room for a sentence that is only true for one press. */}
        {announcement !== '' && (
          <p className="sr-only" key={`${resetSignal}:${announcement}`}>
            {announcement}
          </p>
        )}
        {/* The hide is an undecorated wrapper, NOT the sheet. Tailwind v4's preflight ships
            `[hidden]:where(:not([hidden="until-found"]))` with `display: none !important`, which
            would in fact outrank the sheet's own `flex` -- but a base-layer reset is not where a
            correctness guarantee belongs, and this wrapper carries no display utility, so the
            attribute stands on its own. */}
        <div hidden={!isOpen} id={sheetId} ref={sheetRef}>
          {/* A MODAL DIALOG, named by its own visible heading. The scrim makes everything outside
              it unreachable to a pointer and `aria-modal` says the same to a reader; the Tab cycle
              in `cycle` makes it true for a keyboard, with the one exception that cycle explains.

              tabIndex -1, not 0: focusable so the Tab cycle can put a keyboard on it when its
              content is taller than the screen -- a scroller with only plain text in it cannot
              otherwise be scrolled from the keyboard -- and out of the page's tab order, because
              the cycle decides when it is a stop. jsdom lays nothing out, so under test it never
              scrolls and the cycle never visits it. */}
          <section
            aria-labelledby={headingId}
            aria-modal="true"
            className={isBare ? SHEET_FIXED : SHEET_DROP}
            ref={dialogRef}
            role="dialog"
            tabIndex={-1}
          >
            {/* The way out, and it has to be here rather than only on the bar below.
                The bar's own control is the LADDER: while a rung is still unspent it reads
                "Open hint 2 of 3" and opening is the only thing it can do, so a player who
                wanted the board back had exactly two exits -- press Escape, which a touch
                device does not have, or spend every remaining hint to turn the control into
                "Hide hints". Wanting to see the phrase again cost a hint.

                So the sheet carries its own dismissal, where the thing being dismissed is,
                and it runs the same `close` -- focus returns to the bar's control, because
                this button is inside the element about to leave the accessibility tree.

                A BORDERED BUTTON WITH AN X AND A WORD, and it used to be a `quiet` "Hide" -- no
                border, muted ink, indistinguishable from a caption. Players did not see it and
                kept pressing the board under the sheet. `default` is the app's bordered control,
                the X is the mark every popup on the web is shut with, and "Close" is the word the
                board's refusal now uses too ("Close the hints to type."). The name says what is
                closed; the visible word is contained in it (WCAG 2.5.3). 44px tall from Button's
                own min-h-11. */}
            {/* The label is STATIC, and an <h2> that names the dialog. Static because this header
                sits inside the live region: aria-atomic="false" announces the nodes that changed,
                so a label counting the open rungs would re-announce itself alongside every new one.
                A heading because a modal dialog is its own document for as long as it is open --
                the board's headings are behind the scrim and out of reach -- and the dialog's name
                is this text, through `aria-labelledby`.

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
                <h2
                  className="text-[11px] font-semibold tracking-[0.14em] text-[var(--lull-muted)] uppercase"
                  id={headingId}
                >
                  Hints
                </h2>
                <Button aria-label="Close hints" onClick={close} ref={closeRef} size="sm" variant="default">
                  <CloseMark />
                  Close
                </Button>
              </div>
            )}
            {/* `hint.text` is rendered VERBATIM and nothing here derives a word of it. A rung is
                authored by whoever built the ladder, which is also the only place that knows what a
                rung is allowed to give away -- lull-api for the three types that carry one on the
                pack, and the type's own registry adapter over a vendored rule for the three that
                compute theirs on the device. This bar decides when a rung is shown, never what it
                says, and it cannot tell the two authors apart.

                THE SLICE SHOWS ONLY WHAT WAS BOUGHT, AND THAT IS THE CALLER'S GUARANTEE RATHER THAN
                THIS FILE'S. `opened` is the count of steps paid for, and on an adapter bench it is
                legitimately one PAST the ladder -- that last step is the answer reveal, which has no
                rung. So a caller whose ladder grew after the reveal was bought would have this slice
                reach one rung into the speculative tail: a hint nobody paid for, drawn free. Each
                adapter closes its ladder at the bought rungs once the reveal is out, which is what
                makes "the tail is never shown" true here. This bar cannot check it -- it is handed an
                array and a number and can tell neither where they came from.

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

                A <p> and not a heading: it is the answer, a sentence in the dialog's body, and the
                dialog's one heading is the "Hints" above that names it. */}
            {isOpen && isRevealed && (
              <p className="border-t border-[var(--lull-rule)] pt-[var(--lull-s3)] text-[var(--lull-ink)]">
                {solution}
              </p>
            )}
          </section>
        </div>
      </div>

      {/* Never unmounted and never `disabled`: a browser blurs a disabled element, focus falls to
          <body>, and the next Tab restarts at the top of the page. It is no longer aria-disabled
          either -- spending the last rung turns it into the sheet's toggle rather than into a
          control that says "All hints open" and does nothing.

          aria-expanded and aria-controls are what let a screen reader user know the sheet is a
          thing this button opens and closes, which is the relationship the old flowed drawer
          carried and the first version of this bar dropped. */}
      <span className={CONTROL_LAYER} ref={controlRef}>
        {isBare ? (
          <Button
            aria-controls={sheetId}
            aria-expanded={isOpen}
            aria-label={label.name}
            className={BARE_PRESSED}
            onClick={press}
            size="sm"
          >
            {label.visible}
          </Button>
        ) : (
          // See SIGN_TARGET. The same name, state and IDREF as the bare control, on a different
          // face; the pill is a span, so it adds nothing to the accessible name.
          <button
            aria-controls={sheetId}
            aria-expanded={isOpen}
            aria-label={label.name}
            className={SIGN_TARGET}
            onClick={press}
            type="button"
          >
            <span className={SIGN_PILL}>{label.visible}</span>
          </button>
        )}
      </span>
    </Frame>
  )
}
