import { GoFigureData, Meta, MissingVowelsData, Pack, PackDate, Puzzle } from '@types'

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

export const missingVowelsPuzzle: Puzzle<MissingVowelsData> = {
  data: {
    answer: 'The Empire Strikes Back',
    category: 'Film',
    displayed: 'THMP RSTR KSBCK',
  },
  difficulty: 3,
  estimatedSeconds: 90,
  id: missingVowelsPuzzleId,
  type: 'missingvowels',
}
