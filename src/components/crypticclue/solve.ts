import { CrypticClueData, Puzzle, PuzzleProgress } from '@types'

/**
 * The board portion that shows this Cryptic Clue finished: the answer, typed in.
 *
 * THERE IS NO CODEC ON THIS BENCH. The board stores what the player typed, verbatim, so the finished
 * board is the answer and this function is a read with a guard on it. Missing Vowels' is the same
 * shape for the same reason, and the two are separate files rather than one shared helper because
 * they are separate boards -- a shared "the answer is the progress" utility would be a coupling
 * between two benches that merely happen to agree today.
 *
 * ADJUDICATION GOES THROUGH `normalizeAnswer`, so the board reports this as right whatever the pack's
 * casing is. Solvedness is derived from the text and never stored beside it, so the line holding the
 * answer IS the win and nothing has to be told separately.
 *
 * IT DOES NOT TOUCH `explanation`. The board draws that itself once the clue is solved, off the pack,
 * which is where the sentence the verifier signed off on lives -- so a reveal here reaches the same
 * screen an honest solve does rather than a shortened version of it.
 *
 * NULL ON A PACK WHOSE ANSWER NEVER ARRIVED, since `isValidPuzzle` leaves `data` opaque and a blank
 * string is what this board's own codec spells "nothing typed" with.
 */
export const crypticClueSolve = (puzzle: Puzzle<unknown>): PuzzleProgress | null => {
  const answer = (puzzle.data as CrypticClueData | null)?.answer
  return typeof answer === 'string' && answer.trim() !== '' ? answer : null
}
