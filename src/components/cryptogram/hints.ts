import {
  chooseCryptogramRung,
  CryptogramHintData,
  cryptogramHintFor,
  CryptogramSpentRung,
  revealedCiphers,
  trueMapping,
} from '@rules/hint-cryptogram'

import { attachHints, CryptogramHintTail, decode, decodeHints, encode, Mapping, withRevealed } from './mapping'
import type { HintAdapter } from '@registry'
import { CryptogramData, HintLadder, Puzzle, PuzzleProgress } from '@types'

// THE ONLY PLACE THIS TYPE'S CODEC MEETS THE VENDORED RULE. `mapping.ts` stores a record it never
// interprets and `hint-cryptogram.ts` chooses and renders records it never stores; this file is the
// join. The shell reaches it through the registry and learns no grammar.
//
// THE BOARD READS HINT STATE, AND ON THIS BENCH THAT IS THE RULE RATHER THAN AN EXCEPTION. A board
// reads it exactly when a hint changes what it DRAWS -- cryptogram fills squares and locks them, so
// it must -- and the board reaches the rule directly for the two facts it needs, `revealedCiphers`
// and `revealedLetters` below. What the board does NOT get is a way to WRITE the field: its `encode`
// signature is unchanged, PuzzleFrame re-attaches the tail through `merge`, and the second writer
// that would otherwise erase a paid-for rung is unrepresentable rather than merely discouraged.

// The ladder's ceiling, and a bound on a loop that feeds itself. `chooseCryptogramRung` already
// refuses a fourth rung -- `RUNG_COUNT` is 3 in the rule -- so this is belt and braces on a `while`
// whose terminating condition is a value the rule returns. A redraw loop with no bound of its own is
// the shape this codebase refuses to write, and a fold is a redraw loop wearing different clothes.
const MAX_RUNGS = 3

// Structural, in the register `hintsOf` and `answerOf` already use: a pack is JSON off the network
// that was persisted, and `isValidPuzzle` deliberately leaves `data` opaque. A field that did not
// arrive yields '', which gives `trueMapping` no letters to align, which gives `chooseCryptogramRung`
// no candidates and no words -- so an undrawable pack produces no ladder and the frame draws no bar,
// rather than throwing inside a render the ErrorBoundary would answer by replacing the whole app.
export const hintDataOf = (puzzle: Puzzle<unknown>): CryptogramHintData => {
  const data = puzzle.data as CryptogramData | null
  return {
    answer: typeof data?.answer === 'string' ? data.answer : '',
    ciphertext: typeof data?.ciphertext === 'string' ? data.ciphertext : '',
  }
}

/**
 * The letters the spent rungs have handed over, as a mapping the board can draw.
 *
 * EXPORTED FOR THE BOARD, which computes it on every render from the live progress prop. That is
 * what makes a bought rung appear at once with no remount and nothing the player typed lost: the
 * board's own state stays the board's, and this is overlaid onto it by `withRevealed`.
 *
 * IT IS NOT THE SAME SET AS `revealedCiphers`, and the difference only shows on a pack that cannot
 * be solved anyway. `trueMapping` aligns the ciphertext's letters with the answer's, so a pack whose
 * answer is shorter than its ciphertext leaves some cipher letters with no true letter at all. Those
 * are LOCKED -- the board reads its lock set off `revealedCiphers`, which is the rule's own record of
 * what a rung handed over -- and they carry nothing, which is the honest rendering of a rung that
 * revealed a letter the pack never shipped. Locking them is what stops the board from claiming the
 * player could still fill them in.
 */
export const revealedLetters = (data: CryptogramHintData, spent: CryptogramSpentRung[]): Mapping => {
  const truth = trueMapping(data)
  return Object.fromEntries(
    [...revealedCiphers(data, spent)]
      .filter((cipher) => truth[cipher] !== undefined)
      .map((cipher) => [cipher, truth[cipher]]),
  )
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
 * `chooseCryptogramRung` reads it to decide which letters are already out and whether the word rung
 * is gone -- which is why the fold has to feed each speculative rung back in rather than calling the
 * rule three times with the same argument: three identical calls would answer with the same letter
 * three times.
 *
 * NOTHING HERE DRAWS. Unlike Phrazle, every choice this rule makes is a total order over the
 * ciphertext's own letter counts, so the tail is stable for a given board with no seed to carry.
 */
const fold = (data: CryptogramHintData, mapping: Mapping, spent: CryptogramSpentRung[]): CryptogramSpentRung[] => {
  const state = { mapping }
  const probe = [...spent]

  while (probe.length < MAX_RUNGS) {
    const next = chooseCryptogramRung(data, state, probe)
    // ONE TO THREE RUNGS, NEVER ALWAYS THREE. Null means nothing left has anything worth saying --
    // every cipher letter either already mapped correctly or already handed over, and the word rung
    // spent -- and a rung a player does not have beats a rung that tells them what they already
    // know. The tail stops rather than padding.
    if (next === null) break
    probe.push(next)
  }

  return probe
}

/**
 * How Cryptogram computes its own ladder, and the entry the registry hangs off `cryptogram`.
 *
 * `ladder` renders the spent rungs through `cryptogramHintFor`, which is pure in the puzzle, so a
 * rung reads the same sentence forever however much the player has typed since. The speculative tail
 * is appended from the fold above.
 *
 * `merge` is the one-writer rule for this type: the board wrote `<pairs>` and knows nothing of the
 * two hint fields, so the tail is re-attached from what is stored. A board write of '' is the state
 * `encode({})` produces when the last letter is cleared -- NOT a reset, because this bench has no
 * Play again and no `onReset` at all -- and it is answered with '' regardless, because '' is what
 * the shell reads as "no progress" and a ladder hanging off it would be a board that reads as
 * untouched while carrying a purchase.
 *
 * Losing the rungs there is the cost, and it is one press of the eraser away on a board with a
 * single letter on it. It is accepted because the alternative is worse: `|2|LE,LZ` is a string
 * `wasSolvedBefore` and the shelf both read as started, and a bench that reported itself started
 * because a hint was bought would be lying about the only thing those two flags mean. The squares a
 * rung filled are also still on the board -- clearing the LAST letter is what writes '', and a
 * locked square cannot be cleared -- so this is reachable only from a board whose every remaining
 * letter is the player's own, which is a board that has no locked squares on it.
 *
 * `opened` reads the stored count rather than the length of the spent list, because the last step a
 * bar can sell is the ANSWER and there is no rung for it. See `CryptogramHintTail` in mapping.ts.
 *
 * `open` returns the next progress string or null. Null is a decline and the count stays where it
 * is, which is what HintBar documents for a controlled owner that says no.
 */
export const cryptogramHints: HintAdapter = {
  ladder: (puzzle: Puzzle<unknown>, progress: PuzzleProgress): HintLadder | null => {
    const data = hintDataOf(puzzle)
    const { hints, mapping } = decode(progress, data.ciphertext)
    const probe = fold(data, mapping, hints)

    // An empty ladder is not a short ladder. The frame reads null the way it reads a malformed pack
    // ladder -- no bar at all -- which is the right answer for a pack whose ciphertext never
    // arrived, and very nearly the only input that can reach it: a board with an unmapped cipher
    // letter always has a letter rung, and a ciphertext with a word in it always has a word rung.
    return probe.length === 0 ? null : (probe.map((rung) => cryptogramHintFor(data, rung)) as HintLadder)
  },

  merge: (boardWrite: PuzzleProgress, current: PuzzleProgress): PuzzleProgress =>
    boardWrite === '' ? '' : attachHints(boardWrite, decodeHints(current)),

  open: (puzzle: Puzzle<unknown>, progress: PuzzleProgress): PuzzleProgress | null => {
    const data = hintDataOf(puzzle)
    const { hints, mapping, opened } = decode(progress, data.ciphertext)
    const probe = fold(data, mapping, hints)

    // Nothing to sell on a board with no ladder, and nothing left once the answer is out. `opened`
    // exceeds the BOUGHT rung count in exactly one state -- the reveal has been taken -- which is
    // why the comparison is against `hints` rather than against the folded probe: the probe can grow
    // between two visits as a player un-maps a letter they had right, and a bar that measured itself
    // against a moving tail could sell the answer twice and write a count `decode` would then refuse.
    if (probe.length === 0 || opened > hints.length) return null

    // THE STEP PAST THE LAST RUNG IS THE ANSWER, and it advances the count without appending a rung
    // or touching a square. This is the branch a derived count cannot express, and the whole reason
    // `opened` is stored: HintBar reaches "Show answer" only when `opened > hints.length`, so an
    // adapter that stopped at its own last rung would take the reveal away from this bench.
    if (opened === probe.length) return attachHints(encode(mapping), { hints, opened: opened + 1 })

    // THE PURCHASE WRITES THE BOARD, which is what separates this bench from Phrazle's. The rung's
    // letters go into the mapping through `withRevealed` -- the same function the board draws with
    // -- so the string that is stored and the squares that are painted are one arrangement rather
    // than two that have to agree. It steals: a wrong guess sitting on a revealed letter is released
    // rather than left to contradict the square the rung just filled.
    const spent = probe.slice(0, opened + 1)
    const tail: CryptogramHintTail = { hints: spent, opened: opened + 1 }
    return attachHints(encode(withRevealed(mapping, revealedLetters(data, spent))), tail)
  },

  opened: (progress: PuzzleProgress): number => decodeHints(progress).opened,
}
