import { choosePhrazleRung, phrazleHintFor, PhrazleSpentRung, seededRandom } from '@rules/hint-phrazle'

import { attachHints, decode, decodeHints, PhrazleHintTail } from './progress'
import type { HintAdapter } from '@registry'
import { HintLadder, PhrazleData, Puzzle, PuzzleProgress } from '@types'

// THE ONLY PLACE THIS TYPE'S CODEC MEETS THE VENDORED RULE. `progress.ts` stores a record it never
// interprets and `hint-phrazle.ts` chooses and renders records it never stores; this file is the
// join, and it is the only file that imports both. The shell reaches it through the registry and
// learns no grammar, and the board is handed nothing at all.
//
// THE BOARD DOES NOT CHANGE AND IS NOT TOLD. Phrazle's rungs are sentences in the shell's hint bar --
// "The phrase has no D, no G, and no P." -- and they change no tile, no color and no row. A board
// reads hint state exactly when a hint changes what it draws, so cryptogram (which locks a letter
// into its grid) and Themed Anagrams (which pins letters into place) read theirs, and this one is
// handed no way to. That is a rule rather than an exception list, and this bench is the side of it
// that costs nothing.

// The ladder's ceiling, and a bound on a loop that feeds itself. `choosePhrazleRung` already refuses
// a fourth rung -- `RUNG_COUNT` is 3 in the rule -- so this is belt and braces on a `while` whose
// terminating condition is a value the rule returns. A redraw loop with no bound of its own is the
// shape this codebase refuses to write, and a fold is a redraw loop wearing different clothes.
const MAX_RUNGS = 3

// Structural, in the register `hintsOf` and `answerOf` already use: a pack is JSON off the network
// that was persisted, and `isValidPuzzle` deliberately leaves `data` opaque. An answer that did not
// arrive yields '', which `splitPhrase` turns into no words, which `choosePhrazleRung` answers null
// to -- so an undrawable pack produces no ladder and the frame draws no bar, rather than throwing
// inside a render the ErrorBoundary would answer by replacing the whole app.
const answerOf = (puzzle: Puzzle<unknown>): string => {
  const answer = (puzzle.data as PhrazleData | null)?.answer
  return typeof answer === 'string' ? answer : ''
}

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
 * `choosePhrazleRung` reads it to decide which KINDS are still available -- which is why the fold has
 * to feed each speculative rung back in rather than calling the rule three times with the same
 * argument: three identical calls would answer with the same kind three times.
 *
 * `random` IS SEEDED FROM THE PUZZLE ID, and it is required rather than defaulted for a reason this
 * function is the worked case of. Only rung 1 draws, this runs on every render, and an unseeded draw
 * would re-pick three absent letters each time -- so the rung a player SEES in the tail need not be
 * the rung they BUY. Seeding it makes the tail stable for a given board, and the freeze at purchase
 * makes it permanent afterwards.
 */
const fold = (puzzle: Puzzle<unknown>, progress: PuzzleProgress): PhrazleSpentRung[] => {
  const answer = answerOf(puzzle)
  const { guesses, hints = [] } = decode(progress, answer)

  const data = { answer }
  const state = { guesses }
  const random = seededRandom(puzzle.id)

  const probe = [...hints]
  while (probe.length < MAX_RUNGS) {
    const next = choosePhrazleRung(data, state, probe, random)
    // ONE TO THREE RUNGS, NEVER ALWAYS THREE. Null means no kind has anything left worth saying --
    // every absent letter already ruled out, every present letter already met -- and a rung a player
    // does not have beats a rung that tells them what they already know. The tail stops rather than
    // padding.
    if (next === null) break
    probe.push(next)
  }

  return probe
}

/**
 * How Phrazle computes its own ladder, and the entry the registry hangs off `phrazle`.
 *
 * `ladder` renders the spent rungs through `phrazleHintFor`, which is pure in the answer, so a rung
 * reads the same sentence forever however much the player has learned since. The speculative tail is
 * appended from the fold above.
 *
 * `merge` is the one-writer rule for this type: the board wrote `{"guesses":[...]}` and knows nothing
 * of the two hint fields, so the tail is re-attached from what is stored. A board write of '' is
 * Play again, and it answers '' -- re-attaching a ladder there would hand a player back rungs they
 * threw away on a board that no longer has them, and '' is also what the shell reads as "no
 * progress".
 *
 * `opened` reads the stored count rather than the length of the spent list, because the last step a
 * bar can sell is the ANSWER and there is no rung for it. See `PhrazleHintTail` in progress.ts.
 *
 * `open` returns the next progress string or null. Null is a decline and the count stays where it
 * is, which is what HintBar documents for a controlled owner that says no.
 */
export const phrazleHints: HintAdapter = {
  ladder: (puzzle: Puzzle<unknown>, progress: PuzzleProgress): HintLadder | null => {
    const answer = answerOf(puzzle)
    const probe = fold(puzzle, progress)

    // An empty ladder is not a short ladder. The frame reads null the way it reads a malformed pack
    // ladder -- no bar at all -- which is the right answer for a pack whose answer never arrived,
    // and the only input that can reach it: with at least one word in the phrase the word rung's
    // pool can never run dry.
    return probe.length === 0 ? null : (probe.map((rung) => phrazleHintFor({ answer }, rung)) as HintLadder)
  },

  merge: (boardWrite: PuzzleProgress, current: PuzzleProgress): PuzzleProgress =>
    boardWrite === '' ? '' : attachHints(boardWrite, decodeHints(current)),

  open: (puzzle: Puzzle<unknown>, progress: PuzzleProgress): PuzzleProgress | null => {
    const probe = fold(puzzle, progress)
    const { hints, opened } = decodeHints(progress)

    // Nothing to sell on a board with no ladder, and nothing left once the answer is out. The frame
    // draws no bar in the first case, so the guard is for a caller rather than for a player.
    if (probe.length === 0 || opened > probe.length) return null

    // THE STEP PAST THE LAST RUNG IS THE ANSWER, and it advances the count without appending a rung.
    // This is the branch a derived count cannot express, and the whole reason `opened` is stored:
    // HintBar reaches "Show answer" only when `opened > hints.length`, so an adapter that stopped at
    // its own last rung would take the reveal away from this bench.
    const tail: PhrazleHintTail =
      opened === probe.length
        ? { hints, opened: opened + 1 }
        : { hints: probe.slice(0, opened + 1), opened: opened + 1 }

    return attachHints(progress, tail)
  },

  opened: (progress: PuzzleProgress): number => decodeHints(progress).opened,
}
