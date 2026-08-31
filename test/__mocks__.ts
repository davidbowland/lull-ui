import {
  CrypticClueData,
  CryptogramData,
  GoFigureData,
  GoFigureHintLadder,
  HintLadder,
  Meta,
  MissingVowelsData,
  Pack,
  PackDate,
  PhrazleData,
  Puzzle,
  ThemedAnagramsData,
} from '@types'

export const packDate: PackDate = '2026-08-18'

// Rung order 1, 0, 2 -- the difficulty-4 order, which is deliberately NOT left to right. A test that
// passes with hints[slot] instead of hints[rung].metadata.slot is a test that never saw this.
export const goFigureHints: GoFigureHintLadder = [
  { metadata: { kind: 'gofigure-operator', operator: '+', slot: 1 }, text: 'The 2nd operator from the left is "+".' },
  { metadata: { kind: 'gofigure-operator', operator: '+', slot: 0 }, text: 'The 1st operator from the left is "+".' },
  { metadata: { kind: 'gofigure-operator', operator: '*', slot: 2 }, text: 'The 3rd operator from the left is "×".' },
]

// The original TI-83 puzzle: goal 154 from the bank 6,9,7,7. goFigure evaluates
// STRICTLY LEFT TO RIGHT -- 6+9=15, +7=22, *7=154 -- so these six expressions are the
// complete accepted set for this bank and goal, which is what lull-api's enumerator
// produces (one operator tuple, six expressions, difficulty 4).
export const goFigureData: GoFigureData = {
  acceptedSolutions: ['6+7+9*7', '6+9+7*7', '7+6+9*7', '7+9+6*7', '9+6+7*7', '9+7+6*7'],
  bank: [6, 9, 7, 7],
  goal: 154,
  hints: goFigureHints,
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
    hints: [
      {
        metadata: { kind: 'gofigure-operator', operator: '+', slot: 1 },
        text: 'The 2nd operator from the left is "+".',
      },
      {
        metadata: { kind: 'gofigure-operator', operator: '+', slot: 0 },
        text: 'The 1st operator from the left is "+".',
      },
      {
        metadata: { kind: 'gofigure-operator', operator: '+', slot: 2 },
        text: 'The 3rd operator from the left is "+".',
      },
    ] as GoFigureHintLadder,
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
  { text: 'A space opera sequel' },
  { text: 'The middle chapter, where the heroes lose' },
  { text: 'The one where a lightsaber duel ends with a revelation about parentage' },
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

// NO `hints` KEY, and its ABSENCE is the wire shape rather than a shortcut. lull-api stopped
// shipping a ladder for this type when the rungs moved onto the device, so a fixture carrying one
// would let a board -- or a frame -- read a field no future pack sends. Absent, never `[]` and never
// `null`: there is no empty HintLadder and the type cannot express one, so a client tests for the
// field and then reads its length.
export const cryptogramPuzzle: Puzzle<CryptogramData> = {
  data: {
    answer: 'Ate ate tea',
    category: 'Saying',
    ciphertext: 'VZE VZE ZEV',
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
  data: { answer: 'Ate ate tea', ciphertext: 'VZE VZE ZEV' },
  difficulty: 3,
}

// THE DEPLOY WINDOW, AND IT IS A SHAPE ON THE WIRE RIGHT NOW rather than a museum piece. This app
// ships FIRST -- clause (b) of lull-api's rebuild runbook makes that ordering mandatory, because a
// pack that stopped carrying `hints` before this reader existed would have left three of six benches
// with no hint bar at all -- so for the whole gap between the two deploys every pack a device
// receives still carries the old prose ladder while the adapter is already live. Every `lull:pack:`
// cached during that gap keeps the shape for as long as the pack is kept, which outlives the second
// deploy rather than ending at it.
//
// The three prose rungs are the shared phrase ladder this type used to inherit: sentences about what
// the phrase MEANS, aimed at a player trying to recognize it, which is not what a cryptogram player
// is doing. They are here to be IGNORED, and the frame's precedence rows are what prove they are.
//
// The cast is what a pack can actually deliver, said out loud: CryptogramData no longer has a place
// to put this, and that is the contract change rather than a gap in the fixture.
export const cryptogramStalePackLadder: HintLadder = [
  { text: 'A saying about a meal' },
  { text: 'What you say when the plate is empty' },
  { text: 'Three words, and two of them are the same' },
]

export const stalePackCryptogram: Puzzle<CryptogramData> = {
  ...cryptogramPuzzle,
  data: { ...cryptogramPuzzle.data, hints: cryptogramStalePackLadder } as unknown as CryptogramData,
}

export const cryptogramPack: Pack = {
  complete: true,
  date: packDate,
  puzzles: [cryptogramPuzzle],
}

export const stalePackCryptogramPack: Pack = {
  complete: true,
  date: packDate,
  puzzles: [stalePackCryptogram],
}

// Cryptic Clue
//
// Built from the wire example so the fixture and the contract cannot drift. `Dance hidden in instant
// angora` is 30 characters: [0, 5) is `Dance` and [16, 30) is `instant angora`, inside which
// `instanT ANGOra` hides TANGO. Every offset here was checked against the string it indexes, which
// is the whole discipline this type needs -- a span that is valid and wrong renders a confident lie.
export const crypticCluePuzzleId = '2026-08-18:crypticclue:abcd1234'

// Text only, no `metadata`. Rungs of this type carry prose and nothing else, and the wire example's
// order is device, then the quoted definition, then the enumeration and initial -- naming the
// device first because for a hidden clue, naming which half is the definition hands the solver the
// wordplay half by elimination.
export const crypticClueHints: HintLadder = [
  {
    text: "The wordplay is a hidden word: the answer's letters sit consecutively inside the clue, spanning a word break.",
  },
  { text: 'The definition is "Dance".' },
  { text: 'Five letters, beginning with T.' },
]

export const crypticCluePuzzle: Puzzle<CrypticClueData> = {
  data: {
    answer: 'TANGO',
    clue: 'Dance hidden in instant angora',
    definitionSpan: { end: 5, start: 0 },
    device: 'hidden',
    enumeration: [5],
    fodderSpan: { end: 30, start: 16 },
    hints: crypticClueHints,
  },
  difficulty: 3,
  estimatedSeconds: 120,
  id: crypticCluePuzzleId,
  type: 'crypticclue',
}

// The only way to cover the second wordplay line. `device` is what the reveal reads, and it is the
// field's only reader in the whole app.
export const anagramCrypticClue: Puzzle<CrypticClueData> = {
  ...crypticCluePuzzle,
  data: { ...crypticCluePuzzle.data, device: 'anagram' },
}

// THREE broken-span fixtures rather than one with a parameter, so each names the state it exists
// for and a test that stops covering one fails by leaving an unused export rather than by quietly
// sharing a fixture with the test next to it.
//
// An end past the clue: the degradation path a real pack could produce. State 8 -- no mark, the
// heading and the wordplay line only.
export const brokenSpanCrypticClue: Puzzle<CrypticClueData> = {
  ...crypticCluePuzzle,
  data: { ...crypticCluePuzzle.data, definitionSpan: { end: 99, start: 0 } },
}

// The mirror case, and the only fixture that can reach state 9 -- mark, heading and the definition
// line, with no wordplay line.
export const brokenFodderCrypticClue: Puzzle<CrypticClueData> = {
  ...crypticCluePuzzle,
  data: { ...crypticCluePuzzle.data, fodderSpan: { end: 99, start: 16 } },
}

// Both past the end, and the only fixture that can reach state 10, where the reveal does not render
// at all. A landmark named "How the clue worked" containing nothing is worse than silence.
export const brokenSpansCrypticClue: Puzzle<CrypticClueData> = {
  ...crypticCluePuzzle,
  data: {
    ...crypticCluePuzzle.data,
    definitionSpan: { end: 99, start: 0 },
    fodderSpan: { end: 99, start: 16 },
  },
}

// State 14: the one branch in this board that a well-formed pack never takes. Without the guard an
// empty array paints a bare "()" beside the clue and an sr-only " letters." with a leading space.
export const noEnumerationCrypticClue: Puzzle<CrypticClueData> = {
  ...crypticCluePuzzle,
  data: { ...crypticCluePuzzle.data, enumeration: [] },
}

export const crypticCluePack: Pack = {
  complete: true,
  date: packDate,
  puzzles: [crypticCluePuzzle],
}

// Themed Anagrams
//
// The wire example, so the fixture and the specification cannot drift. Every scramble was checked
// against its answer as a multiset: ELKTET/KETTLE, UNASAPCE/SAUCEPAN, LKSETIL/SKILLET,
// TPSLAAU/SPATULA. Lengths run 6, 8, 7, 7, which is deliberately NOT sorted -- a board that tidied
// the rows short-to-long would break every ordinal in the ladder, and a fixture already in that
// order could not tell a sort from a passthrough.
export const themedAnagramsPuzzleId = '2026-08-18:themedanagrams:7c1e4b90'

// NO `hints` KEY on the fixture below, for the reason spelled out on cryptogramPuzzle: an absent
// field is the wire shape, and Themed Anagrams' ladder was the largest thing in its payload.
export const themedAnagramsPuzzle: Puzzle<ThemedAnagramsData> = {
  data: {
    // FOUR ARRANGEMENTS EACH, which is the ceiling rather than the quota -- the length varies per
    // entry and one is a normal length. `[0]` is the board as it first appears and the rest are what
    // the reshuffle control cycles through in this order; the four leading runs are unchanged from
    // when this fixture held one apiece, so every assertion about a board nobody has pressed anything
    // on still reads the same string.
    entries: [
      { answer: 'KETTLE', scrambles: ['ELKTET', 'ELETKT', 'TLTEEK', 'LTETEK'] },
      { answer: 'SAUCEPAN', scrambles: ['UNASAPCE', 'NSAPUACE', 'PACNSAEU', 'NSCEAUPA'] },
      { answer: 'SKILLET', scrambles: ['LKSETIL', 'TILKELS', 'KTESLLI', 'LLKSETI'] },
      { answer: 'SPATULA', scrambles: ['TPSLAAU', 'AAUPLTS', 'PALSTUA', 'TUPSLAA'] },
    ],
    theme: 'Kitchen tools',
  },
  difficulty: 2,
  estimatedSeconds: 180,
  id: themedAnagramsPuzzleId,
  type: 'themedanagrams',
}

// THE FIXTURE THAT EXERCISES THE EMPTY-GUESS GUARD in themedanagrams/index.tsx's `isRight`.
// normalizeAnswer maps a string with no alphanumerics to '', so on this pack the equality alone
// reports every empty box as right: four chips paint at mount, the tally reads 4 of 4 right, and
// onSolved fires on a board nobody has touched. Without this fixture that guard's test passes
// whether or not the guard is there.
export const blankAnswerThemedAnagrams: Puzzle<ThemedAnagramsData> = {
  ...themedAnagramsPuzzle,
  data: {
    ...themedAnagramsPuzzle.data,
    entries: [
      { answer: '', scrambles: ['ELKTET'] },
      { answer: 'SAUCEPAN', scrambles: ['UNASAPCE'] },
      { answer: 'SKILLET', scrambles: ['LKSETIL'] },
      { answer: 'SPATULA', scrambles: ['TPSLAAU'] },
    ],
  },
}

// The other half of the same guard, and the half that LATCHES. `data` is JSON off the network that
// isValidPuzzle leaves opaque, so an answer can be absent entirely -- and normalizeAnswer on a
// non-string throws. The board writes progress before it adjudicates, so the write lands and the
// render does not: every later load restores that keystroke at mount and throws before the player
// can touch anything. The cast is what a pack can actually deliver, said out loud.
export const unusableAnswerThemedAnagrams: Puzzle<ThemedAnagramsData> = {
  ...themedAnagramsPuzzle,
  data: {
    ...themedAnagramsPuzzle.data,
    entries: [
      { answer: undefined as unknown as string, scrambles: ['ELKTET'] },
      { answer: 'SAUCEPAN', scrambles: ['UNASAPCE'] },
      { answer: 'SKILLET', scrambles: ['LKSETIL'] },
      { answer: 'SPATULA', scrambles: ['TPSLAAU'] },
    ],
  },
}

// THE SHAPE THAT IS ON THE NETWORK TODAY, and the reason the board reads `scrambles` structurally
// rather than off the type. lull-api ships one `scramble` per entry until the list change deploys,
// and every `lull:pack:` already cached on a device holds this shape for as long as that pack is
// kept -- so it outlives the deploy rather than ending at it. A board that read only `scrambles`
// would refuse all four rows and draw a sign row over nothing on a pack that is perfectly good.
//
// It is also the one-arrangement case: a legacy entry yields exactly one run, so this fixture is
// what a row with nothing to cycle to looks like.
export const legacyScrambleThemedAnagrams: Puzzle<ThemedAnagramsData> = {
  ...themedAnagramsPuzzle,
  data: {
    ...themedAnagramsPuzzle.data,
    entries: [
      { answer: 'KETTLE', scramble: 'ELKTET' },
      { answer: 'SAUCEPAN', scramble: 'UNASAPCE' },
      { answer: 'SKILLET', scramble: 'LKSETIL' },
      { answer: 'SPATULA', scramble: 'TPSLAAU' },
    ] as unknown as ThemedAnagramsData['entries'],
  },
}

// THE DEPLOY WINDOW for this bench -- see stalePackCryptogram for why the window exists and how long
// a pack cached inside it survives. This ladder is the one the generator ranked ONCE, by answer
// length, before any player existed: it spends its whole-answer reveal on SAUCEPAN, the longest
// entry, whether or not that row is already solved. That is the failure the device-side builder was
// written to fix, so a fixture that models the window has to carry the bad ladder rather than a
// harmless one.
//
// THE METADATA IS KEPT AND IT NO LONGER TYPECHECKS, which is the point of the cast. `HintMetadata`
// narrowed to goFigure's arm when these ladders left the wire, so `themedanagrams-entry` is a shape
// the contract can no longer express -- and a stored pack holds those bytes anyway. Nothing in this
// app ever read them; the frame's precedence row is what says so.
export const themedAnagramsStalePackLadder: HintLadder = [
  {
    metadata: { entryIndex: 2, kind: 'themedanagrams-entry', reveal: 'initial' },
    text: 'The 3rd answer starts with S.',
  },
  {
    metadata: { entryIndex: 3, kind: 'themedanagrams-entry', reveal: 'bookends' },
    text: 'The 4th answer starts with S and ends with A.',
  },
  {
    metadata: { entryIndex: 1, kind: 'themedanagrams-entry', reveal: 'answer' },
    text: 'The 2nd answer is SAUCEPAN.',
  },
] as unknown as HintLadder

export const stalePackThemedAnagrams: Puzzle<ThemedAnagramsData> = {
  ...themedAnagramsPuzzle,
  data: { ...themedAnagramsPuzzle.data, hints: themedAnagramsStalePackLadder } as unknown as ThemedAnagramsData,
}

export const themedAnagramsPack: Pack = {
  complete: true,
  date: packDate,
  puzzles: [themedAnagramsPuzzle],
}

export const stalePackThemedAnagramsPack: Pack = {
  complete: true,
  date: packDate,
  puzzles: [stalePackThemedAnagrams],
}

// Phrazle
//
// TOE HOLD, which is the phrase every fixture in the vendored mark-guess suite is built around --
// so a board test and a rule test that disagree are disagreeing about the same board.
export const phrazlePuzzleId = '2026-08-18:phrazle:5e4d3c2b'

// NO `category` KEY, and its absence is load-bearing. Phrazle never ships one, so a fixture that
// carried it would let a board reserve space for something that cannot arrive -- and the sign row's
// left slot is genuinely empty on this bench.
//
// NO `maxGuesses` KEY EITHER, and that absence is load-bearing in the same way. The guess limit came
// off the wire because this game cannot be lost, so a fixture still carrying one would let a board
// read a field no real pack ships.
//
// NO `hints` KEY, and that is the third absence and the newest one -- see cryptogramPuzzle for why
// an absent field rather than an empty ladder is the shape to model.
//
// `answer` is the CANONICAL FORM: uppercase A-Z words separated by single spaces, which is what
// splitPhrase produces and what markGuess marks.
export const phrazlePuzzle: Puzzle<PhrazleData> = {
  data: {
    answer: 'TOE HOLD',
  },
  difficulty: 3,
  estimatedSeconds: 240,
  id: phrazlePuzzleId,
  type: 'phrazle',
}

// THE DEPLOY WINDOW for this bench -- see stalePackCryptogram for why the window exists and how long
// a pack cached inside it survives.
//
// THE LADDER IS BLIND, and that is what it is here to demonstrate. Rung k reveals the first
// still-unrevealed position of word `k mod wordCount`, so a two-word phrase walks word 0, word 1,
// word 0 and spells T, H, O -- chosen with no regard for what four guesses have already colored in,
// which is how a rung routinely spent itself proving something the player had already proved. The
// 0-based/1-based mismatch is DELIBERATE and this fixture is where it is visible: `word` and
// `position` are 0-based because a renderer indexes a board from zero, and the sentence counts from
// one because a sentence does.
//
// The metadata is kept and no longer typechecks, exactly as on themedAnagramsStalePackLadder, and
// for the same reason: `HintMetadata` narrowed to goFigure's arm, and a stored pack holds these
// bytes regardless.
export const phrazleStalePackLadder: HintLadder = [
  {
    metadata: { kind: 'phrazle-reveal', letter: 'T', position: 0, word: 0 },
    text: 'Letter 1 of word 1 is T.',
  },
  {
    metadata: { kind: 'phrazle-reveal', letter: 'H', position: 0, word: 1 },
    text: 'Letter 1 of word 2 is H.',
  },
  {
    metadata: { kind: 'phrazle-reveal', letter: 'O', position: 1, word: 0 },
    text: 'Letter 2 of word 1 is O.',
  },
] as unknown as HintLadder

export const stalePackPhrazle: Puzzle<PhrazleData> = {
  ...phrazlePuzzle,
  data: { ...phrazlePuzzle.data, hints: phrazleStalePackLadder } as unknown as PhrazleData,
}

export const phrazlePack: Pack = {
  complete: true,
  date: packDate,
  puzzles: [phrazlePuzzle],
}

export const stalePackPhrazlePack: Pack = {
  complete: true,
  date: packDate,
  puzzles: [stalePackPhrazle],
}

// Seven words: small enough to read in one line, and rich enough that a rejection test has a real
// near-miss in HOLE -- four letters, one away from HOLD, and absent from the phrase. HOT and HAND
// are here because HOT HAND is the committed guess every marking assertion in the board's suite uses.
export const phrazleDictionary: ReadonlySet<string> = new Set(['TOE', 'HOLD', 'HOT', 'HAND', 'HOLE', 'OLD', 'TEA'])
