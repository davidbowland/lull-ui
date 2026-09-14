import { encode, Guesses } from './progress'
import { Puzzle, PuzzleProgress, ThemedAnagramsData } from '@types'

/**
 * The board portion that shows this Themed Anagrams board finished: all four answers in their rows.
 *
 * IT WRITES OVER THE DRAFTS RATHER THAN APPENDING, unlike the Phrazle bench one door along, and the
 * difference is what a row HOLDS. A phrazle guess is a committed attempt and the history of them is
 * the game; an anagram draft is a work in progress on exactly the word being revealed, so the answer
 * supersedes it. There is nothing to keep.
 *
 * FOUR OR NOTHING, which is the refusal `entriesOf` in hints.ts and the board itself both make, for
 * the reason both give: every consumer downstream assumes four rows, and `Guesses` is a 4-tuple.
 * A pack with three entries is a pack this board declines to draw, so there is no finished board to
 * compose for it.
 *
 * Structural over `data`, in the register `hintsOf` and `answerOf` already use, because a pack is
 * JSON off the network that was persisted and `isValidPuzzle` deliberately leaves `data` opaque. One
 * entry whose `answer` never arrived refuses the whole board rather than filling three rows and
 * leaving a fourth blank -- a half-revealed board is a state with no way to read it.
 */
export const themedAnagramsSolve = (puzzle: Puzzle<unknown>): PuzzleProgress | null => {
  const entries = (puzzle.data as ThemedAnagramsData | null)?.entries
  if (!Array.isArray(entries) || entries.length !== 4) return null

  const answers = entries.map((entry: unknown) =>
    typeof entry === 'object' && entry !== null ? (entry as { answer?: unknown }).answer : null,
  )
  if (!answers.every((answer): answer is string => typeof answer === 'string' && answer.trim() !== '')) return null

  return encode(answers as unknown as Guesses)
}
