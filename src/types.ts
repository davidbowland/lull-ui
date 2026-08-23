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

export type OperatorSlot = 0 | 1 | 2

// The 0-based operator index, left to right, so slot 2 is the rightmost sign -- the one a player
// would call op3. There is no cell index here; what a board does with a slot is the board's business.
export interface GoFigureHintMetadata {
  operator: Operator
  slot: OperatorSlot
}

// OPTIONAL here and required on the goFigure narrowing below. That is what lets a shared renderer
// typed on HintLadder read a hint without a type error while the board still gets a required field.
//
// `text` is authored by the backend and rendered VERBATIM. This app derives no hint copy.
// `metadata.operator` is ASCII and is never rendered as itself -- it goes through OPERATOR_SYMBOLS
// to draw a cell and OPERATOR_NAMES to name one.
export interface Hint {
  metadata?: GoFigureHintMetadata
  text: string
}

export interface GoFigureHint extends Hint {
  metadata: GoFigureHintMetadata
}

export type GoFigureHintLadder = [GoFigureHint, GoFigureHint, GoFigureHint]

export interface GoFigureData {
  goal: number
  // REQUIRED. Every pack is rebuilt on deploy, so there is no puzzle without it and no reason for a
  // read site to branch on its absence.
  hints: GoFigureHintLadder
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

// Exactly three. The count is checked once, at the parse boundary; the tuple carries that guarantee
// to every read site downstream.
//
// A rung index is NOT a slot index. lull-api orders rungs by how much each reveals, so difficulties
// 4 and 5 run slots 1, 0, 2. Never write hints[slot].
export type HintLadder = [Hint, Hint, Hint]

// What the MODEL returned, which is not what goes on the wire. Keeping the two named apart is what
// stops a prose gate quietly running over objects.
export type PhraseHints = [string, string, string]

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
  hints: PhraseHints
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
  // "The player started this puzzle over." A LIFECYCLE signal, not game state: it carries no hint
  // knowledge in either direction — the board does not learn that a ladder exists and the shell
  // does not learn what the board holds — so the display-only rule still holds with five props.
  //
  // Empty progress cannot be this signal, which is the tempting zero-prop alternative. Three boards
  // write '' for reasons that are not a reset: cryptogram's encode({}) in mapping.ts when the last
  // letter is cleared, missingvowels when the text is deleted, and goFigure's own Undo and Clear. A
  // shell that treated '' as "start over" would wipe a player's spent rungs on a keystroke.
  //
  // OPTIONAL, so every board that predates it compiles and renders unchanged. A board that has no
  // replay affordance — cryptogram today — simply never calls it.
  onReset?: () => void
  onSolved: () => void
  progress: PuzzleProgress | null
  puzzle: Puzzle<T>
}

// `import type { FC }`, not React.FC: React is a UMD global under this tsconfig and
// referring to it inside a module is a compile error.
export type PuzzleComponent<T = unknown> = FC<PuzzleComponentProps<T>>
