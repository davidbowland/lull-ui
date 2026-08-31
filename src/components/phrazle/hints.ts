import { choosePhrazleRung, phrazleHintFor, PhrazleSpentRung, seededRandom } from '@rules/hint-phrazle'

import { attachHints, decode, decodeHints, encode, PhrazleHintTail } from './progress'
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
 * of the two hint fields, so the tail is re-attached from what is stored. IT EXTENDS EVERY BOARD
 * WRITE, INCLUDING ''.
 *
 * A BOARD WRITE OF '' IS PLAY AGAIN ON THIS BENCH AND ONLY PLAY AGAIN -- `encode([])` is
 * `{"guesses":[]}`, so an emptied board is not '' here the way it is one bench over -- and it is
 * extended anyway rather than answered with ''. Reading '' as "start over" is the guess that cost
 * Themed Anagrams a purchase on a backspace, and three adapters saying the same sentence in the same
 * words has to mean the same thing in all three. The reset is the shell's, off `onReset`, which
 * `playAgain` raises immediately after this write and PuzzleFrame answers by storing '' over the
 * whole record.
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
    const { hints, opened } = decodeHints(progress)

    // THE REVEAL CLOSES THE LADDER, and this is what makes "the tail is never shown" true rather than
    // nearly true. `opened` exceeds the bought rung count in exactly one state -- the answer has been
    // taken -- and HintBar draws `slice(0, opened)`. The tail is folded from LIVE state, so a slice
    // one past the bought rungs reaches into it: a hint nobody bought, on screen, free. It also
    // pushes `hints.length` back above `opened`, which takes "Show answer" off the control and
    // replaces it with an offer of a rung the player has already paid past. This bench's tail is the
    // steadiest of the three -- guesses only accumulate -- and the rule is stated the same way on all
    // three, because a sentence three adapters make in identical words has to be true in all three.
    const probe = opened > hints.length ? hints : fold(puzzle, progress)

    // An empty ladder is not a short ladder. The frame reads null the way it reads a malformed pack
    // ladder -- no bar at all -- which is the right answer for a pack whose answer never arrived,
    // and the only input that can reach it: with at least one word in the phrase the word rung's
    // pool can never run dry.
    return probe.length === 0 ? null : (probe.map((rung) => phrazleHintFor({ answer }, rung)) as HintLadder)
  },

  merge: (boardWrite: PuzzleProgress, current: PuzzleProgress): PuzzleProgress =>
    attachHints(boardWrite, decodeHints(current)),

  open: (puzzle: Puzzle<unknown>, progress: PuzzleProgress): PuzzleProgress | null => {
    const answer = answerOf(puzzle)
    const { guesses } = decode(progress, answer)
    const probe = fold(puzzle, progress)
    const { hints, opened } = decodeHints(progress)

    // Nothing to sell on a board with no ladder. The frame draws no bar in that case, so this guard
    // is for a caller rather than for a player.
    if (probe.length === 0) return null

    // THE ANSWER IS OUT, AND THAT IS MEASURED AGAINST `hints.length`, NEVER `probe.length`. The two
    // are not interchangeable and the difference is a real defect rather than a style choice: `probe`
    // is the SPECULATIVE fold, so its length moves with the board, while the committed rung list does
    // not. Measured against a moving tail, a board whose tail grew after the reveal was bought reads
    // as having a rung still to sell, sells the answer a second time, and writes `hints.length + 2`
    // -- which `decode` refuses outright, taking the player's whole ladder with it. `hints.length` is
    // exact and cannot drift, which is why cryptogram's adapter measures the same way.
    if (opened > hints.length) return null

    // THE STEP PAST THE LAST RUNG IS THE ANSWER, and it advances the count without appending a rung.
    // This is the branch a derived count cannot express, and the whole reason `opened` is stored:
    // HintBar reaches "Show answer" only when `opened > hints.length`, so an adapter that stopped at
    // its own last rung would take the reveal away from this bench.
    //
    // A rung is still for sale exactly when the fold found one the player has not bought. Once it
    // finds nothing new, the ladder is complete at whatever length it reached -- one, two or three --
    // and the next step is the reveal.
    const tail: PhrazleHintTail =
      opened < probe.length ? { hints: probe.slice(0, opened + 1), opened: opened + 1 } : { hints, opened: opened + 1 }

    // `encode(guesses)` rather than the stored string, so the board portion this writes is one the
    // decoder above just accepted -- the same thing themedanagrams' `open` does one bench over, and
    // this one used to be the odd one out with no comment saying why. `attachHints` copies whatever
    // `guesses` array it finds in the string it is handed, so passing `progress` carried forward rows
    // `decode` would truncate on shape and walked straight past `encode`'s MAX_STORED window: a
    // hand-edited key holding fifty guesses grew by a rung on every purchase and was re-refused on
    // every load, with a ladder standing beside a history nothing can restore.
    return attachHints(encode(guesses), tail)
  },

  opened: (progress: PuzzleProgress): number => decodeHints(progress).opened,
}
