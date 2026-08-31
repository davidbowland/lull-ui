import {
  AnagramHintEntry,
  chooseThemedAnagramsRung,
  themedAnagramsHintFor,
  ThemedAnagramsPlayerState,
  ThemedAnagramsSpentRung,
} from '@rules/hint-themed-anagrams'

import { isRight } from './answers'
import { attachHints, decode, decodeHints, encode, Guesses, ThemedAnagramsHintTail } from './progress'
import type { HintAdapter } from '@registry'
import { HintLadder, Puzzle, PuzzleProgress, ThemedAnagramsData } from '@types'

// THE ONLY PLACE THIS TYPE'S CODEC MEETS THE VENDORED RULE. `progress.ts` stores a record it never
// interprets and `hint-themed-anagrams.ts` chooses and renders records it never stores; this file is
// the join. The shell reaches it through the registry and learns no grammar.
//
// THE BOARD READS HINT STATE AND NEVER WRITES IT. A board reads it exactly when a hint changes what
// it DRAWS, and this one pins revealed letters into their true positions in the scramble -- so it
// reads the spent list off its live progress prop and runs `pinnedIndices` and `pinnedDisplay`
// itself. Its `encode` signature is unchanged, PuzzleFrame re-attaches the tail through `merge`, and
// the second writer that would otherwise erase a paid-for rung is unrepresentable rather than merely
// discouraged.

// The ladder's ceiling, and a bound on a loop that feeds itself. `chooseThemedAnagramsRung` already
// refuses a fourth rung -- `RUNG_COUNT` is 3 in the rule -- so this is belt and braces on a `while`
// whose terminating condition is a value the rule returns. A redraw loop with no bound of its own is
// the shape this codebase refuses to write, and a fold is a redraw loop wearing different clothes.
const MAX_RUNGS = 3

// Structural, in the register `hintsOf` and `answerOf` already use: a pack is JSON off the network
// that was persisted, and `isValidPuzzle` deliberately leaves `data` opaque. It answers with what the
// rule DEREFERENCES and nothing else -- an `answer` string per entry -- so an entry whose answer never
// arrived contributes '' and every rung the rule could aim at it is refused by its own
// `leavesEnoughFree` gate rather than by a guard here.
//
// EXACTLY FOUR OR NOTHING, which is the same refusal the board makes and for the same reason: every
// consumer downstream assumes four rows, and a ladder built over three would name entries a board
// that refuses to draw them can never show.
const entriesOf = (puzzle: Puzzle<unknown>): AnagramHintEntry[] => {
  const entries = (puzzle.data as ThemedAnagramsData | null)?.entries
  if (!Array.isArray(entries) || entries.length !== 4) return []

  return entries.map((entry) => ({
    answer:
      typeof (entry as { answer?: unknown } | null)?.answer === 'string' ? (entry as AnagramHintEntry).answer : '',
  }))
}

/**
 * Which of the four the player has already got, which is the whole of the player state this rule
 * takes.
 *
 * IT GOES THROUGH `isRight` RATHER THAN COMPARING NORMALIZED STRINGS HERE, and that is why that
 * helper was lifted out of the board. "Right" has to mean one thing on this bench: a rung aimed at a
 * word the player has already solved is a rung spent on nothing, and a ladder that disagreed with the
 * board about which rows are won would spend them on exactly the rows the board had already closed.
 */
const solvedIn = (entries: AnagramHintEntry[], guesses: Guesses): boolean[] =>
  entries.map((entry, index) => isRight(guesses[index], entry.answer))

/**
 * The rungs bought, followed by the rungs that WOULD be bought, folded forward from live state.
 *
 * THE SPECULATIVE TAIL IS COMPUTED AND NEVER COMMITTED, and that split is what closes the hint-farm
 * hole. HintBar draws `slice(0, opened)`, so the tail is never shown; a rung is frozen into the
 * stored record at the moment it is bought and rendered from that record forever after. Recomputed
 * from live state on every render instead, a player could open rung 1, learn something, and watch
 * rung 1 silently upgrade itself into a better hint -- an unbounded supply of rungs for one press.
 *
 * THE FOLD DOES NOT MUTATE ANYTHING IT WAS GIVEN. `probe` starts as a copy of the spent list, and
 * `chooseThemedAnagramsRung` reads it for two separate decisions -- which KIND is due, since the
 * three escalate positionally, and which entries the ladder has already used -- so the fold has to
 * feed each speculative rung back in rather than calling the rule three times with the same
 * argument: three identical calls would answer "initial on the longest unsolved entry" three times.
 *
 * NOTHING HERE DRAWS. Every choice the rule makes is a total order over answer length and index, so
 * the tail is stable for a given board with no seed to carry.
 */
const grow = (
  entries: AnagramHintEntry[],
  state: ThemedAnagramsPlayerState,
  spent: ThemedAnagramsSpentRung[],
): ThemedAnagramsSpentRung[] => {
  const probe = [...spent]

  while (probe.length < MAX_RUNGS) {
    const next = chooseThemedAnagramsRung(entries, state, probe)
    // ONE TO THREE RUNGS, NEVER ALWAYS THREE. Null means every entry is solved, or that no entry has
    // room left for this rung without pinning all but one of its positions -- and a rung a player
    // does not have beats a rung that spells the answer onto the board. The tail stops rather than
    // padding.
    if (next === null) break
    probe.push(next)
  }

  return probe
}

// A board with every row still to win. Four members because `entriesOf` answers with exactly four or
// with none, so there is no shorter honest way to say it and no length to derive.
const NOTHING_SOLVED: ThemedAnagramsPlayerState = { solved: [false, false, false, false] }

const fold = (entries: AnagramHintEntry[], guesses: Guesses, spent: ThemedAnagramsSpentRung[]) => {
  const probe = grow(entries, { solved: solvedIn(entries, guesses) }, spent)
  if (probe.length > 0) return probe

  // A WON BOARD HAS NOTHING LEFT TO CHOOSE, AND THE BAND STILL HAS TO STAND. All four rows right is
  // the only state that empties this fold on a drawable pack -- every rung aims at an unsolved entry
  // -- and it arrives on the winning KEYSTROKE, for the player who bought nothing, which is most of
  // them. An empty ladder is null, null unmounts a 60px `shrink-0` band, and the board would re-lay
  // itself out at the instant of the solve. Worse, an unlocked box can still be cleared, so the band
  // flickered as a player toggled the last letter.
  //
  // So a won board shows the ladder a fresh one would have shown. That is honest rather than a
  // placeholder: the rungs are speculative, HintBar draws only `slice(0, opened)`, and a player who
  // has already won reads a hint about an answer standing in the box beside it. What it buys is the
  // band -- and with it the answer reveal, which `controlLabel` reaches only through a ladder.
  //
  // It cannot fire on a pack this board refuses to draw: `entriesOf` answers with no entries, so the
  // fresh fold is empty too and the frame draws no bar at all, which is the right answer there.
  //
  // NOTHING BOUGHT CAN BE REPLACED BY IT. A non-empty `spent` makes `grow` non-empty whatever the
  // state, so this branch is reachable only with an empty ladder in hand.
  return grow(entries, NOTHING_SOLVED, [])
}

/**
 * How Themed Anagrams computes its own ladder, and the entry the registry hangs off `themedanagrams`.
 *
 * `ladder` renders the spent rungs through `themedAnagramsHintFor`, which is pure in `entries`, so a
 * rung reads the same sentence forever however many rows the player has closed since. The speculative
 * tail is appended from the fold above.
 *
 * `merge` is the one-writer rule for this type: the board wrote four newline-joined drafts and knows
 * nothing of the two hint fields, so the tail is re-attached from what is stored. IT EXTENDS EVERY
 * BOARD WRITE, INCLUDING ''.
 *
 * IT USED TO ANSWER '' WITH '', and on this bench that destroyed purchases on an ordinary keystroke.
 * `encode` writes '' whenever all four drafts are empty and `change` calls it on every keystroke, so
 * type a draft, buy two rungs, backspace to empty and the ladder was gone: `opened` back to 0, the
 * pinned letters unpinned, the bar re-offering "Hint 1 of 3". The other two benches never met it --
 * cryptogram's `apply` refuses to clear a locked square, so `encode` cannot reach '' once a rung is
 * bought, and phrazle's `encode([])` is `{"guesses":[]}`. This one had only the argument that '' has
 * two producers and one of them is Play again.
 *
 * THE OTHER PRODUCER IS WHY THE SHELL DOES THE DROPPING NOW. `playAgain` calls `onProgress('')` AND
 * `onReset()`; `change` calls only the first. So the two are already distinguishable from outside the
 * board, by the signal the board already raises, and PuzzleFrame drops the ladder there -- see its
 * `onReset`. The board learns nothing it did not already know, and a backspace stops costing a
 * purchase.
 *
 * THE ARGUMENT THAT USED TO STAND HERE WAS THAT KEEPING THE TAIL LIES TO `wasSolvedBefore` AND THE
 * SHELF, and it does not survive being read twice. Those two flags mean "this player has started this
 * puzzle", and a player who has spent two hints on it has started it. `|2|I2,B3` beside four empty
 * boxes reports a started board because the board IS started; what would be the lie is coming back to
 * find the rungs gone.
 *
 * `opened` reads the stored count rather than the length of the spent list, because the last step a
 * bar can sell is the ANSWER and there is no rung for it. See `ThemedAnagramsHintTail` in progress.ts.
 *
 * `open` returns the next progress string or null. Null is a decline and the count stays where it is,
 * which is what HintBar documents for a controlled owner that says no. IT WRITES NO DRAFT: unlike
 * cryptogram, a rung here changes the DISPLAY and never the player's typing, so the board portion is
 * copied through untouched and the input box is left entirely alone.
 */
export const themedAnagramsHints: HintAdapter = {
  ladder: (puzzle: Puzzle<unknown>, progress: PuzzleProgress): HintLadder | null => {
    const entries = entriesOf(puzzle)
    const { guesses, hints, opened } = decode(progress)

    // THE REVEAL CLOSES THE LADDER, and this is what makes "the tail is never shown" true rather than
    // nearly true. `opened` exceeds the bought rung count in exactly one state -- the answer has been
    // taken -- and HintBar draws `slice(0, opened)`. The tail is folded from LIVE state, so it
    // regrows when a solved row is cleared, and the slice then reached one rung into it: a hint
    // nobody bought, on screen, free. It also pushed `hints.length` back above `opened`, which takes
    // "Show answer" off the control and replaces it with an offer of a rung the player has already
    // paid past.
    const probe = opened > hints.length ? hints : fold(entries, guesses, hints)

    // An empty ladder is not a short ladder. The frame reads null the way it reads a malformed pack
    // ladder -- no bar at all -- which is the right answer for a pack this board would refuse to
    // draw, and is now the ONLY thing that reaches it: see `fold` for why a won board keeps its band.
    return probe.length === 0 ? null : (probe.map((rung) => themedAnagramsHintFor(entries, rung)) as HintLadder)
  },

  merge: (boardWrite: PuzzleProgress, current: PuzzleProgress): PuzzleProgress =>
    attachHints(boardWrite, decodeHints(current)),

  open: (puzzle: Puzzle<unknown>, progress: PuzzleProgress): PuzzleProgress | null => {
    const entries = entriesOf(puzzle)
    const { guesses, hints, opened } = decode(progress)
    const probe = fold(entries, guesses, hints)

    // Nothing to sell on a board with no ladder, and nothing left once the answer is out. `opened`
    // exceeds the BOUGHT rung count in exactly one state -- the reveal has been taken -- which is
    // why the comparison is against `hints` rather than against the folded probe: the probe grows
    // and shrinks as rows are won and un-won, and a bar that measured itself against a moving tail
    // could sell the answer twice and write a count `decode` would then refuse.
    if (probe.length === 0 || opened > hints.length) return null

    // THE STEP PAST THE LAST RUNG IS THE ANSWER, and it advances the count without appending a rung.
    // This is the branch a derived count cannot express, and the whole reason `opened` is stored:
    // HintBar reaches "Show answer" only when `opened > hints.length`, so an adapter that stopped at
    // its own last rung would take the reveal away from this bench.
    const tail: ThemedAnagramsHintTail =
      opened === probe.length
        ? { hints, opened: opened + 1 }
        : { hints: probe.slice(0, opened + 1), opened: opened + 1 }

    // `encode(guesses)` rather than the stored string, so the board portion this writes is one the
    // decoder above just accepted. A string it refused would otherwise be carried forward verbatim
    // and refused again on every later load, with the ladder growing beside four drafts nothing can
    // read.
    return attachHints(encode(guesses), tail)
  },

  opened: (progress: PuzzleProgress): number => decodeHints(progress).opened,
}
