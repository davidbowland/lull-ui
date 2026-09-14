import { MissingVowelsData, Puzzle, PuzzleProgress } from '@types'

/**
 * The board portion that shows this Missing Vowels puzzle finished: the answer, typed in.
 *
 * THERE IS NO CODEC ON THIS BENCH. The board stores what the player typed, verbatim, so the finished
 * board is the answer and this function is a read with a guard on it. Cryptic Clue's is the same
 * shape for the same reason, and the two are separate files rather than one shared helper because
 * they are separate boards -- a shared "the answer is the progress" utility would be a coupling
 * between two benches that merely happen to agree today.
 *
 * ADJUDICATION GOES THROUGH `normalizeAnswer`, so the board reports this as right whatever the pack's
 * casing or spacing is. That is what makes the write enough on its own: solvedness is derived from
 * the text, never stored beside it, so the row holding the answer IS the win.
 *
 * NULL ON A PACK WHOSE ANSWER NEVER ARRIVED, since `isValidPuzzle` leaves `data` opaque and a blank
 * string is what this board's own codec spells "nothing typed" with -- writing it would mark a puzzle
 * solved while clearing the line.
 */
export const missingVowelsSolve = (puzzle: Puzzle<unknown>): PuzzleProgress | null => {
  const answer = (puzzle.data as MissingVowelsData | null)?.answer
  return typeof answer === 'string' && answer.trim() !== '' ? answer : null
}
