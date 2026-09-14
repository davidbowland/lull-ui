import { splitPhrase } from '@rules/is-valid-guess'

import { decode, encode } from './progress'
import { PhrazleData, Puzzle, PuzzleProgress } from '@types'

/**
 * The board portion that shows this Phrazle finished: the answer appended to the rows the player
 * already committed.
 *
 * APPENDED RATHER THAN WRITTEN OVER, and that is why this takes the progress at all. The rows a
 * player committed are their record of the game and a reveal is not a reason to throw them away --
 * a board that suddenly showed one row would read as having lost the session rather than as having
 * been answered. The two other benches that replace outright do so because there is nothing to keep:
 * a cryptogram's squares are all one mapping, and an anagram draft is superseded by its own answer.
 *
 * `decode` RATHER THAN THE RAW STRING, so what is appended to is a history the codec has already
 * accepted -- a stored record it would refuse must not be carried forward here and re-refused on
 * every later load. It is the same reason the adapter's `open` writes `encode(guesses)` rather than
 * passing the stored string through.
 *
 * `encode` CANONICALIZES, so the phrase goes in as the board's own splitter would write it and the
 * marker colors the row it restores. That is the guarantee every committed guess already has:
 * `markGuess` works on canonical words, and a row whose characters are not the characters the marker
 * marks would restore uncolored.
 *
 * SOLVEDNESS IS DERIVED FROM THIS AND NEVER STORED, which is what makes the write enough. The board
 * reports solved when some guess marks all green -- `PhrazleProgress`' own rule -- so a row holding
 * the answer IS the win, and nothing has to be told separately.
 *
 * NULL ON A PACK WHOSE ANSWER NEVER ARRIVED. `isValidPuzzle` leaves `data` opaque, so that is a valid
 * pack rather than a broken one, and the frame writes nothing at all rather than a board portion that
 * says nothing.
 */
export const phrazleSolve = (puzzle: Puzzle<unknown>, progress: PuzzleProgress): PuzzleProgress | null => {
  const answer = (puzzle.data as PhrazleData | null)?.answer
  if (typeof answer !== 'string' || answer.trim() === '') return null

  // Guarded because the reveal is reachable on a board that has ALREADY guessed the phrase: the bar
  // deliberately stands after a win, and its ladder can still have a step left to sell. A second
  // identical row would be a duplicate the player never typed.
  //
  // Compared in canonical form because that is the only form either side is ever in: `decode` answers
  // canonical guesses and `encode` canonicalizes what it is given, so a raw `answer` with an odd space
  // in it would miss a row that is in fact the same phrase.
  const { guesses } = decode(progress, answer)
  const row = splitPhrase(answer).join(' ')
  return encode(guesses.includes(row) ? guesses : [...guesses, row])
}
