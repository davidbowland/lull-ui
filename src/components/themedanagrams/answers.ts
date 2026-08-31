import { normalizeAnswer } from '@rules/normalize-answer'

// The one rule this bench applies, and it is vendored rather than authored: the backend decides what
// counts as the answer, and normalizeAnswer exists only because the comparison runs over free text
// the player invents at play time, which no generator can enumerate in advance.
//
// IT LIVES IN ITS OWN MODULE BECAUSE TWO THINGS ASK IT NOW. The board asks to decide which rows are
// won; the hint adapter asks to decide which entries a rung is still worth spending on -- the whole
// point of computing the ladder at play time is that a rung aimed at a word already on the board is
// a rung spent on nothing. A second copy in the adapter would be a second definition of "right" on
// one bench, and the two would drift the first time either was touched.
//
// It is NOT in progress.ts, which is next door and would have been the shorter move. That file's own
// contract is that it validates a shape and never a word -- "there is nothing here that decides
// whether a guess is right" -- and a codec that adjudicated answers would make that sentence false.
//
// COPIED WHOLE from missingvowels/index.tsx, all three clauses, so the two benches cannot drift on
// what an empty or an absent answer means. Not imported from there: it is module-private on that
// bench, and exporting it so a second board can reach into the first is a coupling that outlasts the
// five lines it saves.
//
// `typeof answer` IS CHECKED FIRST, and it is the one guard whose absence LATCHES. isValidPuzzle
// leaves `data` opaque, so an entry whose `answer` is missing or is a number renders four rows that
// look perfectly fine, because the empty-guess operand short-circuits while every box is empty. The
// first keystroke then persists progress and only afterwards calls normalizeAnswer(answer), which
// throws -- so the write lands and the render does not. On every later load the stored character is
// restored at mount and the throw happens before the player can touch anything, the root error
// boundary swaps in "Lull got stuck", and nothing self-heals it: the pack is valid, so readPack
// keeps it, and no code validates a progress string.
//
// THE EMPTY-GUESS CLAUSE IS THE KIND A TIDY-UP DELETES, and it is load-bearing. normalizeAnswer
// maps a string with no alphanumerics to '', so on a pack whose answer is '' the equality alone
// reports every empty box as right at mount: four chips, `4 of 4 right`, and onSolved on a board
// nobody has touched. Silent, and it claims the win on the player's behalf.
export const isRight = (guess: string, answer: string): boolean =>
  typeof answer === 'string' && normalizeAnswer(guess) !== '' && normalizeAnswer(guess) === normalizeAnswer(answer)
