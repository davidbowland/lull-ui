import { Puzzle } from '@types'

/**
 * The two things every surface says about a puzzle before you open it, and the one place they are
 * worded.
 *
 * The day directory and the bench say the SAME fact about the SAME puzzle -- the row you chose and
 * the bench you chose it from -- so a player who picked "Medium · About 4 min" off the directory
 * has to find those exact words at the top of the board, or the two surfaces are describing two
 * different things. They were written out separately in both files and drifted the moment either
 * was edited.
 */

// Rounded, and never to zero: "About 0 min" reads as a bug, and the number is an estimate the
// backend already rounded once.
export const lengthLabel = (estimatedSeconds: number): string =>
  `About ${Math.max(1, Math.round(estimatedSeconds / 60))} min`

// Without this every row of a full pack reads the same. A complete pack is five goFigures at
// 60/90/120/150/180 seconds, which round to 1, 2, 2, 3, 3 minutes -- so the label and the length
// together left two pairs of rows with byte-identical accessible names, and "Solved" landed on one
// of two rows nobody could tell apart. Difficulty was in the payload the whole time and is what
// estimatedSeconds is derived from anyway.
// `Medium` rather than `Middling`, and the two are not synonyms in a player's ear. Middling means
// mediocre -- it grades the PUZZLE's quality, not its difficulty -- so the one row on the shelf that
// should read as the safe middle choice read as the forgettable one. It is also the rarest word on
// the surface: every other label here is something a player would say out loud.
const DIFFICULTY_LABELS = ['Gentle', 'Easy', 'Medium', 'Tricky', 'Hard'] as const

export const difficultyLabel = (difficulty: Puzzle['difficulty']): string => DIFFICULTY_LABELS[difficulty - 1]
