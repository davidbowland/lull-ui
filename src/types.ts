import type { FC } from 'react'

// ============================================================================
// Copied verbatim from lull-api/src/types.ts. Do not edit here — edit there and
// copy across, so the two repos cannot drift. The comments come with the copy:
// they document the contract, not the code.
// ============================================================================

// Packs

// A UTC calendar date, YYYY-MM-DD. Never derived from a local-time Date.
export type PackDate = string

export type PuzzleType = 'gofigure' | 'missingvowels'

// Within-type: a 4 goFigure is hard for a goFigure and is not comparable to a 4 of another type.
export type Difficulty = 1 | 2 | 3 | 4 | 5

export interface Puzzle<T = unknown> {
  // `${date}:${type}:${shortId}` -- opaque, never positional. Difficulty is a generation input,
  // passed in; identity is an address, generated once.
  id: string
  type: PuzzleType
  difficulty: Difficulty
  estimatedSeconds: number
  data: T
}

export interface Pack {
  date: PackDate
  complete: boolean
  puzzles: Puzzle[]
}

// goFigure

export type Operator = '+' | '-' | '*' | '/'

export interface GoFigureData {
  goal: number
  bank: number[] // each digit used exactly once
  operators: Operator[] // reusable
  acceptedSolutions: string[] // e.g. "6+9+7*7"
}

// Missing Vowels

export interface MissingVowelsData {
  category: string
  displayed: string // respaced consonant string -- the spacing deliberately lies
  answer: string
}

// ============================================================================
// UI only. Nothing below this line exists in lull-api.
// ============================================================================

// The one localStorage record that is never pruned. Solved ids are a few bytes each,
// so history outlives the pack payloads it refers to: an old solved puzzle still shows
// as solved and re-downloads if opened.
export interface Meta {
  installDismissed: boolean
  solved: string[]
  v: number
}

// The in-flight state of an unfinished puzzle, as its component chose to encode it.
// The shell persists this verbatim and never reads inside it — goFigure stores an
// expression, a later type will store something else entirely, and the shell must not
// have to know which.
export type PuzzleProgress = string

export interface PuzzleComponentProps<T = unknown> {
  onProgress: (progress: PuzzleProgress) => void
  onSolved: () => void
  progress: PuzzleProgress | null
  puzzle: Puzzle<T>
}

// `import type { FC }`, not React.FC: React is a UMD global under this tsconfig and
// referring to it inside a module is a compile error.
export type PuzzleComponent<T = unknown> = FC<PuzzleComponentProps<T>>
