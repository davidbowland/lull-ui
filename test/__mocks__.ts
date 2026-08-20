import { CryptogramData, GoFigureData, HintLadder, Meta, MissingVowelsData, Pack, PackDate, Puzzle } from '@types'

export const packDate: PackDate = '2026-08-18'

// The original TI-83 puzzle: goal 154 from the bank 6,9,7,7. goFigure evaluates
// STRICTLY LEFT TO RIGHT -- 6+9=15, +7=22, *7=154 -- so these six expressions are the
// complete accepted set for this bank and goal, which is what lull-api's enumerator
// produces (one operator tuple, six expressions, difficulty 4).
export const goFigureData: GoFigureData = {
  acceptedSolutions: ['6+7+9*7', '6+9+7*7', '7+6+9*7', '7+9+6*7', '9+6+7*7', '9+7+6*7'],
  bank: [6, 9, 7, 7],
  goal: 154,
  operators: ['+', '-', '*', '/'],
}

export const puzzleId = '2026-08-18:gofigure:9f3a1c02'

export const goFigurePuzzle: Puzzle<GoFigureData> = {
  data: goFigureData,
  difficulty: 4,
  estimatedSeconds: 150,
  id: puzzleId,
  type: 'gofigure',
}

export const quickPuzzleId = '2026-08-18:gofigure:1a2b3c4d'

export const quickPuzzle: Puzzle<GoFigureData> = {
  data: {
    acceptedSolutions: ['1+2+3+4'],
    bank: [1, 2, 3, 4],
    goal: 10,
    operators: ['+', '-', '*', '/'],
  },
  difficulty: 1,
  estimatedSeconds: 60,
  id: quickPuzzleId,
  type: 'gofigure',
}

// A pack whose puzzles are NOT in shelf order: the shelf sorts by estimatedSeconds, and
// a fixture already in that order could not tell a sort from a passthrough.
export const pack: Pack = {
  complete: true,
  date: packDate,
  puzzles: [goFigurePuzzle, quickPuzzle],
}

export const incompletePack: Pack = {
  complete: false,
  date: packDate,
  puzzles: [goFigurePuzzle],
}

export const meta: Meta = { installDismissed: false, solved: [], v: 1 }

// Missing Vowels
//
// The catalog's own worked example, so the fixture and the specification cannot drift apart:
// THE EMPIRE STRIKES BACK respaced 4|4|5 against the real 2|3|5|3.
export const missingVowelsPuzzleId = '2026-08-18:missingvowels:9f8e7d6c'

export const missingVowelsHints: HintLadder = [
  'A space opera sequel',
  'The middle chapter, where the heroes lose',
  'The one where a lightsaber duel ends with a revelation about parentage',
]

export const missingVowelsPuzzle: Puzzle<MissingVowelsData> = {
  data: {
    answer: 'The Empire Strikes Back',
    category: 'Film',
    displayed: 'THMP RSTR KSBCK',
    hints: missingVowelsHints,
  },
  difficulty: 3,
  estimatedSeconds: 90,
  id: missingVowelsPuzzleId,
  type: 'missingvowels',
}

// Difficulty 3 and 5 hide the category outright. The board renders no <h2> at all -- no
// placeholder, no empty element -- so a fixture without the key is the only way to cover it.
export const hiddenCategoryPuzzle: Puzzle<MissingVowelsData> = {
  ...missingVowelsPuzzle,
  data: { answer: 'The Empire Strikes Back', displayed: 'THMP RSTR KSBCK', hints: missingVowelsHints },
}

// A pack whose puzzle carries a hint ladder, so the frame's drawer branch has something to render.
export const phrasePack: Pack = {
  complete: true,
  date: packDate,
  puzzles: [missingVowelsPuzzle],
}

// Cryptogram
//
// Deliberately tiny -- three cipher letters, nine squares, every letter repeated three times -- so a
// test can assert on a named square without counting to twenty, and so "Every V is A now, 3 squares"
// has something to count. It does NOT clear lull-api's twelve-letter structural floor and is not
// meant to: this is a rendering fixture, and the floor is a generation rule.
//
// VZE VZE ZEV under { E: E, V: A, Z: T } spells ATE ATE TEA.
export const cryptogramPuzzleId = '2026-08-18:cryptogram:7c6b5a49'

export const cryptogramHints: HintLadder = [
  'A saying about a meal',
  'What you say when the plate is empty',
  'Three words, and two of them are the same',
]

export const cryptogramPuzzle: Puzzle<CryptogramData> = {
  data: {
    answer: 'Ate ate tea',
    category: 'Saying',
    ciphertext: 'VZE VZE ZEV',
    hints: cryptogramHints,
  },
  difficulty: 2,
  estimatedSeconds: 210,
  id: cryptogramPuzzleId,
  type: 'cryptogram',
}

// Difficulty 3 hides the category outright. The board leaves it out of the meta line entirely --
// no placeholder, no separator -- so a fixture without the key is the only way to cover it.
export const hiddenCategoryCryptogram: Puzzle<CryptogramData> = {
  ...cryptogramPuzzle,
  data: { answer: 'Ate ate tea', ciphertext: 'VZE VZE ZEV', hints: cryptogramHints },
  difficulty: 3,
}

export const cryptogramPack: Pack = {
  complete: true,
  date: packDate,
  puzzles: [cryptogramPuzzle],
}
