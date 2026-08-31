import {
  AnagramHintEntry,
  chooseThemedAnagramsRung,
  themedAnagramsHintFor,
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
const fold = (entries: AnagramHintEntry[], guesses: Guesses, spent: ThemedAnagramsSpentRung[]) => {
  const state = { solved: solvedIn(entries, guesses) }
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

/**
 * How Themed Anagrams computes its own ladder, and the entry the registry hangs off `themedanagrams`.
 *
 * `ladder` renders the spent rungs through `themedAnagramsHintFor`, which is pure in `entries`, so a
 * rung reads the same sentence forever however many rows the player has closed since. The speculative
 * tail is appended from the fold above.
 *
 * `merge` is the one-writer rule for this type: the board wrote four newline-joined drafts and knows
 * nothing of the two hint fields, so the tail is re-attached from what is stored. A board write of ''
 * is Play again, and it answers '' -- re-attaching a ladder there would hand a player back rungs they
 * threw away on a board that no longer has them, and '' is also what the shell reads as "no progress".
 *
 * That is the one place `encode`'s own '' and Play again's '' are the same string and mean the same
 * thing, which is why this needs no `onReset` of its own: a player who deletes their four drafts one
 * key at a time genuinely does write '', and the board's own comment calls charging them their rungs
 * for a backspace a trap. It is not one here, because the board never writes '' through this except
 * from those two paths, and Play again is the one the player asked for. The cost of the other is a
 * ladder lost to an emptied board, which is the same trade cryptogram makes one bench over.
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
    const { guesses, hints } = decode(progress)
    const probe = fold(entries, guesses, hints)

    // An empty ladder is not a short ladder. The frame reads null the way it reads a malformed pack
    // ladder -- no bar at all -- which is the right answer for a pack this board would refuse to
    // draw, and for the endgame state where all four rows are already won.
    return probe.length === 0 ? null : (probe.map((rung) => themedAnagramsHintFor(entries, rung)) as HintLadder)
  },

  merge: (boardWrite: PuzzleProgress, current: PuzzleProgress): PuzzleProgress =>
    boardWrite === '' ? '' : attachHints(boardWrite, decodeHints(current)),

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
