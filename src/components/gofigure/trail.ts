import { Operator } from '@types'

// The arithmetic of Backtrack: the player starts at the goal and steps back one tile at a time, then
// writes the front of the sum forward. Pure over numbers -- no eval, no Function, no text field
// anywhere upstream of it. A step's operands are a value the trail already holds, a pack operator,
// and a digit read off a bank index, so there is no string here for anything to parse.
//
// DISPLAY ONLY, the same line evaluate.ts draws. Nothing in this file decides whether a trail wins.
// `forwardExpression` builds a string in the pack's own characters, and whether that string is an
// answer is a set lookup against Puzzle.data.acceptedSolutions, which the backend shipped. This app
// displays; the backend decides.

// One step on the trail. `tile` is a bank INDEX, not a digit, for the reason board.ts gives: a bank
// of 9,3,9,9 has three tiles that all read 9, and only the index says which one was spent.
export interface TrailStep {
  from: number
  op: Operator
  tile: number
  to: number
}

export type StepResult =
  | { kind: 'whole'; value: number }
  // A division that leaves a remainder. The trail refuses it, but the refusal says what the
  // division made, so the quotient and remainder travel with the refusal rather than being
  // recomputed by whoever words it.
  | { kind: 'uneven'; quotient: number; remainder: number }
  // Divide by zero. Unreachable from a bank lull-api draws (tiles 1-9), and handled anyway because
  // this is a function over numbers, not over that promise.
  | { kind: 'zero' }
  // The result is not a safe integer. A trail of four multiplies from a large goal can pass
  // Number.MAX_SAFE_INTEGER, and past it `%` and `===` stop telling the truth.
  | { kind: 'big' }

// `+ 0` turns -0 into 0. Math.trunc(-1 / 9) is -0, and a trail that showed "-0" would be showing an
// artifact of IEEE 754 rather than a number.
const clean = (value: number): number => value + 0

const apply = (from: number, op: Operator, by: number): number => {
  switch (op) {
    case '+':
      return from + by
    case '-':
      return from - by
    case '*':
      return from * by
    case '/':
      return from / by
  }
}

export const stepOf = (from: number, op: Operator, by: number): StepResult => {
  if (op === '/') {
    if (by === 0) {
      return { kind: 'zero' }
    }
    // Truncation, so a negative trail divides the way it reads: -154 / 9 is -17 remainder -1, the
    // mirror of 154 / 9, rather than floor's -18 remainder 8. JavaScript's `%` already truncates,
    // and Math.trunc keeps the quotient consistent with it.
    if (from % by !== 0) {
      return { kind: 'uneven', quotient: clean(Math.trunc(from / by)), remainder: from % by }
    }
  }
  const value = clean(apply(from, op, by))
  return Number.isSafeInteger(value) ? { kind: 'whole', value } : { kind: 'big' }
}

// Each backward step undoes exactly one forward step, so its sign is the forward sign's inverse.
const INVERSE: Record<Operator, Operator> = { '*': '/', '+': '-', '-': '+', '/': '*' }

// THE FINISH: the front of the sum, written forward. The player steps back from the goal until the
// numbers left are a sum they can see -- 9 with 2, 2 and 5 left is 2 + 2 + 5 -- and then writes that
// sum left to right, as on the board. `tiles` and `ops` interleave tile, sign, tile: `tiles` is one
// longer than `ops` once a sign is waiting for its number, and the same length while a number is
// waiting for its sign.
//
// It replaced a finish line at 0, which nothing on screen ever named. The last step down to 0 had to
// be a subtraction of the sum's opening number, so 6 with 2 and 4 left -- plainly 2 + 4 -- had to be
// walked as 6 - 4 = 2, 2 - 2 = 0, and the order those two were taken in silently decided which sum
// the trail spelled.
export interface TrailFinish {
  ops: Operator[]
  tiles: number[]
}

// The forward expression a finished trail spells, in the pack's own characters ("6+7+9*7"), or null.
//
// Non-null only when the finish is a whole sum -- it ends on a number -- and the steps and the finish
// between them spend every bank index exactly once. The finish leads, as written, and every step
// follows with its inverted sign and its tile, latest first. The 154 trail -- / 7, - 9, then the
// finish 6 + 7 -- spells 6+7+9*7, and 6+7=13, +9=22, *7=154 left to right.
//
// The mapping is exact because left-to-right evaluation runs one operator at a time, and each
// backward step inverts one forward step: a backward / was exact, so the forward * is too, and a
// backward * becomes a forward / that divides evenly. That holds for tiles 1-9.
//
// NOTHING HERE ASKS WHETHER THE FINISH MAKES THE NUMBER THE STEPS REACHED. A finish that does not
// spells a string that evaluates to something other than the goal, and the accepted-set lookup simply
// fails to find it. Likewise it trusts the steps to CHAIN, each `to` the next `from`; the board builds
// every step through `stepOf`, so they do.
//
// It never throws: a malformed trail (an index out of range, a repeated index, a short trail) is
// null, the same as a trail that simply has not finished.
export const forwardExpression = (steps: TrailStep[], finish: TrailFinish | null, bank: number[]): string | null => {
  if (finish === null || finish.tiles.length !== finish.ops.length + 1) {
    return null
  }
  const tiles = [...finish.tiles, ...steps.map((step) => step.tile)]
  const inRange = tiles.every((tile) => Number.isInteger(tile) && tile >= 0 && tile < bank.length)
  if (!inRange || tiles.length !== bank.length || new Set(tiles).size !== bank.length) {
    return null
  }
  const front = finish.tiles.map((tile, index) => `${index === 0 ? '' : finish.ops[index - 1]}${bank[tile]}`)
  const rest = steps
    .slice()
    .reverse()
    .map((step) => `${INVERSE[step.op]}${bank[step.tile]}`)
  return `${front.join('')}${rest.join('')}`
}
