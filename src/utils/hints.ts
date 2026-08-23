import { Hint, HintLadder, Puzzle } from '@types'

const HINT_COUNT = 3

/**
 * The ladder a puzzle carries, or null.
 *
 * It cannot live in src/types.ts: that file is a copy-verbatim mirror of lull-api with zero runtime
 * exports, and jest.config.ts lists it in coveragePathIgnorePatterns -- so the one guard the whole
 * shell depends on would be exempt from the coverage gate.
 *
 * Structural, not exhaustive, in the same spirit as isValidPuzzle: it checks what the shell
 * dereferences, not what a puzzle type means. EVERY puzzle type carries a ladder now -- goFigure's
 * rungs place an operator where a phrase puzzle's describe a meaning -- so null no longer means "this
 * game has no hints". It means the shape is malformed, and nothing downstream should touch it.
 */
export const hintsOf = (puzzle: Puzzle<unknown>): HintLadder | null => {
  const data = puzzle.data as Record<string, unknown> | null
  if (typeof data !== 'object' || data === null) return null

  // A rung is an OBJECT with prose in it, and the object-ness is checked before the prose because a
  // bare string was the old wire format. A guard that only asked for a non-empty `.text` would reject
  // a string rung BY ACCIDENT -- `'abc'.text` is undefined, which is not a string, so that arm
  // happens to hold -- and an accident is not a guarantee. The explicit object check is what makes
  // the rejection principled, which matters because `metadata` has no such luck: the board reads
  // `hint.metadata.slot` and would throw on a string that got this far.
  //
  // `metadata` itself is deliberately NOT checked. This guard is shared by the two phrase types whose
  // rungs legitimately have none, and the goFigure board is the only reader that needs it -- so the
  // narrowing to GoFigureHint belongs there, where a missing slot is a real failure, rather than here
  // where it would reject every phrase ladder in the pack.
  const isRung = (hint: unknown): hint is Hint =>
    typeof hint === 'object' &&
    hint !== null &&
    typeof (hint as Hint).text === 'string' &&
    (hint as Hint).text.trim() !== ''

  const hints = data.hints
  const isLadder = Array.isArray(hints) && hints.length === HINT_COUNT && hints.every(isRung)

  return isLadder ? (hints as HintLadder) : null
}

/**
 * The sentence the bar prints once every rung is spent, or null.
 *
 * PHRASE PUZZLES ONLY, and the narrowness is the point. `PhrasePuzzleData.answer` is one string that
 * is the answer; goFigure ships `acceptedSolutions`, an array of expressions several of which are
 * right, so there is no answer here to state. That bench composes its own line -- it has to redraw
 * the operators with × and ÷, and it has to hedge, because its ladder pins an operator tuple rather
 * than an expression -- and it renders its own bar, so it never reaches this function.
 *
 * The SENTENCE and not the answer, because the caller is a wire-up: `HintBar` renders what it is
 * handed verbatim, the same contract `hint.text` has, and a component that took a bare answer would
 * have to know which bench's phrasing to wrap it in.
 *
 * Structural, like `hintsOf` above and for the same reason -- a pack is JSON off the network that
 * was persisted, and `isValidPuzzle` deliberately leaves `data` opaque. A blank answer is refused
 * rather than printed: "The answer is ." spends the player's last press to say nothing.
 */
export const answerOf = (puzzle: Puzzle<unknown>): string | null => {
  const data = puzzle.data as Record<string, unknown> | null
  if (typeof data !== 'object' || data === null) return null

  const answer = data.answer
  if (typeof answer !== 'string' || answer.trim() === '') return null

  return `The answer is ${answer}.`
}
