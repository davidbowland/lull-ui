import React, { useEffect, useMemo, useRef, useState } from 'react'

import {
  applyHint,
  BoardState,
  CELL_COUNT,
  clearAll,
  clearCell,
  decode,
  EMPTY_BOARD,
  encode,
  expressionOf,
  isComplete,
  isDigitCell,
  isLocked,
  matchingSolution,
  nextCursor,
  runningTotal,
  slotOf,
  valueAt,
  write,
} from './board'
import { evaluateLeftToRight } from './evaluate'
import { Button } from '@components/button'
import { Plate, Shell } from '@components/enclosure'
import { FloorBar } from '@components/floor-bar'
import { HintBar } from '@components/hint-bar'
import { GoFigureData, GoFigureHint, Operator, PuzzleComponentProps } from '@types'

// Named, not symbolic. A screen reader reads "×" as "times" at best and as nothing at
// all at worst, and an unnamed control is an unusable one.
const OPERATOR_NAMES: Record<Operator, string> = {
  '*': 'Multiply',
  '+': 'Add',
  '-': 'Subtract',
  '/': 'Divide',
}

// What the eye sees. The tokens themselves always carry the pack's own characters, so
// the string compared against acceptedSolutions is the string the backend wrote.
const OPERATOR_SYMBOLS: Record<Operator, string> = {
  '*': '×',
  '+': '+',
  '-': '−',
  '/': '÷',
}

// The graft, and the whole reason the tile bench spends the 94px it saves by dropping the
// sign row and the docked hint bar. Left-to-right is the one rule in Lull nobody can guess,
// and the paragraph that used to sit here ("Signs apply left to right, not by PEMDAS")
// states it without teaching it: a player who has never questioned PEMDAS reads the
// sentence, agrees with it, and then taps ×7 expecting 64.
//
// A FIXED sum, never one drawn from the player's own bank. The rule has to be shown with
// real numbers, and 2, 3 and 4 are not theirs, so nothing about this puzzle is given away.
const WORKED_EXAMPLE = [
  { marker: '1', note: 'the first sign goes first', sum: '2 + 3 = 5' },
  { marker: '2', note: 'the next sign acts on that answer', sum: '5 × 4 = 20' },
  { marker: '=', note: 'A calculator would multiply first. This board never does.', sum: '20, not 14.' },
]

const isDigit = (token: string): boolean => /^\d$/.test(token)

// Derived from CELL_COUNT rather than restated, because the two cannot be allowed to disagree: the
// odd cells are the operator slots, so seven squares is always three of them. board.ts keeps its own
// OPERATOR_COUNT private, and importing a second constant that means the same thing would be one
// more place for the board's shape to be half-changed.
const SLOT_COUNT = (CELL_COUNT - 1) / 2

// THE STANDING LINE, and it is a new sentence rather than a restored one.
//
// The rail this bench replaced carried "Tap the numbers and signs to build a sum." That line was lost
// when the rail became seven squares, on the argument that the squares say it by standing there --
// and the argument was wrong about WHICH fact was missing. Seven dashed boxes do say "put something
// here". What they cannot say is that only ONE of them is listening.
//
// The bench is now modal in a way the rail never was. There is an insertion point, the same tile
// press writes into a different square depending on where that point sits, and the only signal is a
// 2px ring on square 1 inside a row of dashed boxes that read as placeholders rather than as
// controls. Nothing on screen tells a player that tapping square 3 moves the caret there -- so a
// player who puts a 9 in the wrong square has no way to learn that the fix is to tap the square
// first. That is the gap this closes, and it is why the sentence names the INTERACTION and not the
// goal: "build a sum" is the thing the goal plate and the worked example already say twice over.
//
// Pinker: two concrete nouns, one active verb, five words, no jargon and no hedging. It is
// deliberately not "Tap a square to move the caret, then tap a tile to fill it" -- the shorter line
// teaches the same order of operations and fits the ribbon's two clamped lines with room to spare at
// the largest supported text size, which the long one does not.
//
// It stands only while the player has placed nothing. The running total takes the line over on the
// first write, because from then on the total is the more useful thing to have standing there and
// the player has already demonstrated they know how to write.
//
// "PICK", NOT "TAP", and the verb is the whole of the correction. The line went in with the commit
// that also gave this bench a keyboard -- arrows move the caret, digits and signs write, Backspace
// clears -- so the one standing sentence whose entire job is to teach the interaction named the one
// modality a keyboard player cannot use, and nothing else on screen tells them the arrows exist.
// "Pick" is mode-neutral, the same five words, the same length, and reads no worse under a finger.
const INSTRUCTION = 'Pick a square, then a tile.'

// The board's own refusals and confirmations, named once. Every one of them is reachable from two
// inputs -- a tap and a keystroke -- and a sentence written twice is a sentence that can drift.
const NO_SQUARE_THAT_WAY = 'No square that way.'
const FROM_A_HINT = 'That sign came from a hint.'
const NEEDS_A_SIGN = 'That square takes a sign.'
const NEEDS_A_NUMBER = 'That square takes a number.'
const ALREADY_EMPTY = 'That square is already empty.'

// THE ONE REFUSAL THAT USED TO BE SILENT. Every other decline on this bench says something -- a
// digit the bank cannot pay for, a sign the pack does not draw, a square a rung owns, an edge with
// no square past it -- and a keystroke declined because the hint sheet is over the board said
// nothing at all. A keyboard player who opened a rung and then typed got no account of why the
// board had stopped listening, which from the inside is indistinguishable from a broken board.
//
// It is said for the WRITING keys only. The arrows are declined so the sheet can have them -- it is
// `tabIndex={0}` precisely so a keyboard player can scroll it -- so telling that player to hide the
// hints would be advice against the thing they are in the middle of doing.
const HIDE_TO_TYPE = 'Hide the hints to type.'

// The tile's ink is --lull-floor-ink, which measures 13.0:1 on the light floor and 15.4:1 on the
// dark one, and its edge is drawn with --lull-floor-rule, the floor's load-bearing 3:1 boundary.
// --lull-hair could not draw this edge at any contrast: hair is decoration, and this edge
// identifies a control.
//
// aria-disabled variants, not disabled:/enabled: -- the tiles stay genuinely enabled so
// that tapping one does not blur it, so those variants would never match and an
// unavailable tile would look identical to an available one.
//
// The unavailable state is a token COLOR and never opacity. CSS opacity composites the
// element's whole rendering as one group -- border, background AND outline -- so it halves
// the focus ring of a control this file deliberately keeps in the tab order, against the
// 3:1 that WCAG 2.4.11 requires of something still focusable and still announced.
//
// The HEIGHT arithmetic, which is the thing this tray has to be careful about, is on TILE_DIGIT
// and TILE_OPERATOR below. min-h-11 is the floor under both of them: whatever a row does, no tile
// may come out under the 44px a touch target owes.
const TILE =
  'flex min-h-11 min-w-11 shrink cursor-pointer flex-col items-center justify-center gap-[2px] ' +
  'rounded-[var(--lull-r-md)] border border-[var(--lull-floor-rule)] px-[var(--lull-s2)] ' +
  'text-[var(--lull-floor-ink)] hover:bg-[var(--lull-floor-ink)]/10 aria-disabled:cursor-default ' +
  'aria-disabled:text-[var(--lull-floor-muted)] aria-disabled:hover:bg-transparent'

// The bank reads as the thing you spend and the signs as the thing you spend it WITH, so the digits
// get the taller cell and the sign cut, and the signs a shorter one in the working cut. Both sit on
// a fill lifted a shade off the floor, which is what stops a tray of outlines reading as a grid of
// empty boxes.
//
// basis-[60px] with min-w-11 and shrink, rather than a fixed width: five tiles at 60 plus four
// 12px gaps is 348px against the 288px a 320 viewport has, so a fixed width wraps the bank onto a
// second row and pushes the control row off the bottom of a floor that cannot grow. Allowed to
// shrink they land at 48px, still over the 44 a touch target owes.
//
// FIVE is the bound, and it is the pack's rather than this file's: `bank` is typed `number[]` with
// no length in the type, and five is what this bench's acceptance criterion names. A sixth tile
// clamps at min-w-11 and needs 6 x 44 + 5 x 12 = 324px, which wraps whatever this file does about
// it -- the row cannot be made to hold what does not fit. If the pack ever ships six, the answer is
// a second row inside a taller floor, not a narrower tile.
//
// The heights are what the floor is budgeted against, and the budget is tight by design:
//
//   ribbon    52
//   tray     179   (10 top + 54 digits + 8 + 46 signs + 8 + 44 control + 9 bottom)
//   safe       9
//   ---------------
//            240   = --lull-seam
//
// A taller digit row is not free; it comes out of the control row, and the control row is where
// "Undo the last tile and try again" points.
const TILE_DIGIT = 'h-[54px] basis-[60px] bg-[var(--lull-floor-ink)]/5 lull-sign text-[26px]'
const TILE_OPERATOR = 'h-[46px] basis-[60px] bg-[var(--lull-floor-ink)]/5 text-2xl'

// A spent tile is marked by FORM -- a dashed edge and the word "Used" -- and stays fully
// legible. Color alone would fail WCAG 1.4.1, and dimming it would hide the bank exactly
// when the player is counting what is left of it.
const TILE_SPENT = 'border-dashed'

const USED = 'lull-work text-[9.5px] leading-none tracking-[0.08em] text-[var(--lull-floor-muted)] uppercase'

// A filled chip rather than an outlined one, because the marker's job is to hold the eye at the
// left edge of a three-line list -- and the last one, the `=`, is the answer the whole example is
// aimed at, so it takes the accent.
//
// --lull-muted for the rest, NOT --lull-rule, and the difference is 4.5:1. The chip carries type,
// so the fill and the ink on it are a TEXT pair however decorative the glyph is, and rule against
// on-accent measures 4.199 in light and 3.922 in dark -- both under the floor. muted against
// on-accent is the same pair contrast.test.ts already holds as `muted on raised` (7.143 light,
// 6.872 dark), because --lull-on-accent and --lull-raised are one value.
const MARKER =
  'flex h-[18px] w-5 shrink-0 items-center justify-center rounded-[3px] ' +
  'bg-[var(--lull-muted)] text-[9.5px] font-bold tracking-[0.08em] text-[var(--lull-on-accent)]'

const MARKER_RESULT = 'bg-[var(--lull-accent)]'

const CAPTION = 'text-[11px] font-semibold tracking-[0.14em] text-[var(--lull-muted)] uppercase'

// Centered, because the tray is a set of objects laid out on a surface rather than a list. Left
// alignment made four tiles read as the start of a row that ran out.
const ROW = 'flex flex-wrap justify-center gap-[var(--lull-s3)]'

// The worked example, boxed. It used to be a bare caption over a list, which put the one rule
// nobody can guess in the same visual weight as the running total under the rail -- so the thing
// the bench exists to teach read as a footnote about it.
const WORKED =
  'flex flex-col gap-[var(--lull-s2)] rounded-[var(--lull-r-md)] border border-[var(--lull-rule)] ' +
  'bg-[var(--lull-plate)] px-[var(--lull-s4)] py-[var(--lull-s2)]'

// The squares: a raised, ruled row where the rail used to be, set in the sign cut so the expression
// reads as something written down rather than as a status line. They replaced a single growing
// string, and the swap is what the whole hint ladder rests on: a rail could only ever be appended
// to, so a rung revealing the THIRD sign had nowhere to put it while the first two were unwritten.
// Seven fixed squares can hold a sign in the middle of nothing.
//
// Digit squares take the wider basis because the bank is what you SPEND and the signs are what you
// spend it with -- the same split the tray below already draws.
//
// 4px gaps, 52px tall. At a 372 viewport that is 340px of room, 316 after the six gaps, giving 49px
// number squares and 39px sign squares -- both clear of the 24px WCAG 2.5.8 target floor and both
// wider than cryptogram's 26px square. The height is what the rail measured, so the swap costs the
// board band nothing and the seam does not move.
// Carries only what all three skins below share -- the box, the type and the border WIDTH. No
// color and no fill, and that omission is load-bearing rather than tidy.
//
// Tailwind decides which of two competing utilities wins by EMISSION order in the stylesheet, not by
// their order in the class attribute, so a base that set `bg-[var(--lull-raised)]` and a modifier
// that set `bg-transparent` are a coin toss this file cannot call -- and one this project can never
// test, because style assertions are banned and jsdom lays nothing out. The fix is not to guess the
// order but to make the question unaskable: exactly one skin is ever applied, and each names every
// color it needs.
const CELL =
  'relative flex h-[52px] cursor-pointer items-center justify-center rounded-[var(--lull-r-sm)] ' +
  'border lull-sign leading-none text-[var(--lull-ink)] aria-disabled:cursor-default'
const CELL_DIGIT = 'basis-0 grow-[1.25] text-[25px]'
const CELL_OPERATOR = 'basis-0 grow text-[22px]'

// Dashed and unfilled, so an empty square reads as somewhere to put something rather than as a box
// that failed to load. This is what carries the instruction the rail used to spell out in words.
const CELL_EMPTY = 'border-dashed border-[var(--lull-rule)] bg-transparent'

// A square with something in it: solid edge, raised fill. The plain state, and the one the other two
// are read against.
const CELL_FILLED = 'border-[var(--lull-rule)] bg-[var(--lull-raised)]'

// THE CARET, and on this board it is the whole interaction model rather than a decoration.
//
// The rail this replaced was append-only, so there was nothing to point at: a tile went on the end,
// and the caret was a promise the rail was still taking tiles. Seven fixed squares make the bench
// MODAL instead -- the tray writes into the square the caret is on, and the same press does
// different things depending on where it sits -- so this ring is the only thing on screen saying
// which square the next tap will fill.
//
// It is never the only carrier of that fact, which is what keeps it clear of WCAG 1.4.1: the square
// also takes `aria-current`, and it is the one square in the row with `tabIndex={0}`. An inset ring
// rather than an outline so it cannot be confused with the focus indicator drawn on the same
// element, and so it does not shift the 4px gaps the row is measured in.
const CELL_CURSOR = 'inset-ring-2 inset-ring-[var(--lull-accent)]'

// Form and text, never color alone (WCAG 1.4.1): an accent edge, a HINT mark, and the words "from
// a hint" in the square's own name. The visible mark is aria-hidden precisely because the name
// already carries the fact -- letting both through announces the lock twice, which is the same rule
// the spent tile follows below.
const CELL_LOCKED = 'border-[var(--lull-accent)] bg-[var(--lull-accent)]/12'

// Every announcement this board makes goes through the floor's ribbon, and a ribbon that is handed
// the same sentence twice running renders an identical text node -- React touches nothing, the live
// region never changes, and a screen reader says nothing the second time. That is reachable here the
// moment two rungs are open: tapping locked square 4 and then locked square 6 is two taps and one
// sentence. A zero-width space on every other message is what the DOM sees change. Same mark, same
// reason, as cryptogram's ribbon.
const REPEAT_MARK = '\u200b'
const LOCK_MARK = 'absolute bottom-[3px] text-[8px] font-bold tracking-[0.08em] text-[var(--lull-accent)] uppercase'

// The solved banner is formatted for reading -- spaces, and × rather than *. The squares show the
// pack's own characters instead, because that is the string the player is building and the string
// the pack lists. One region cannot serve both.
const forReading = (tokens: string[]): string =>
  tokens.map((token) => (isDigit(token) ? token : OPERATOR_SYMBOLS[token as Operator])).join(' ')

// The PACK is untrusted, and this is the arm of that argument `decode` could not make for us.
//
// `decode` guards `Array.isArray(data.hints)` and stops there, which is the right depth for a
// function that only ever reads the ladder to cross-check a locked slot. This board does something
// stronger with it: `applyHint` destructures `hint.metadata`, so a rung without one throws inside a
// click handler rather than returning a bad answer.
//
// That is a live shape, not a hypothetical. Rungs went from bare strings to `{ text, metadata? }` on
// the wire, and `isValidPuzzle` deliberately leaves `data` opaque -- so a pack cached before that
// deploy is a VALID pack whose `hints` is an array of strings. `Array.isArray` waves it through,
// `HintBar` counts three of them and offers "Open hint 1 of 3", and the first press destructures
// `undefined`. That throw is inside an event handler, which an error boundary does NOT catch --
// React routes only render-phase throws to one -- so it escapes to window.onerror and leaves the
// board wedged mid-press with nothing on screen to say why.
//
// `hintsOf` cannot be reused for this: it is shared with the two phrase benches, whose rungs
// legitimately carry no metadata, so it checks the prose and nothing else. The narrowing belongs
// here, where a missing slot is a real failure -- which is exactly what its own comment says.
//
// Typed `unknown` rather than `GoFigureHint` on purpose. The declared type already promises the
// field, so a check written against that type reads as dead code to everyone including the linter;
// taking the value untyped is what states that the promise is the thing in doubt.
//
// IT CHECKS THE TWO FIELDS `applyHint` ACTUALLY READS, and not merely that a metadata object is
// there. Three ways of being wrong all reached the same crash or the same silent theft:
//
//   `metadata: null`   -- `typeof null` is 'object', so a null sailed through a check that had
//                         already written `hint !== null` one term earlier for the outer object and
//                         then omitted the identical clause for the inner one. The first press
//                         destructured it and wedged the board -- a handler throw, which no error
//                         boundary sees.
//   `metadata: {}`     -- structurally fine, and `applyHint` writes `operators[undefined] = undefined`
//                         into a board that encodes unchanged. The player is charged a rung, nothing
//                         appears, and no error is raised anywhere.
//   a slot or operator -- a rung naming slot 9, or a sign this pack's tray does not draw, produces a
//   the board cannot     board no sequence of taps could reach; `decode` then rejects the whole
//   draw                 string on the next load and the player loses every square and every rung.
//
// The operator is checked against THIS PUZZLE's list rather than against the four this file knows
// about, because the tray draws `puzzle.data.operators` and a rung the tray cannot mirror is a rung
// that puts a sign on the board the player could never have put there themselves.
const isPlaceable = (hint: unknown, operators: Operator[]): boolean => {
  if (typeof hint !== 'object' || hint === null) return false
  const { metadata } = hint as GoFigureHint
  if (typeof metadata !== 'object' || metadata === null) return false
  const { operator, slot } = metadata as { operator?: unknown; slot?: unknown }
  return (
    Number.isInteger(slot) &&
    (slot as number) >= 0 &&
    (slot as number) < SLOT_COUNT &&
    operators.includes(operator as Operator)
  )
}

export const GoFigureBoard = ({ onProgress, onSolved, progress, puzzle }: PuzzleComponentProps<GoFigureData>) => {
  const { acceptedSolutions, bank, goal, operators } = puzzle.data

  // Decoded once, at mount. The shell keys this component on the puzzle id, so a different puzzle
  // is a different component rather than a prop change. Every rule about what a stored string may
  // say lives in board.ts, which validates rather than parses: anything a player's own taps could
  // not have reached comes back as an empty board rather than as a half-restored one.
  const [state, setState] = useState<BoardState>(() => decode(progress, puzzle.data))
  const [cursor, setCursor] = useState(0)

  // Player moves only -- a hint never enters this, so Undo can never take a rung back. State rather
  // than progress, matching cryptogram: undo does not survive a reload, and Clear is the escape
  // hatch that does.
  //
  // `previous` is WHAT THE SQUARE HELD, not a marker that it held something, and Undo puts it back
  // rather than clearing. Clearing was a correct inverse on the old rail, where a tile could only be
  // appended and popping the stack was the only edit there was. Squares can be written over -- tap a
  // filled square, tap another tile -- so an Undo that cleared would answer an overwrite by emptying
  // a square the player had never seen empty.
  //
  // It holds the bank INDEX for a digit square and never the character, for the reason board.ts
  // stores indices at all: a bank of 6,9,7,7 has two tiles that write "7", so restoring from the
  // character would have to guess which tile to give back -- and guessing is the bug that dimmed
  // tile 3 when tile 4 was tapped.
  const [history, setHistory] = useState<{ cell: number; previous: number | Operator | null }[]>([])

  // What the board itself has to say, as against what the expression makes. The two are separate
  // because they answer different questions -- "that square is not yours to change" is about the
  // tap that just happened, and "that makes 29, not 154" is about the whole board -- and a derived
  // message cannot express the first.
  //
  // A COUNTER beside the text, and it is the counter the DOM sees change: saying the same sentence
  // twice running is a React state bail-out, so the ribbon's text node never changes and the second
  // press is silent to a screen reader. See REPEAT_MARK. The counter only ever climbs -- resetting
  // it on the empty message would let a cleared notice and the sentence after it collide again.
  //
  // `refusal` rides along because "the board declined this press" is a fact about the sentence that
  // the sentence itself cannot be parsed for, and `message` needs it: a refusal on a board the
  // player has not written to keeps the instruction, and a report of something that DID happen
  // never does. Storing it beats a list of refusal strings to test the text against, which would be
  // a second, drifting statement of which sentences those are.
  const [notice, setNotice] = useState({ nonce: 0, refusal: false, text: '' })

  // The only thing that shuts HintBar's sheet from out here. It climbs on Play again and is read by
  // the bar's own reset effect; the argument for a signal rather than a changed `key` -- and for
  // needing one at all -- is on `playAgain` below, where it is raised.
  const [resetNonce, setResetNonce] = useState(0)

  const cellRefs = useRef<(HTMLButtonElement | null)[]>([])

  // The two bands, so the window-level key handler below can say what counts as "on the bench". They
  // are SIBLINGS in the screen column rather than one nested in the other -- the shell wraps them in
  // a `display: contents` box -- so there is no single element that contains both and two refs is the
  // fewest this can be done with.
  const boardRef = useRef<HTMLElement | null>(null)
  const instrumentRef = useRef<HTMLElement | null>(null)

  // Focus follows the caret, but only once the player has moved it. Grabbing focus at mount would
  // scroll a deep-linked page past its own heading -- the same guard cryptogram carries.
  const hasMoved = useRef(false)

  // And it stands down for one move when the TRAY moved the caret. Every write advances the caret,
  // and without this the press that spends a tile throws focus up into the board band -- so a
  // keyboard player would tab back down through the whole tray for each of the seven squares, which
  // is the traversal cost the tiles' own aria-disabled comment was written to avoid. Cryptogram's
  // pad carries the identical ref for the identical reason.
  //
  // Captured BEFORE it is reset: resetting first makes the flag always false where it is read,
  // which makes the whole gate a no-op. It is also reset by hand wherever the caret may not move at
  // all -- a write into the last empty square leaves the caret where it is, the effect never runs,
  // and a flag left standing would eat the next legitimate focus.
  const skipFocus = useRef(false)

  useEffect(() => {
    const skip = skipFocus.current
    skipFocus.current = false
    if (!hasMoved.current || skip) return
    cellRefs.current[cursor]?.focus()
  }, [cursor])

  // A set lookup, and nothing else. The component never evaluates arithmetic to decide
  // whether an answer is right: the backend enumerated every accepted expression and
  // shipped them as data. An expression that reaches the goal by a route the pack did
  // not list is not a solution here — see evaluate.ts, which exists only so the
  // wrong-answer message can name what the tiles made.
  const accepted = useMemo(() => new Set(acceptedSolutions), [acceptedSolutions])

  // Squares in order, gaps dropped. What the pack is written in is a bare token join, so this is
  // the form the solved banner and the wrong-answer arithmetic both read -- and it is only ever
  // read once the board is full, where "gaps dropped" and "no gaps" are the same thing.
  const tokens = Array.from({ length: CELL_COUNT }, (_unused, index) => valueAt(state, index, bank)).filter(
    (token): token is string => token !== null,
  )
  const total = runningTotal(state, bank)
  const filled = isComplete(state)
  // Membership AND fullness. Set membership alone would be enough against today's packs, where
  // every accepted expression spends the whole bank, but that is the enumerator's habit rather than
  // a promise -- and a rule this load-bearing should not rest on a coincidence in someone else's
  // repo.
  //
  // WHICH WAY IT FAILS, because the two guards fail opposite ways and the choice is deliberate. If a
  // pack ever shipped an accepted expression shorter than the bank, membership alone would solve the
  // puzzle early -- the player is congratulated with tiles still in front of them -- while this
  // version makes it permanently unsolvable, since the board can never reach `filled` on a string
  // that does not spend every tile. Unsolvable is the louder failure and the one that gets reported;
  // solving early is silent and cannot be undone. If it ever happens the fix is upstream anyway.
  const isSolved = filled && accepted.has(expressionOf(state, bank))

  // Derived from the BOARD, never from a list of moves. A tile is spent when some square holds its
  // index, which is a fact the board already knows and cannot get out of step with.
  const consumed = bank.map((_unused, index) => state.digits.includes(index))

  // Whether this pack's ladder can actually place anything -- see isPlaceable. A malformed one means
  // no control at all rather than one that throws on the first press, and that is the kinder failure
  // in both directions: the board is still completely playable by hand, and nothing on screen offers
  // help it cannot give.
  //
  // `Array.isArray` FIRST, and it is not defensive noise: `isValidPuzzle` in the storage service
  // deliberately leaves `data` opaque -- it checks what the shell dereferences, not what a puzzle
  // type means -- so a pack cached before the hints deploy is a genuinely VALID pack that arrives
  // with `hints` undefined. `hints.every(...)` on that is a TypeError thrown during render, with no
  // error boundary between here and the root: the page goes white and the storage self-heal never
  // fires, because the pack really is valid, so it stays white until the player clears site data.
  // `decode` guards the identical shape at board.ts:138 for the identical reason and degrades to an
  // empty board; this line has to degrade the same way rather than take the screen down.
  //
  // `length > 0` is its own arm rather than a tidier way of saying the same thing. `[].every()` is
  // `true`, so an empty ladder passed a check that only tested the rungs and put a lone "Hide hints"
  // control on the tray that opened a sheet with nothing in it.
  const hasLadder =
    Array.isArray(puzzle.data.hints) &&
    puzzle.data.hints.length > 0 &&
    puzzle.data.hints.every((hint) => isPlaceable(hint, operators))

  // The sentence the sheet prints once every rung is spent, or undefined when there is nothing
  // honest to print. Composed HERE and not in the bar, for the same reason `answerOf` composes the
  // phrase benches' line where it does: the bar renders what it is handed, verbatim, and a component
  // that took a bare expression would have to know which bench's phrasing to wrap it in.
  //
  // HEDGED, and the hedge is accurate rather than modest. The ladder pins an operator TUPLE, never
  // an expression -- lull-api's `pickCanonical` deliberately takes the MOST-SHARED arrangement, so
  // that after rung 3 the player has the largest set of working digit orders left -- and this
  // fixture's six accepted solutions all carry one tuple. "The answer is 6 + 7 + 9 × 7" would assert
  // a uniqueness the pack does not have and that the player can disprove by finding another.
  //
  // Drawn for READING, like the solved banner: spaces, and × rather than *. The squares keep the
  // pack's own characters because that is the string being built and the string `accepted` is
  // matched on, and one region cannot serve both.
  //
  // Gated on `hasLadder` as well as on the match, because a ladder that cannot place a sign is a
  // ladder whose metadata cannot be trusted to name a tuple either -- and `matchingSolution` reads
  // exactly that metadata. One malformed-pack decision, made once, in the place that already makes
  // it for the control beside this one.
  const solution = useMemo(() => {
    if (!hasLadder) return undefined
    const expression = matchingSolution(puzzle.data.hints, acceptedSolutions)
    return expression === null ? undefined : `One winning answer is ${forReading([...expression])}.`
  }, [acceptedSolutions, hasLadder, puzzle.data.hints])

  const cursorLocked = isLocked(state, cursor)
  // Gated on the caret's KIND and its LOCK. Without the lock arm, parking the caret on a hinted
  // square leaves the sign tiles announcing themselves as available while every tap is refused -- a
  // control lying about its own state, which is worse than one that is plainly unavailable.
  //
  // Solved locks the board. A winning expression is not edited back down a tile at a time; the way
  // in is Play again, which empties it.
  const canTapDigit = !isSolved && !cursorLocked && isDigitCell(cursor)
  const canTapOperator = !isSolved && !cursorLocked && !isDigitCell(cursor)

  // Every write to the ribbon goes through here, so no caller has to remember that saying the same
  // thing twice is a different job from saying it once. The counter is what the DOM sees change.
  const say = (text: string): void => setNotice((held) => ({ nonce: held.nonce + 1, refusal: false, text }))

  // A DECLINED PRESS, and the only difference from `say` is what `message` may add underneath it.
  // Two functions rather than a boolean parameter because every call site here is a literal one or
  // the other, and `say(text, true)` at a dozen call sites is a flag nobody can read.
  const refuse = (text: string): void => setNotice((held) => ({ nonce: held.nonce + 1, refusal: true, text }))

  // DID THIS PRESS MOVE THE NUMBER, asked of the two boards rather than tracked as a flag by each
  // caller -- and both boards are always in reach, because `state` is the board before the change
  // for every function that calls this.
  //
  // It exists because saying the total when it has not moved is worse than not saying it at all.
  // `runningTotal` reads the unbroken prefix and drops a trailing operator, so a whole class of
  // writes cannot touch the number by construction: every operator placed at the head of the prefix,
  // and every operator undone from it. Signs and digits alternate, so that is roughly half of every
  // playthrough, and on each of those presses the clause was about 40% of a long `role="status"`
  // carrying nothing the player had not just been told. A live region that repeats itself is a live
  // region players learn to stop listening to, which costs the announcements that DO matter.
  const totalMoved = (next: BoardState): boolean => runningTotal(next, bank) !== runningTotal(state, bank)

  // runningTotal spells its own no-total case as a full sentence and its ordinary case as a
  // fragment, so the full stop is added rather than assumed. Shared with `openHint`, which announces
  // the same figure on the one other path that can move it.
  const asSentence = (running: string): string =>
    running === '' ? '' : running.endsWith('.') ? running : `${running}.`

  // THE SENTENCE A WRITE OWES, and the board owes one because nothing else on screen carries it.
  //
  // Under the old rail the expression was a bare text node inside the live region, so 6 became 6+
  // became 6+9 and each change announced itself. The squares replaced it with seven buttons whose
  // value sits in an `aria-hidden` span and whose meaning is an `aria-label` -- and neither reaches a
  // live region: hidden content is excluded from it, and changing an attribute on a node already in
  // the tree is not a content change that NVDA or JAWS will read. The running total does not cover
  // it either, because placing an OPERATOR leaves the total alone by design (a trailing sign is
  // dropped), so half of every playthrough would be silent.
  //
  // Focus cannot cover it either, and that is the trap: `skipFocus` deliberately keeps focus on the
  // tile that was pressed, so the square receiving the value is never focused and never speaks its
  // own name. So this sentence owes both halves -- what landed where, and where the caret went next
  // -- which is the same split cryptogram's pad settled on for the same reason.
  // AND IT CARRIES THE TOTAL, which is the half the resting line cannot cover.
  //
  // The total used to live INSIDE the board's own live region, so every tap announced it. Laid over
  // the floor's ribbon it is standing text -- read in place, deliberately outside the region, costing
  // no announcement -- which is exactly what makes it a good standing line and exactly what makes it
  // useless as an event. A write is the one thing that moves the number, so the write's own sentence
  // is where the announcement has to go; without it the figure a screen-reader player is here to
  // watch changes in silence, and removing the board's region would have been a straight regression
  // rather than a simplification.
  //
  // It goes in the MIDDLE, ahead of the caret's landing. FloorBar clamps the ribbon at two lines and
  // keeps the head, and the caret tail is the half cryptogram already decided it can afford to lose.
  //
  // Named against the board the write PRODUCED and never against `state`, which has not updated
  // inside the handler doing the writing -- the same reason cryptogram names a square against the
  // mapping its handler returned rather than the one in state.
  //
  // Both the empty-square and the no-landing arms are live, and they were not when this only served
  // `place`: Undo and Backspace both call it against a square they have just emptied, and Undo names
  // the square it walked the caret back to rather than a new one.
  //
  // BUT ONLY WHEN THE NUMBER MOVED -- see `totalMoved` above, which is what stops the clause from
  // reading the same figure back on the presses that cannot have changed it.
  const wrote = (next: BoardState, index: number, landed: number | null): string => {
    const shown = valueAt(next, index, bank)
    // Spoken, never symbolic, exactly as the square's own name does it: a screen reader reads "×" as
    // "times" at best and as nothing at all at worst.
    const said = shown === null ? 'empty' : isDigitCell(index) ? shown : OPERATOR_NAMES[shown as Operator]
    const kind = landed !== null && isDigitCell(landed) ? 'a number' : 'a sign'
    return [
      `Square ${index + 1} is ${said}.`,
      totalMoved(next) ? asSentence(runningTotal(next, bank)) : '',
      landed === null ? '' : `Now on square ${landed + 1}, ${kind}.`,
    ]
      .filter((part) => part !== '')
      .join(' ')
  }

  // `target` is optional and `null` is not the same as absent: null means board.ts found nowhere
  // for the caret to go, and the caret then stays where it is rather than falling to square 1.
  //
  // `said` is threaded through rather than set by the caller afterwards so that one commit is
  // exactly one thing said. A caller that set the notice after calling this would be relying on both
  // updates landing in the same React batch with its own arriving second, which is true today and is
  // not a property worth depending on.
  const commit = (next: BoardState, target?: number | null, said = ''): void => {
    setState(next)
    say(said)
    onProgress(encode(next))
    if (isComplete(next) && accepted.has(expressionOf(next, bank))) onSolved()
    if (target !== undefined) setCursor(target ?? cursor)
  }

  const moveCursor = (index: number): void => {
    hasMoved.current = true
    skipFocus.current = false
    setCursor(index)
    // A locked square is tappable on purpose -- the caret goes there and the board says why nothing
    // can be written -- because a square that simply ignored the tap would read as broken.
    //
    // Through `refuse` when there is a lock to explain and `say` otherwise, and the empty string has
    // to go through `say`: an empty notice is what puts the ribbon back to its resting line, and
    // marking THAT a refusal would ask `message` to append an instruction to nothing.
    if (isLocked(state, index)) refuse(FROM_A_HINT)
    else say('')
  }

  // `keepFocus` is the tray's answer and not the keyboard's, and it decides two things at once.
  //
  // A TRAY press keeps focus on the tile it was made with -- that is the whole of what `skipFocus`
  // buys -- so the square receiving the value never speaks its own name, and the sentence owes both
  // halves: what landed where, and where the caret went next.
  //
  // A KEYSTROKE is the opposite case. Focus is on the board and follows the caret, so the square the
  // caret lands on announces itself the moment it takes focus; naming it in the ribbon as well says
  // the same fact twice, which is the exact split cryptogram's `press(key, false)` settled on for
  // the same reason.
  const place = (value: number | Operator, keepFocus = true): void => {
    hasMoved.current = true
    skipFocus.current = keepFocus
    // Read off the BOARD before the write, and off `state` rather than through `valueAt`, because
    // what Undo needs back is the bank index a digit square held and not the character it drew.
    const previous = isDigitCell(cursor) ? state.digits[cursor / 2] : state.operators[slotOf(cursor)]
    const next = write(state, cursor, value)
    setHistory([...history, { cell: cursor, previous }])
    const landed = nextCursor(next, cursor)
    // Silent on the write that FILLS the board, because `message` reads the notice first and this
    // sentence would mask the two lines that matter most -- the solved banner and the wrong-answer
    // arithmetic. On the last square the outcome is the news, not the placement.
    commit(next, landed, isComplete(next) ? '' : wrote(next, cursor, keepFocus ? landed : null))
  }

  // It SAYS there is nothing to take back rather than going quiet, and that is why neither this
  // control nor Clear carries `aria-disabled` any more. Button's guard returns before `onClick`
  // whenever the attribute is true, so a disabled-looking Undo makes the sentence below unreachable
  // -- the player presses, nothing moves, and the board offers no account of why. HintBar settled
  // the same question the same way when its spent control stopped saying "All hints open" and
  // started doing something: a control that only refuses is not a control.
  //
  // Dropping the attribute also means the focus hazard it was there to MITIGATE no longer needs
  // mitigating. The order matters, because the comment above used to have it backwards: `disabled`
  // is the hazard -- a browser blurs an element that becomes disabled while focused, so the press
  // that emptied the board dropped focus to <body> -- and `aria-disabled` was the workaround that
  // kept the control focusable while refusing the press. Removing the workaround is safe here only
  // because nothing ever put `disabled` back.
  const undo = (): void => {
    // LOCKED SQUARES ARE SKIPPED, NOT SPENT, and this filter is the whole of that rule.
    //
    // A rung overwrites whatever the player had put in its slot and locks it, which leaves a history
    // entry pointing at a square `write` and `clearCell` now both refuse -- they return `state`
    // unchanged rather than throwing. An Undo that popped such an entry blindly did four wrong things
    // in one press: nothing on the board moved, the caret parked ON the locked square (where
    // `cursorLocked` then grayed out both tile rows), the ribbon said nothing at all because the
    // sentence was named against an unchanged board, and the entry was consumed -- so the player's
    // real last move now cost a second press to reach.
    //
    // It PRUNES as well as skipping. The orphaned entries can never become undoable again: only Clear
    // takes a lock back, and Clear empties the history anyway. Leaving them in would make every later
    // Undo walk past them again.
    const live = history.filter((move) => !isLocked(state, move.cell))
    const last = live.at(-1)
    if (last === undefined) {
      refuse('Nothing to undo.')
      return
    }
    // Undo walks the caret back to the square it just emptied, and focus follows the caret -- so
    // without standing that effect down for one move, the press lands the player on a board square
    // and off the control they were about to press again. Same ref, same reason, as a tray write.
    skipFocus.current = true
    setHistory(live.slice(0, -1))
    // PUT BACK what the square held, and only clear it when it held nothing. A write over a filled
    // square is an ordinary move on this board, so an Undo that always cleared would answer it by
    // emptying a square the player had never seen empty -- and would hand the bank back a tile the
    // move had not actually freed.
    const next = last.previous === null ? clearCell(state, last.cell) : write(state, last.cell, last.previous)
    // IT SAYS WHAT IT DID, where it used to announce only its refusals. Every argument the write
    // sentence rests on applies here unchanged and one applies harder: the square's value is in an
    // aria-hidden span, its meaning is an attribute, `skipFocus` keeps focus on Undo so the square
    // never speaks, and undoing the first tile REMOVES the running total rather than changing it --
    // and a removal is not announced by anything. The press was completely silent, which a player
    // cannot tell apart from a control that does not work.
    commit(next, last.cell, wrote(next, last.cell, last.cell))
  }

  // CLEAR, AND NOT PLAY AGAIN. The squares go and the locks go; `opened` stays, so the rungs the
  // player paid for are still listed in the sheet and the knowledge they bought is not taken back.
  // Play again zeroes both. Routing one through the other is the likeliest bug in this component and
  // it is silent -- a player who pressed Clear would find their hints gone and no error anywhere --
  // which is why they are two functions that share no line rather than one with a flag.
  //
  // It is also the ONLY way out of a square a rung filled, which is what makes it the one control on
  // this tray that never disappears: Undo gives way to Play again on a solved board, and Clear
  // stands beside whichever of the two is there.
  const clear = (): void => {
    // "Nothing would change", asked of board.ts, rather than "the board looks empty" restated here.
    // The two come apart exactly on the locks: a board carrying a rung encodes differently from its
    // own cleared form even though both are about to show seven empty squares, so the press does
    // real work and must not be refused. Comparing encodings keeps that rule in the one module that
    // owns it instead of copying its edge cases into this file.
    if (encode(state) === encode(clearAll(state))) {
      refuse('Nothing to clear.')
      return
    }
    // The moves the history refers to are gone with the board, so the history goes with them --
    // otherwise one press of Undo would re-empty a square the player had already refilled.
    setHistory([])
    skipFocus.current = true
    // AND IT SAYS THE HINTS SURVIVED, which is the one thing about this press a player has no other
    // way to learn. Clear takes the locks and keeps the rungs, and the press looks irreversible.
    //
    // THE SHEET MAY WELL BE OPEN. This comment used to argue the clause was necessary because "the
    // sheet is shut at the moment of pressing, so nothing on screen shows the rungs are still
    // there", and that premise is simply untrue: HintBar opens its sheet on every press that spends
    // a rung and leaves it open, the `bare` sheet is fixed above the seam so the tray underneath it
    // stays usable, and Clear is one of the controls in that tray. A player can perfectly well press
    // this with the ladder in view. The clause is still worth saying -- the sheet is equally often
    // shut, and either way "Clear does not cost you your hints" is not derivable from the screen --
    // but it is worth saying for that reason and not for a state of the sheet nothing here knows.
    //
    // Said only when there is something to reassure them about, and `hasLadder` is half of that
    // test: on a pack whose ladder cannot place anything there is no hint control on the tray at
    // all, so a sentence naming a sheet would send the player looking for one that is not drawn.
    const kept = hasLadder && state.opened > 0 ? ' Your hints are still in the sheet.' : ''
    commit(clearAll(state), 0, `Every square is empty.${kept} Now on square 1, a number.`)
  }

  // AND IT SAYS THE OPPOSITE OF WHAT CLEAR SAYS, because it does the opposite thing. Play again zeroes
  // the count as well as the board, so the sentence that reassures a player after Clear would be a
  // lie here -- and the difference between the two controls is exactly the thing this component is
  // most likely to collapse.
  //
  // IT ALSO HAS TO SHUT THE SHEET, and until the signal below it did not -- which froze the whole
  // keyboard on the board it had just handed over. HintBar's open/shut state is local to it and
  // exactly one thing resets it: the `resetSignal` effect. Zeroing `opened` moves the COUNT and
  // nothing else, so the sheet stayed up over a fresh, empty, unsolved board, rendering an `<ol>`
  // with nothing in it; `aria-expanded` stayed "true"; and `sheetIsOpen()` therefore returned before
  // every keystroke. Arrows, digits, signs and Backspace were all silently declined on a live board.
  //
  // A NONCE RATHER THAN A CHANGED `key`, and the reasoning is HintBar's rather than this file's:
  // remounting the bar destroys the focused element with no focus handling, and destroys the live
  // region that has to survive to announce anything. Passing the signal also buys the bar's own
  // "Hints reset." announcement and its focus rescue, neither of which this file could do from here
  // -- it cannot see whether focus is inside a subtree it does not own.
  const playAgain = (): void => {
    skipFocus.current = true
    setHistory([])
    setResetNonce((nonce) => nonce + 1)
    // "LOCKED AGAIN", NOT "SHUT". The old sentence said "the hints are shut", which was wrong twice:
    // the sheet was still open at that moment, and shutting is not what happens to the ladder in any
    // case. Play again RESETS it -- the rungs go back to unpaid and the player must spend them again
    // -- and that is the cost this press has that Clear does not, so it is the fact the sentence
    // owes them. Gated exactly as Clear's clause is, and for the same two reasons: a player who
    // never opened a rung has not met the ladder, and a pack whose ladder cannot place anything
    // draws no hint control for the sentence to be about.
    const kept = hasLadder && state.opened > 0 ? ' Your hints are locked again.' : ''
    commit(EMPTY_BOARD, 0, `Every square is empty.${kept} Now on square 1, a number.`)
  }

  // INDEXED BY RUNG, NEVER BY SLOT, and the difference is invisible on a left-to-right ladder.
  // lull-api orders rungs by how much each reveals, so this pack's difficulty-4 ladder runs slots
  // 1, 0, 2 -- rung 0 names slot 1, which is square 4 and not square 2. Treating the rung's position
  // as the slot passes almost every test that can be written about this component: all three rungs
  // still land, the board still fills, and only the FIRST press, checked against the square the sign
  // must not appear in, tells the two apart.
  //
  // The rung is read whole and `applyHint` takes the slot off its metadata, so this function never
  // does the arithmetic that would let the two indexes be confused in the first place.
  const openHint = (nextOpened: number): void => {
    // The sheet opens on this press and the caret is about to move, so focus must stay on the
    // control -- it is the element carrying `aria-expanded`, and a player thrown onto a board square
    // would be standing outside the thing they just opened.
    skipFocus.current = true

    // ON A SOLVED BOARD A RUNG REVEALS ITS PROSE AND TOUCHES NOTHING. The bar is deliberately left
    // standing after a win -- the ladder is worth reading once you have built the answer -- but while
    // rungs remain the control still says "Open hint 1 of 3", and pressing it used to run `applyHint`
    // against the winning board.
    //
    // That destroyed the win, and irreversibly. A pack whose acceptedSolutions span two operator
    // tuples -- 1*2*3*4 and 1+2+3*4 both make 24 -- lets a rung overwrite a slot the player had
    // filled differently: the expression stops matching, the banner vanishes, Play again reverts to
    // Undo, and the slot is now LOCKED, so Undo cannot take it back by design. The only exits were
    // Clear and Play again, both of which empty the whole board. A control labeled "hint" deleted a
    // finished puzzle with no warning and no sentence saying what had happened.
    //
    // Advancing `opened` alone keeps `locked` a subset of the rungs paid for, so the encoded board
    // stays valid and the sheet still lists the rung.
    if (isSolved) {
      commit({ ...state, opened: nextOpened })
      return
    }

    // ONE PAST THE LADDER IS THE ANSWER, and it touches the squares as little as a rung touches them
    // on a solved board. Text only: the sheet prints a sentence and the board stays exactly as the
    // player left it.
    //
    // Filling in the answer is the tempting version and it is wrong twice over. It would make this
    // component decide a puzzle was finished, which is the one thing `CLAUDE.md` says a board never
    // does -- a solve here is a set lookup against the expressions the backend shipped, and nothing
    // else. And it would have to guess which bank tile wrote each digit: the bank 6,9,7,7 has two
    // tiles that spell "7", so a filled-in answer would rebuild the tile-identity bug `board.ts`
    // stores INDICES to prevent.
    //
    // This branch has to come before the read below, because `hints[3]` is undefined and `applyHint`
    // destructures its metadata -- a reveal would throw inside a click handler with no error
    // boundary between here and the root.
    if (nextOpened > puzzle.data.hints.length) {
      commit({ ...state, opened: nextOpened })
      return
    }

    const hint = puzzle.data.hints[nextOpened - 1]
    const next = applyHint(state, hint, nextOpened)
    // NO FLOOR MESSAGE ABOUT THE LOCK. The sheet's live region reads the rung out and the square
    // carries the lock in its own accessible name; a line about either would be the third telling of
    // one event.
    //
    // THE TOTAL IS NOT COVERED BY THAT ARGUMENT, and it took a while to see it. The rung's prose
    // names the SIGN and never the number; the square's name says what it holds, not what the board
    // now adds up to; and the resting line is deliberately laid over the ribbon's live region rather
    // than inside it, so it is read in place and never announced. Meanwhile a rung that completes an
    // unbroken prefix genuinely moves the figure -- a board reading 6 _ 9 stands at 6, and a rung
    // filling slot 0 takes it to 15 -- and every other path that moves it (`place`, `undo`,
    // `backspace`) says so. So this was the one way the number a screen-reader player is here to
    // watch could change in silence, which is a second telling of nothing rather than a third
    // telling of something.
    // THE CARET STAYS PUT UNLESS THE RUNG TOOK THE SQUARE IT WAS STANDING ON, and that exception is
    // the whole of this line. `nextCursor` answers "where does the caret go after a write" -- a write
    // AT the caret -- but a rung writes at its own slot, which is almost never where the player is
    // standing. Advancing from `cursor` anyway walked the caret off a square that was still empty and
    // still theirs: on a fresh board, opening rung 1 of the shipped ladder fills square 4 and moved
    // the caret to square 2, which is a SIGN square, so all four number tiles went unavailable and
    // the next tap on a digit did nothing. Silently -- the total had not moved either, so the commit
    // said nothing and the ribbon kept standing at the instruction.
    //
    // That is the modal-caret hazard this bench already pays a standing line to cover, handed to the
    // player by the one control that is supposed to be helping them. `undefined` is `commit`'s "leave
    // the caret alone"; the locked branch is the genuine case where it cannot stay, and it owes the
    // same `Now on square N` half every other mover says.
    // Only the caret half, never `wrote`'s full sentence: naming the square the rung filled would be
    // the third telling the paragraph above rules out. Where the caret WENT is a different fact, and
    // one nothing else on screen carries.
    const displaced = isLocked(next, cursor)
    const landed = displaced ? nextCursor(next, cursor) : undefined
    const kind = landed !== null && landed !== undefined && isDigitCell(landed) ? 'a number' : 'a sign'
    const moved = totalMoved(next) ? asSentence(runningTotal(next, bank)) : ''
    const caret = landed === null || landed === undefined ? '' : `Now on square ${landed + 1}, ${kind}.`

    // SILENT ON THE PRESS THAT WINS, the same yielding `place` does on the last square, and for the
    // same reason -- except here nothing else could ever take the floor back. `message()` puts the
    // notice ahead of the banner, and a solved board has no control left that clears one: the cells
    // and both tile rows are gated on `!isSolved`, the key handler returns, and Undo has become Play
    // again. So a rung that completed the board wrote "Running total: 154." into the ribbon and the
    // player never saw "Solved" at all -- not late, never. A rung CAN finish a board: rungs 1 and 2
    // may land on operators already there, and the third writes the one that reaches the goal.
    const wins = isComplete(next) && accepted.has(expressionOf(next, bank))
    commit(next, landed, wins ? '' : [moved, caret].filter((part) => part !== '').join(' '))
  }

  // The text-field convention, and the one edit only the keyboard can make. It enters the undo
  // history like any other player move -- otherwise the single edit with no pointer equivalent would
  // also be the single edit with no way back.
  //
  // The caret does NOT move. Backspace in a text field deletes backwards and moves the insertion
  // point; here the squares are fixed positions rather than a run of characters, so the useful thing
  // is to empty the square you are standing on and stay there ready to retype it. The caret not
  // moving is also why this owes a sentence: nothing takes focus, so no square announces itself.
  const backspace = (): void => {
    // STRUCTURAL, not incidental. Every other edit on this bench states what it wants of the focus
    // flag -- `place` arms it or not from `keepFocus`, `undo`, `clear`, `openHint` and `playAgain`
    // arm it, `moveCursor` clears it -- and this one said nothing, which happened to be safe for a
    // reason no line here records: Backspace always commits an UNCHANGED cursor, so the effect that
    // spends the flag never runs and a flag left standing from a previous press is never read.
    //
    // That is an argument about the effect's dependency array, sitting two hundred lines away, and
    // it is not the kind of thing the next change to this file should have to rediscover. Clearing
    // it is what this function actually means: focus is already on the board (Backspace is a
    // keystroke, and keystrokes reach the board because the caret has focus or nothing does), so
    // there is nothing to keep it away from. It goes at the top rather than after the guards because
    // a stale flag is stale on the refused paths too.
    skipFocus.current = false
    if (isLocked(state, cursor)) {
      refuse(FROM_A_HINT)
      return
    }
    // Asked of board.ts by comparing encodings rather than restated here, the same way Clear asks it.
    const next = clearCell(state, cursor)
    if (encode(next) === encode(state)) {
      refuse(ALREADY_EMPTY)
      return
    }
    const previous = isDigitCell(cursor) ? state.digits[cursor / 2] : state.operators[slotOf(cursor)]
    setHistory([...history, { cell: cursor, previous }])
    commit(next, cursor, wrote(next, cursor, null))
  }

  // One step, skipping locks, and it does NOT wrap. The caret's advance after a write wraps on
  // purpose -- a board filled out of order must not strand the player at square 7 with square 1
  // blank -- but an arrow is a request for the neighbor, and a neighbor that turns out to be the
  // far end of the row is a surprise rather than a convenience. `null` is the boundary, which the
  // caller answers with a sentence rather than by silently doing nothing.
  const step = (from: number, delta: number): number | null => {
    let index = from + delta
    while (index >= 0 && index < CELL_COUNT) {
      if (!isLocked(state, index)) return index
      index += delta
    }
    return null
  }

  // THE SHEET IS INSIDE THIS BENCH'S OWN INSTRUMENT, which is the one place this handler has to
  // depart from cryptogram's rather than copy it.
  //
  // That bench scopes arrows to "on the bench" and its sheet sits outside the two bands, so the scope
  // excludes the sheet for free. Here the bar is a control in the tray's own row and its sheet is
  // drawn over the board from inside the instrument, so "on the bench" contains it -- and the sheet
  // is `tabIndex={0}` precisely so a keyboard player can scroll it. An unscoped handler would eat
  // every arrow that would do the scrolling, which is the failure cryptogram's own comment names.
  //
  // It reads the state off the DOM rather than mirroring it in a ref, and that is the stronger of the
  // two. What HintBar PUBLISHES -- the control's `aria-controls`, and the `hidden` attribute on the
  // element it names -- is the same fact a screen reader is told, and a bench that reads it can never
  // disagree with what the player is hearing. A boolean mirrored through a callback can: it would go
  // stale on any path that shuts the sheet without telling us, and Escape and the Hide control are
  // both such paths today.
  //
  // IT FOLLOWS `aria-controls` TO THE SHEET rather than trusting the first `[aria-expanded="true"]`
  // in the tray, and the difference is what happens to the NEXT disclosure anyone puts down here.
  // The old selector asked "is something in this band expanded", and answered for a tray that will
  // not always hold exactly one expandable thing -- an options popover, a bank that folds, anything.
  // The moment a second one existed and was open, every key on the board would be declined, with no
  // error, no failing test, and a symptom (the board stopped listening) that names nothing.
  //
  // `hasLadder` is the outer half of the same qualification and not a shortcut: when it is false no
  // HintBar is rendered at all, so any expanded control found in the tray is definitionally not this
  // sheet. Together they narrow the question from "is anything open" to "is the sheet that covers
  // the board open", which is the only thing the keyboard actually cares about.
  const sheetIsOpen = (): boolean => {
    if (!hasLadder) return false
    const id = instrumentRef.current?.querySelector('[aria-expanded][aria-controls]')?.getAttribute('aria-controls')
    // `hidden` is what HintBar toggles, so its ABSENCE is the sheet being up. Written this way round
    // rather than as `!hasAttribute` so that a missing element -- an id pointing nowhere, which is a
    // broken bar rather than an open sheet -- reads as shut and leaves the board playable.
    const sheet = id === undefined || id === null ? null : document.getElementById(id)
    return sheet !== null && !sheet.hasAttribute('hidden')
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    // A modified keypress belongs to the browser, not to the board. Without this, Cmd-R, Ctrl-A and
    // every other shortcut is both swallowed by the preventDefault below and read as a move -- the
    // player loses the reload they asked for and a square they did not.
    if (event.altKey || event.ctrlKey || event.metaKey) return

    const target = event.target as HTMLElement | null
    // Somewhere the player is composing text owns its own keystrokes. There is no such field on this
    // bench today, so this guards a future one rather than a present bug -- but the listener is on
    // the WINDOW, and a listener with that reach has to say what it declines to touch.
    if (target !== null && (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName))) return
    // A solved board is finished, and every square already carries `aria-disabled` to say so. The
    // keyboard refuses exactly what the pointer refuses, or one of the two controls is lying.
    if (isSolved) return

    // ASKED ONCE, ANSWERED DIFFERENTLY BY BRANCH, which is what this used to get wrong by asking it
    // in one place for all of them. A single early return declined every key in silence -- and one
    // of the two kinds of key deserved silence while the other did not. Reading the DOM once per
    // event also keeps every branch below looking at the same sheet: the answer cannot change
    // halfway through a handler, and nothing here re-renders in the middle of one.
    const sheetOpen = sheetIsOpen()

    // ARROWS ARE SCOPED AND THE WRITING KEYS ARE NOT, which is the asymmetry a window-level listener
    // exists to get right. A digit or a sign typed at a page with no text field on it means one thing
    // here, and taking it from anywhere is what keeps the bench playable after a tray press has
    // quietly kept focus. An arrow does not: it scrolls whatever is under it and drives whatever
    // widget has focus. `document.body` counts as on the bench because that is where a keystroke
    // lands when nothing has focus, which is the state this board deliberately arrives in.
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      // SILENTLY, and before `preventDefault`. The arrow is being handed to the sheet, which is
      // `tabIndex={0}` precisely so a keyboard player can scroll it -- so the press is not refused
      // at all, it is spent somewhere else, and a sentence telling the player to hide the hints
      // would be advice against the thing they are doing. Preventing the default here would be
      // worse than saying nothing: it would eat the scroll the guard exists to protect.
      if (sheetOpen) return
      const onBench =
        boardRef.current?.contains(target) === true ||
        instrumentRef.current?.contains(target) === true ||
        target === document.body
      if (!onBench) return
      event.preventDefault()
      const landed = step(cursor, event.key === 'ArrowRight' ? 1 : -1)
      // THROUGH `moveCursor`, NEVER THROUGH `setCursor`, and this is the line the whole focus model
      // rests on. `skipFocus` is armed by `place`, `undo`, `clear` and `openHint` and cleared by
      // exactly one function -- this one. A write whose caret advance lands nowhere, which is the
      // write that fills the last square, leaves the flag standing with no effect run to spend it.
      // The next arrow is then the first press that would move the caret, so an arrow that set the
      // cursor directly would find the stale flag, move the caret, and leave focus behind on the tile
      // the player last pressed.
      if (landed === null) refuse(NO_SQUARE_THAT_WAY)
      else moveCursor(landed)
      return
    }

    if (isDigit(event.key)) {
      event.preventDefault()
      // FIRST, ahead of the lock and the kind of square, because it is the reason the press was
      // declined. Telling a player that square 2 takes a sign, when what actually stopped them is a
      // sheet lying over the board, sends them to fix the wrong thing.
      if (sheetOpen) {
        refuse(HIDE_TO_TYPE)
        return
      }
      if (isLocked(state, cursor)) {
        refuse(FROM_A_HINT)
        return
      }
      if (!isDigitCell(cursor)) {
        refuse(NEEDS_A_SIGN)
        return
      }
      // The TILE, not the digit, exactly as the tray press finds it: a bank of 6,9,7,7 has two tiles
      // that write "7", so typing 7 twice has to spend both rather than refusing the second. First
      // unspent match is the correct assignment here for the reason it is wrong on a tap -- there is
      // no tile under a finger for the choice to contradict.
      const tile = bank.findIndex((digit, index) => !consumed[index] && String(digit) === event.key)
      // One sentence for "this pack has no 8" and for "both 7s are already down", because from the
      // player's side they are the same fact: there is no tile they can spend to put that digit here.
      if (tile < 0) refuse(`No ${event.key} in your tiles.`)
      else place(tile, false)
      return
    }

    if (event.key === '+' || event.key === '-' || event.key === '*' || event.key === '/') {
      event.preventDefault()
      if (sheetOpen) {
        refuse(HIDE_TO_TYPE)
        return
      }
      if (isLocked(state, cursor)) {
        refuse(FROM_A_HINT)
        return
      }
      if (isDigitCell(cursor)) {
        refuse(NEEDS_A_NUMBER)
        return
      }
      // WHICH SIGNS EXIST IS THE PACK'S CALL. The tray draws `puzzle.data.operators`, so a key for a
      // sign it does not draw would let the keyboard reach a board no sequence of taps could -- and
      // `decode` rejects such a string whole on the next load, costing the player every square and
      // every rung they had paid for.
      if (operators.includes(event.key)) place(event.key, false)
      else refuse(`This puzzle has no ${OPERATOR_NAMES[event.key]} sign.`)
      return
    }

    if (event.key === 'Backspace') {
      event.preventDefault()
      // A WRITING KEY, so it speaks. Backspace is the one edit only the keyboard can make, which
      // makes it the one edit whose silent refusal a pointer player could never have reported.
      if (sheetOpen) refuse(HIDE_TO_TYPE)
      else backspace()
    }
  }

  // ON THE WINDOW, not on the board. Every tray press deliberately KEEPS focus, so a handler hung off
  // the board's own section would stop receiving keystrokes the moment the player touched a tile --
  // silently, because nothing has gone wrong: the keys are simply landing on <body>. It also answers
  // the plainer case a board-scoped listener never could, which is arriving on a laptop and typing
  // with focus wherever the page left it.
  //
  // No dependency array, on purpose. The handler closes over `state`, `cursor`, `history` and
  // `consumed`, all of which change on nearly every press, so any array short of "everything" leaves
  // a stale closure typing into a board that has moved on. One removeEventListener and one
  // addEventListener per render is not a cost worth a correctness risk.
  useEffect(() => {
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const message = (): string => {
    // The most recent thing the board was asked to do wins. A refused tap is about the press that
    // just happened; the wrong-answer line is about a board that has not changed since.
    //
    // The repeat mark rides on the notice alone. The two derived lines below cannot repeat back to
    // back without an empty message between them -- the board has to change to reach either -- so
    // they need no help being noticed, and an empty message stays exactly empty, which is what keeps
    // the ribbon's live region unoccupied at mount.
    // AND A REFUSAL ON AN UNTOUCHED BOARD CARRIES THE INSTRUCTION WITH IT, because otherwise it
    // takes the instruction away for good.
    //
    // `notice` is sticky by design -- the most recent thing the board was asked to do wins, and it
    // wins until the board next goes quiet, which happens only on a caret move or a rung. That is
    // right for a report of something that happened. It is wrong for a refusal on a board where
    // nothing has happened yet: a first-time player who presses Undo before their first tile gets
    // "Nothing to undo." standing in the ribbon forever, and the sentence it displaced -- the one
    // sentence on screen that says the board has an insertion point and only one square is
    // listening -- comes back only if they perform the very action it existed to teach.
    //
    // A timer is not available and would be wrong anyway: FloorBar owns the message-or-resting-line
    // choice, this file may not reach into it, and a line that vanished on its own would be a line a
    // screen reader user meets twice or not at all. Saying both is what the ribbon can actually do,
    // and it puts the refusal and the way forward in one breath.
    //
    // `encode(state) === ''` is the test, and it is the board's own canonical empty rather than a
    // count of presses kept here: it is true exactly when nothing is written AND no rung is owed,
    // which is the state the instruction is aimed at. A board carrying a lock is not untouched --
    // the player has spent something on it -- so a refusal there stands alone, as it did before.
    const untouched = encode(state) === ''
    const taught = notice.refusal && untouched ? ` ${INSTRUCTION}` : ''
    if (notice.text !== '') return `${notice.text}${taught}${REPEAT_MARK.repeat(notice.nonce % 2)}`
    if (isSolved) return `Solved. ${forReading(tokens)} = ${goal}`
    // Nothing to say while squares are still empty: an unfinished expression is not a wrong one.
    if (!filled) return ''

    const value = evaluateLeftToRight(
      tokens.filter(isDigit).map(Number),
      tokens.filter((token) => !isDigit(token)) as Operator[],
    )
    // Division has to come out whole at every step, so there is no number to name.
    if (value === null) return "That doesn't divide evenly. Undo the last tile and try again."
    // The backend enumerates every expression reaching the goal, so this is unreachable
    // from a real pack. It is here because the alternative -- "That makes 154, not 154"
    // -- is what the ordinary branch would print if it ever did happen.
    if (value === goal) return "That isn't one of the sums for this puzzle. Undo the last tile and try again."
    return `That makes ${value}, not ${goal}. Undo the last tile and try again.`
  }

  return (
    <>
      {/* Band 4. The shell owns this band's flex, min-height and vertical overflow in index.css --
          it is the one band that flexes, and the seam depends on that -- so nothing here sets
          them. What this file does own is the ORDER OF SACRIFICE inside the band, and on this
          bench that order is not negotiable:

            THE GOAL AND THE EXPRESSION ARE NEVER BOTH OFF SCREEN, BECAUSE NEITHER IS EVER OFF
            SCREEN.

          The whole game is comparing a number you are building against a number you were given,
          and a layout that makes you scroll between the two makes the player hold one of them in
          their head -- which is the arithmetic the tiles were supposed to be doing. An earlier
          draft put the worked example between them because the design was drawn that way, and at
          a 372x608 window it pushed the expression clean off the bottom.

          So the goal and the squares are shrink-0 and the TEACHING is what scrolls. It is the only
          thing here that can: it says the same three lines on every puzzle, it is read once, and
          on a short window the sliver still shows its first line, which is the rule itself. */}
      <section aria-label="Go Figure!" className="lull-board flex flex-col overflow-x-hidden" ref={boardRef}>
        <div className="flex min-h-0 flex-1 flex-col gap-[var(--lull-s2)] bg-[var(--lull-plate)] py-[var(--lull-s3)] pr-[var(--lull-gutter-right)] pl-[var(--lull-gutter-left)]">
          {/* One of exactly two double-bezels in the whole product -- the other is the date
              plate on the day directory. Bezelling every container turns the technique into
              background noise, so the one plate on this bench is the one fact the whole board
              is aimed at.

              The heading is named rather than read off its own spans: its accessible name has
              to be "Make 154" as one phrase, and a name assembled from two inline spans
              depends on how the engine spaces them. */}
          <Shell className="shrink-0">
            <Plate className="flex flex-col items-center gap-[var(--lull-s1)] px-[var(--lull-s4)] py-[var(--lull-s2)]">
              <h2 aria-label={`Make ${goal}`} className="flex flex-col items-center gap-[var(--lull-s1)]">
                <span className={CAPTION}>Make</span>
                {/* The sign cut, at the largest size anywhere in Lull -- but sized off the
                    VIEWPORT WIDTH with a smaller ceiling than it had, because this plate no
                    longer gets to be the only thing on the board. 12vw is 45px on a 372 window
                    and 47 on a 390 phone; the 4.5rem ceiling is what it still reaches on a
                    tablet, where the room is real. */}
                <span className="lull-sign text-[clamp(2.25rem,12vw,4.5rem)] leading-none text-[var(--lull-ink)]">
                  {goal}
                </span>
              </h2>
            </Plate>
          </Shell>

          {/* NO LIVE REGION HERE ANY MORE, and its going is the point rather than a tidy-up.
              This row used to sit inside a `role="status"` named "Your expression" with the running
              total as a line under it, on the argument that the two read as one fact. That argument
              held while the expression was a growing string INSIDE the region -- 6 became 6+ became
              6+9 and each change announced itself. It stopped holding the moment the string became
              seven buttons: their values live in aria-hidden spans and their meanings in aria-label
              attributes, and neither reaches a live region, so the only thing left changing in there
              was the total. What the bench had then was two polite regions announcing on the same
              press -- the floor's ribbon saying "Square 1 is 6. Now on square 2, a sign." and this
              one saying "Running total: 6" -- which is precisely the double-announcement the old
              comment here was written to avoid.

              So the region goes and the total moves to the floor, where it rests OVER the ribbon's
              live region rather than inside it. The announcement the total used to carry is not lost
              with it: it rides on the write's own sentence, which is the only event that moves the
              number. See `wrote`.

              Directly under the goal, and shrink-0 with it. These two boxes are the pair the
              player is comparing, so they are the pair that never moves. */}
          <div className="flex shrink-0 flex-col gap-[var(--lull-s1)]">
            {/* Still named, and still a group rather than a region. It is what marks the expression's
                place in the column now that the region above is gone, and it is what keeps seven
                buttons from reading as seven unrelated controls between the goal and the teaching. */}
            <div aria-label="Squares" className="flex shrink-0 gap-1" role="group">
              {Array.from({ length: CELL_COUNT }, (_unused, index) => {
                const digitCell = isDigitCell(index)
                const value = valueAt(state, index, bank)
                const locked = isLocked(state, index)
                const onCursor = cursor === index
                // Spoken, never symbolic. A screen reader reads "×" as "times" at best and as
                // nothing at all at worst, so the operator goes through OPERATOR_NAMES here and
                // OPERATOR_SYMBOLS below -- the pack's own ASCII is never read aloud as itself.
                const spoken = value === null ? 'empty' : digitCell ? value : OPERATOR_NAMES[value as Operator]
                return (
                  <button
                    // Absent on every square but one, never "false": aria-current has no
                    // there-is-no-caret-here state to say, and saying it on six squares would put
                    // the word in a screen reader's mouth six times for the square it is not about.
                    aria-current={onCursor ? 'true' : undefined}
                    // A LOCKED square is not disabled -- tapping it moves the caret there and the
                    // floor says why nothing can be written, which is more use than a square that
                    // swallows the tap. A SOLVED board is, because then there is genuinely nothing
                    // any square can do. aria-disabled and never disabled, for the tiles' own
                    // reason: a browser blurs an element that becomes disabled while focused, and
                    // the whole row goes unavailable on the tap that wins the puzzle.
                    aria-disabled={isSolved}
                    aria-label={`Square ${index + 1}, ${digitCell ? 'number' : 'sign'}, ${spoken}${locked ? ', from a hint' : ''}`}
                    // ONE skin, chosen once. Locked outranks filled because a locked square is
                    // always filled and the lock is the fact worth drawing; empty and filled are
                    // exclusive by definition. Layering them instead -- a base fill plus a
                    // `bg-transparent` modifier -- would leave the winner to Tailwind's emission
                    // order rather than to this line, and no test in this project could catch it
                    // going the wrong way. See CELL.
                    className={[
                      CELL,
                      digitCell ? CELL_DIGIT : CELL_OPERATOR,
                      locked ? CELL_LOCKED : value === null ? CELL_EMPTY : CELL_FILLED,
                      onCursor ? CELL_CURSOR : '',
                    ].join(' ')}
                    key={index}
                    onClick={() => !isSolved && moveCursor(index)}
                    ref={(node) => void (cellRefs.current[index] = node)}
                    // A ROVING tabIndex. Without it the board band gains seven tab stops between
                    // the goal and the tray, so reaching the instrument by keyboard costs seven
                    // presses on every board. Exactly one square is ever tabbable; the arrow keys
                    // are what move between them.
                    tabIndex={onCursor ? 0 : -1}
                    type="button"
                  >
                    {/* aria-hidden, both of them: the button's own name already says "Square 4,
                        sign, Add, from a hint", and letting these through would read the square
                        twice over. */}
                    <span aria-hidden="true">
                      {value === null ? '' : digitCell ? value : OPERATOR_SYMBOLS[value as Operator]}
                    </span>
                    {locked && (
                      <span aria-hidden="true" className={LOCK_MARK}>
                        Hint
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Tile-bench furniture, not a shared margin: a teaching column every bench inherited
              would be the shared frame this redesign rejects, and the other three benches have
              nothing to teach that a hint cannot carry.

              THE ONE THING ON THIS BOARD THAT SCROLLS, in a box of its own rather than by letting
              the band scroll -- because a band that scrolls takes the goal with it. Where the
              window is tall the whole example is in view and nothing scrolls at all; where it is
              short the box shrinks to a sliver and the first line, which is the rule, is what
              stays in it.

              An ordered list, because the steps only mean anything in order. The markers are
              drawn as tokens and hidden from assistive tech -- the list already numbers itself,
              and "=" is a piece of punctuation standing in for a step rather than a step. */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className={WORKED}>
              <h3 className="text-sm leading-[1.4] font-semibold text-[var(--lull-ink)]">
                Signs apply left to right, not by PEMDAS.
              </h3>
              <ol className="flex list-none flex-col gap-[var(--lull-s2)]">
                {WORKED_EXAMPLE.map(({ marker, note, sum }) => (
                  <li className="flex items-baseline gap-[var(--lull-s2)] text-[13.5px]" key={marker}>
                    <span aria-hidden="true" className={marker === '=' ? `${MARKER} ${MARKER_RESULT}` : MARKER}>
                      {marker}
                    </span>
                    <span className="text-[var(--lull-ink)]">
                      {sum} <span className="text-[12.5px] text-[var(--lull-muted)]">{note}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* Band 6, the seam. FloorBar takes { children, message } and nothing else, so the class
          that claims the band goes on the box around it -- and that box is a landmark for the
          same reason the board is: these two elements are siblings in the screen column, not
          nested, so a single region around both cannot exist.

          The ribbon inside FloorBar is the always-mounted, initially-empty live region this
          board's wrong-answer and solved messages are announced through. */}
      <section aria-label="Tiles" className="lull-instrument" ref={instrumentRef}>
        {/* `resting` is a STANDING LINE, laid over the ribbon's live region and outside it, so it
            costs no announcement -- which is exactly why the running total belongs there and exactly
            why FloorBar needs no change to take it. A message displaces it, and that is the right
            priority: once the bank is spent, "That makes 22, not 154" is strictly better information
            than the total.

            The instruction and the total share the slot rather than competing for it, because they
            are never both worth saying. Before the first tile there is no total to show and the
            player needs to be told that only one square is listening; after it, the player has
            demonstrated they know how to write and the number is the more useful thing to have
            standing there. The switch is on the TOTAL being empty rather than on a counter of taps,
            so a board restored mid-solve comes back with its total rather than with a lesson. */}
        <FloorBar message={message()} resting={total === '' ? INSTRUCTION : total}>
          <div className="flex flex-col gap-[var(--lull-s2)] pt-[10px] pr-[var(--lull-gutter-right)] pb-[9px] pl-[var(--lull-gutter-left)]">
            {/* aria-disabled, NOT disabled, on every tile. A browser blurs an element that
                becomes disabled while focused, and every tap disables the tile just
                activated -- so `disabled` drops focus to <body> and the next Tab restarts at
                the top of the document. Playing one puzzle by keyboard meant fourteen
                traversals from the page top, and at the final tile every tile disables at
                once, so focus vanished exactly when the wrong-answer message appeared.
                aria-disabled keeps the tile focusable and announced; the guard in the click
                handler is what actually refuses the tap. */}
            <div aria-label="Numbers" className={ROW} role="group">
              {bank.map((digit, index) => {
                // Spent and unavailable are two different facts and the board now says so.
                // A tile the bank has already paid out is marked Used for good; a tile that
                // simply cannot be tapped this turn -- every digit, while an operator is
                // owed -- is announced unavailable and marked nothing, because calling it
                // used would be a lie the player can disprove one tap later.
                const isUsed = consumed[index]
                const isUnavailable = isUsed || !canTapDigit
                return (
                  <button
                    aria-disabled={isUnavailable}
                    // Position included because a duplicated bank gives two tiles the same
                    // name: "Use 7" twice tells a screen-reader user nothing about which one
                    // they just spent.
                    aria-label={`Use ${digit}, tile ${index + 1} of ${bank.length}`}
                    className={isUsed ? `${TILE} ${TILE_DIGIT} ${TILE_SPENT}` : `${TILE} ${TILE_DIGIT}`}
                    key={`${digit}-${index}`}
                    // The tile's INDEX, not its digit. A bank of 9,3,9,9 has three tiles that all
                    // write "9", so the character alone cannot say which one was spent.
                    onClick={() => !isUnavailable && place(index)}
                    type="button"
                  >
                    {/* Hidden, both of them: the button's own name already says "Use 7, tile
                        3 of 4", and letting these through would read the tile twice. */}
                    <span aria-hidden="true">{digit}</span>
                    {isUsed && (
                      <span aria-hidden="true" className={USED}>
                        Used
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* The signs are reusable, so no sign is ever spent and none is ever marked Used. */}
            <div aria-label="Signs" className={ROW} role="group">
              {operators.map((operator) => (
                <button
                  aria-disabled={!canTapOperator}
                  aria-label={OPERATOR_NAMES[operator]}
                  className={`${TILE} ${TILE_OPERATOR}`}
                  key={operator}
                  onClick={() => canTapOperator && place(operator)}
                  type="button"
                >
                  <span aria-hidden="true">{OPERATOR_SYMBOLS[operator]}</span>
                </button>
              ))}
            </div>

            {/* THREE controls now, where there was one. The first slot swaps -- Undo while the board
                is unsolved, Play again once it is not -- and that swap is safe from the focus
                problem that governs the tiles: solving is always a tile tap, so the control being
                replaced is never the focused element at the moment it is replaced.

                Clear and the hint control do NOT swap. Clear is the only way out of a square a rung
                filled, so a solved board that hid it would leave a player who wanted to rearrange
                their answer with Play again as the only exit; and the ladder is worth reading on a
                solved board too, where the sheet is just an explanation of what they built.

                NEITHER Undo NOR Clear carries aria-disabled, and that is a change from the row this
                replaced rather than an oversight -- the reasoning is on `undo` above. In short:
                Button's guard returns before onClick when the attribute is true, so the attribute
                and the "Nothing to undo." sentence cannot both exist, and the sentence is worth
                more than the dimming. The focus hazard the attribute was hedging against goes away
                with it, since a control that is never disabled cannot blur itself.

                CENTERED, on the same axis as the two rows above it. It used to be `justify-between`,
                which was a two-child rule applied to a row that only ever held one child -- so it
                resolved to flex-start and pinned the only control on the tray to the left gutter
                while the numbers and the signs were centered over it. The row genuinely holds three
                children now, and `justify-between` would be wrong for a NEW reason: it would push
                Undo and the hint control into opposite gutters with a hole between them, when what
                these three are is a set of objects laid out together on a surface.

                `flex-wrap` is the tightest constraint on this bench and jsdom cannot check it --
                nothing here is laid out, and style assertions are banned. So the arithmetic has to
                be right, and it was measured against the wrong viewport: 340px is what a 372 window
                gives, but the bank's own comment above establishes 320 as a supported width and 288
                as the room there. Undo (~72) plus Clear (~68) plus a hint control reading "Open hint
                1 of 3" (~148) plus two 12px gaps is ~312 -- which fits 340 with ~28px to spare and
                does NOT fit 288 at any text size. A wrap here is not a cosmetic overflow: it adds
                44 + 12 = 56px to a tray budgeted at exactly 179px of a 240px --lull-seam, so the row
                would eat the seam every other bench is measured against.

                THE FIX HAS LANDED, in hint-bar rather than here. `controlLabel` now returns a PAIR --
                "Hint 1 of 3" visible, "Open hint 1 of 3" as the accessible name -- which buys ~34px
                and brings the row to ~278 against 288. It had to be the hint control and not Undo or
                Clear, because those two have no spare name to give: WCAG 2.5.3 requires the
                accessible name to contain the visible label, and "Hint 1 of 3" is a substring of
                "Open hint 1 of 3" while "Undo" is already the whole of its own visible half.

                So this row fits at 320 by ARITHMETIC, and the arithmetic is all anything here can
                offer: jsdom lays nothing out and this project forbids style assertions, so no test
                in the repo can catch the row wrapping. The widest visible state is the one measured
                above -- "2 hints" and "Hide hints" are both shorter -- but if any of these three
                labels ever grows, nothing will fail. Measure it in the app. */}
            <div className={ROW}>
              {isSolved ? (
                <Button onClick={playAgain} variant="floorPrimary">
                  Play again
                </Button>
              ) : (
                <Button aria-label="Undo the last tile" onClick={undo}>
                  Undo
                </Button>
              )}
              <Button aria-label="Clear every square" onClick={clear}>
                Clear
              </Button>
              {/* `bare` because this row already owns its gutter, its ground and its 44px: the
                  `inline` variant's py-2 would make 60px out of a 44px row and its px-4 would
                  re-apply a gutter that is already here.

                  CONTROLLED, which is what keeps this subtree free of storage. goFigure's rungs do
                  something to the squares rather than only saying something about them, so the
                  opened count rides in the progress string beside the locks it produced -- one
                  event in one place. Split across `lull:hints:<puzzleId>` and the board, the two
                  could disagree, and a board showing locked squares while offering "Open hint 1 of
                  3" is a state no test would think to write. */}
              {hasLadder && (
                <HintBar
                  control={{ onOpen: openHint, opened: state.opened }}
                  hints={puzzle.data.hints}
                  puzzleId={puzzle.id}
                  // THE OPEN/SHUT STATE IS THE BAR'S, and this is the only way to move it from
                  // here. Zeroing `opened` moves the count and leaves the sheet standing, which on
                  // Play again meant an empty list over a fresh board and a keyboard that declined
                  // every key. See `playAgain` for why it is a signal and not a changed `key`.
                  resetSignal={resetNonce}
                  solution={solution}
                  variant="bare"
                />
              )}
            </div>
          </div>
        </FloorBar>
      </section>
    </>
  )
}
