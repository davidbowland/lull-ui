import { HintLadder, Puzzle } from '@types'

const HINT_COUNT = 3

/**
 * The ladder a puzzle carries, or null.
 *
 * It cannot live in src/types.ts: that file is a copy-verbatim mirror of lull-api with zero runtime
 * exports, and jest.config.ts lists it in coveragePathIgnorePatterns -- so the one guard the whole
 * shell depends on would be exempt from the coverage gate.
 *
 * Structural, not exhaustive, in the same spirit as isValidPuzzle: it checks what the shell
 * dereferences, not what a puzzle type means. null covers goFigure and every malformed shape.
 */
export const hintsOf = (puzzle: Puzzle<unknown>): HintLadder | null => {
  const data = puzzle.data as Record<string, unknown> | null
  if (typeof data !== 'object' || data === null) return null

  const hints = data.hints
  const isLadder =
    Array.isArray(hints) &&
    hints.length === HINT_COUNT &&
    hints.every((hint) => typeof hint === 'string' && hint.trim() !== '')

  return isLadder ? (hints as HintLadder) : null
}
