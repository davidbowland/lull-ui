import type { FC } from 'react'

// ============================================================================
// Copied verbatim from lull-api/src/types.ts. Do not edit here — edit there and
// copy across, so the two repos cannot drift. The comments come with the copy:
// they document the contract, not the code.
// ============================================================================

// Packs

// A UTC calendar date, YYYY-MM-DD. Never derived from a local-time Date.
export type PackDate = string

export type PuzzleType = 'gofigure' | 'missingvowels' | 'cryptogram'

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

// Phrase puzzles

// Tagged by shape because the consumers want different things from one call. The tool schema
// requires the tag and ajv rejects a response missing it.
//
//   title   -- a recognizable title of a work. Missing Vowels' preferred shape.
//   idiom   -- a common saying or expression.
//   quote   -- a witty or aphoristic line. Cryptogram's preferred shape.
//   compact -- two or three short words sharing letters. Phrazle's preferred shape.
//
// A consumer PREFERS a shape; it does not require one. Requiring one would make a call that came
// back light on a single tag produce zero puzzles of a type.
export type PhraseShape = 'compact' | 'idiom' | 'quote' | 'title'

// Exactly three, ordered least to most revealing. The count is checked once, at the parse boundary
// in phrase-checks; the tuple carries that guarantee to every read site downstream.
export type HintLadder = [string, string, string]

// 5 = a general audience recognizes it instantly, 1 = obscure but fair. Set by the REVIEWER, never
// by the generator: a generator asked to rate its own output is grading its own work. Defaults to 3
// when review did not run.
//
// Direction matters and is easy to get backwards: high familiarity makes a Cryptogram EASIER.
export type Familiarity = 1 | 2 | 3 | 4 | 5

export interface Phrase {
  text: string
  shape: PhraseShape
  // ONE label -- the general kind of thing. Rung 1 of the ladder is what the old `categorySpecific`
  // used to be, so keeping both would squeeze the ladder into the narrow band between them and make
  // rung 1 duplicate whatever is already on screen.
  category: string
  hints: HintLadder
  familiarity: Familiarity
}

// What every phrase-derived puzzle carries, so the UI shell can find hints without knowing the
// type. `category` is optional because difficulty hides it.
//
// `answer` lives HERE rather than on each type. create-phrase-puzzles.ts builds the anti-repetition
// list by reading it off every puzzle in the last 20 days without knowing what type they are; a
// type that stored its answer under a different name would be invisible to that list, and every one
// of its phrases would be free to be served again the next day.
export interface PhrasePuzzleData {
  answer: string
  category?: string
  hints: HintLadder
}

// Missing Vowels

export interface MissingVowelsData extends PhrasePuzzleData {
  displayed: string // respaced consonant string -- the spacing deliberately lies
}

// Cryptogram

// No `revealed` map: the system design sketches one for pre-filled letters and Cryptogram has none.
export interface CryptogramData extends PhrasePuzzleData {
  ciphertext: string
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
