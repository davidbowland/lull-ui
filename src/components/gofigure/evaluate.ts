import { Operator } from '@types'

// DISPLAY ONLY. Nothing here decides whether an answer is right — that is a set lookup
// against Puzzle.data.acceptedSolutions, which the backend shipped. This exists so the
// wrong-answer message can say what the expression *did* make, which is a fact about the
// tiles on screen and not a ruling.
//
// Mirrors lull-api/src/generators/gofigure/evaluate.ts, including the two rules that
// make goFigure goFigure:
//
//   1. Strictly left to right. Operator precedence does NOT apply: 6+9+7*7 is 154,
//      because 6+9=15, +7=22, *7=154. That is the original TI-83 game's rule.
//   2. Division must come out whole, checked at every step rather than at the end, so
//      5 / 2 * 2 is rejected despite being whole.
//
// null means "this does not evaluate", which for a bank of digits 1-9 can only ever come
// from an uneven division.
const applyOperator = (left: number, operator: Operator, right: number): number | null => {
  switch (operator) {
    case '+':
      return left + right
    case '-':
      return left - right
    case '*':
      return left * right
    case '/':
      return right === 0 || left % right !== 0 ? null : left / right
  }
}

export const evaluateLeftToRight = (operands: number[], operators: Operator[]): number | null =>
  operators.reduce<number | null>(
    (accumulator, operator, index) =>
      accumulator === null ? null : applyOperator(accumulator, operator, operands[index + 1]),
    operands[0],
  )
