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
const grow = (data: CryptogramHintData, mapping: Mapping, spent: CryptogramSpentRung[]): CryptogramSpentRung[] => {
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

// A board with nothing filled in, which is what a solved one looks like to this rule.
const EMPTY_BOARD: Mapping = {}

const fold = (data: CryptogramHintData, mapping: Mapping, spent: CryptogramSpentRung[]): CryptogramSpentRung[] => {
  const probe = grow(data, mapping, spent)
  if (probe.length > 0) return probe

  // A SOLVED BOARD HAS NOTHING LEFT TO CHOOSE, AND THE BAND STILL HAS TO STAND. A fully correct
  // mapping is the only state that empties this fold on a drawable pack -- every rung aims at a
  // cipher letter the player has not got right -- and it arrives on the winning KEYSTROKE, for the
  // player who bought nothing, which is most of them. An empty ladder is null, null unmounts a 60px
  // `shrink-0` band, and the grid would re-lay itself out at the instant of the solve. Worse, an
  // UNLOCKED square can still be cleared, so the band flickered as a player toggled the last letter.
  //
  // So a solved board shows the ladder a fresh one would have shown. That is honest rather than a
  // placeholder: the rungs are speculative, HintBar draws only `slice(0, opened)`, and a player who
  // has already won reads a hint about a square that is standing right in front of them. What it buys
  // is the band -- and with it the answer reveal, which `controlLabel` reaches only through a ladder.
  //
  // It cannot fire on a pack this board refuses to draw: `hintDataOf` answers with '' for a field
  // that never arrived, so the fresh fold is empty too and the frame draws no bar at all, which is
  // the right answer there.
  //
  // NOTHING BOUGHT CAN BE REPLACED BY IT. A non-empty `spent` makes `grow` non-empty whatever the
  // board, so this branch is reachable only with an empty ladder in hand.
  return grow(data, EMPTY_BOARD, [])
}

/**
 * How Cryptogram computes its own ladder, and the entry the registry hangs off `cryptogram`.
 *
 * `ladder` renders the spent rungs through `cryptogramHintFor`, which is pure in the puzzle, so a
 * rung reads the same sentence forever however much the player has typed since. The speculative tail
 * is appended from the fold above.
 *
 * `merge` is the one-writer rule for this type: the board wrote `<pairs>` and knows nothing of the
 * two hint fields, so the tail is re-attached from what is stored. IT EXTENDS EVERY BOARD WRITE,
 * INCLUDING ''. A board write of '' is the state `encode({})` produces when the last letter is
 * cleared, which is not a reset -- this bench has no Play again and raises `onReset` nowhere at all
 * -- so answering it with '' would throw away a purchase on a press of the eraser.
 *
 * IT IS ALL BUT UNREACHABLE HERE, and it is written this way anyway, for two reasons. The first is
 * that "all but" is doing real work: a rung locks the squares it fills and a locked square cannot be
 * cleared, so a bought ladder normally keeps at least one pair in the mapping -- but a rung naming a
 * cipher letter the ANSWER never covered locks a square that carries nothing, and a board holding
 * only those encodes to ''. The second is that all three adapters say this in the same words, and a
 * sentence three files share has to be true in all three: Themed Anagrams reaches it on an ordinary
 * keystroke, and the rule is the same rule.
 *
 * `|2|LE,LZ` beside an empty grid reads as a started puzzle to `wasSolvedBefore` and the shelf, which
 * used to be the argument against keeping it. It is not a lie: those flags mean "this player has
 * started this puzzle", and a player who has spent two hints on it has started it.
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
    const { hints, mapping, opened } = decode(progress, data.ciphertext)

    // THE REVEAL CLOSES THE LADDER, and this is what makes "the tail is never shown" true rather than
    // nearly true. `opened` exceeds the bought rung count in exactly one state -- the answer has been
    // taken -- and HintBar draws `slice(0, opened)`. The tail is folded from LIVE state, so it
    // regrows when a player un-maps a letter they had right, and the slice then reached one rung into
    // it: a hint nobody bought, on screen, free. It also pushed `hints.length` back above `opened`,
    // which takes "Show answer" off the control and replaces it with an offer of a rung the player
    // has already paid past.
    const probe = opened > hints.length ? hints : fold(data, mapping, hints)

    // An empty ladder is not a short ladder. The frame reads null the way it reads a malformed pack
    // ladder -- no bar at all -- which is the right answer for a pack whose ciphertext never
    // arrived, and is now the ONLY input that reaches it: see `fold` for why a solved board keeps
    // its band.
    return probe.length === 0 ? null : (probe.map((rung) => cryptogramHintFor(data, rung)) as HintLadder)
  },

  merge: (boardWrite: PuzzleProgress, current: PuzzleProgress): PuzzleProgress =>
    attachHints(boardWrite, decodeHints(current)),

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
