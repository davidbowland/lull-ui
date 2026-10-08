import { evaluateLeftToRight } from './evaluate'
import { forwardExpression, stepOf, TrailFinish, TrailStep } from './trail'
import { goFigureData } from '@test/__mocks__'
import { Operator } from '@types'

// The bank is 6, 9, 7, 7 and the goal is 154. / 7 with tile 3, - 9, - 7 with tile 4: three steps
// back to 6. Indices here are zero-based, so "tile 3" is index 2.
const TRAIL_154: TrailStep[] = [
  { from: 154, op: '/', tile: 2, to: 22 },
  { from: 22, op: '-', tile: 1, to: 13 },
  { from: 13, op: '-', tile: 3, to: 6 },
]

// Splits a pack-character expression back into what evaluateLeftToRight takes. Every bank tile is a
// single digit, so each operand is one character.
const operandsOf = (expression: string): number[] => expression.split(/[-+*/]/).map(Number)
const operatorsOf = (expression: string): Operator[] => (expression.match(/[-+*/]/g) ?? []) as Operator[]

describe('stepOf', () => {
  test('adds, subtracts and multiplies to a whole value', () => {
    expect(stepOf(15, '+', 7)).toEqual({ kind: 'whole', value: 22 })
    expect(stepOf(22, '-', 7)).toEqual({ kind: 'whole', value: 15 })
    expect(stepOf(22, '*', 7)).toEqual({ kind: 'whole', value: 154 })
  })

  test('divides evenly to a whole value', () => {
    expect(stepOf(154, '/', 7)).toEqual({ kind: 'whole', value: 22 })
  })

  test('reports 154 / 9 as uneven, 17 remainder 1 (S-13)', () => {
    expect(stepOf(154, '/', 9)).toEqual({ kind: 'uneven', quotient: 17, remainder: 1 })
  })

  test('truncates a negative uneven division toward zero', () => {
    expect(stepOf(-154, '/', 9)).toEqual({ kind: 'uneven', quotient: -17, remainder: -1 })
  })

  test('never reports a quotient of -0', () => {
    const result = stepOf(-1, '/', 9)

    expect(result).toEqual({ kind: 'uneven', quotient: 0, remainder: -1 })
    expect(Object.is((result as { quotient: number }).quotient, -0)).toBe(false)
  })

  test('reports 5 / 0 as zero (S-13)', () => {
    expect(stepOf(5, '/', 0)).toEqual({ kind: 'zero' })
  })

  test('allows the trail to go negative', () => {
    expect(stepOf(6, '-', 7)).toEqual({ kind: 'whole', value: -1 })
    expect(stepOf(-1, '*', 7)).toEqual({ kind: 'whole', value: -7 })
    expect(stepOf(-14, '/', 7)).toEqual({ kind: 'whole', value: -2 })
  })

  test('reports a result past the safe integers as big', () => {
    expect(stepOf(Number.MAX_SAFE_INTEGER, '+', 1)).toEqual({ kind: 'big' })
    expect(stepOf(2 ** 52, '*', 9)).toEqual({ kind: 'big' })
    expect(stepOf(-Number.MAX_SAFE_INTEGER, '-', 1)).toEqual({ kind: 'big' })
  })

  test('keeps the largest safe integer whole', () => {
    expect(stepOf(Number.MAX_SAFE_INTEGER - 1, '+', 1)).toEqual({ kind: 'whole', value: Number.MAX_SAFE_INTEGER })
  })

  test('walks the 154 trail step by step', () => {
    expect(TRAIL_154.map(({ from, op, tile }) => stepOf(from, op, goFigureData.bank[tile]))).toEqual(
      TRAIL_154.map(({ to }) => ({ kind: 'whole', value: to })),
    )
  })
})

describe('forwardExpression', () => {
  // / 7 and - 9 step back to 13, and 6 + 7 finishes it.
  const STEPS_154 = TRAIL_154.slice(0, 2)
  const FINISH_154: TrailFinish = { ops: ['+'], tiles: [0, 3] }

  test('spells the 154 trail as 6+7+9*7', () => {
    expect(forwardExpression(STEPS_154, FINISH_154, goFigureData.bank)).toBe('6+7+9*7')
  })

  test('spells an expression the fixture pack accepts', () => {
    expect(goFigureData.acceptedSolutions).toContain(forwardExpression(STEPS_154, FINISH_154, goFigureData.bank))
  })

  test('spells an expression that evaluates, left to right, to where the trail started', () => {
    const expression = forwardExpression(STEPS_154, FINISH_154, goFigureData.bank) ?? ''

    expect(evaluateLeftToRight(operandsOf(expression), operatorsOf(expression))).toBe(TRAIL_154[0].from)
  })

  // The finish is written in the order the player pressed it, so 7 + 6 is a different sum from 6 + 7.
  test('keeps the order the finish was written in', () => {
    expect(forwardExpression(STEPS_154, { ops: ['+'], tiles: [3, 0] }, goFigureData.bank)).toBe('7+6+9*7')
  })

  // 2 + 2 + 5 * 6: one step back, / 6, and a three-number finish.
  test('takes a finish of three numbers', () => {
    const steps: TrailStep[] = [{ from: 54, op: '/', tile: 3, to: 9 }]

    expect(forwardExpression(steps, { ops: ['+', '+'], tiles: [0, 1, 2] }, [2, 2, 5, 6])).toBe('2+2+5*6')
  })

  // One number left: the finish is that number alone, and no sign leads it.
  test('takes a finish of one number', () => {
    expect(forwardExpression(TRAIL_154.slice(0, 3), { ops: [], tiles: [0] }, goFigureData.bank)).toBe('6+7+9*7')
  })

  test('takes a finish with no steps before it', () => {
    expect(forwardExpression([], { ops: ['+', '+', '*'], tiles: [0, 2, 1, 3] }, goFigureData.bank)).toBe('6+7+9*7')
  })

  test('turns a backward * into a forward / that divides evenly', () => {
    // From 4: * 3 is 12, - 1 is 11, then 9 + 2 finishes it. Forward, 9+2=11, +1=12, /3=4.
    const bank = [3, 2, 1, 9]
    const steps: TrailStep[] = [
      { from: 4, op: '*', tile: 0, to: 12 },
      { from: 12, op: '-', tile: 2, to: 11 },
    ]
    const expression = forwardExpression(steps, { ops: ['+'], tiles: [3, 1] }, bank) ?? ''

    expect(expression).toBe('9+2+1/3')
    expect(evaluateLeftToRight(operandsOf(expression), operatorsOf(expression))).toBe(4)
  })

  test('turns a backward + into a forward -', () => {
    // From 2: + 9 is 11, - 3 is 8, then 7 + 1 finishes it. Forward, 7+1=8, +3=11, -9=2.
    const steps: TrailStep[] = [
      { from: 2, op: '+', tile: 1, to: 11 },
      { from: 11, op: '-', tile: 0, to: 8 },
    ]

    const expression = forwardExpression(steps, { ops: ['+'], tiles: [3, 2] }, [3, 9, 1, 7]) ?? ''

    expect(expression).toBe('7+1+3-9')
    expect(evaluateLeftToRight(operandsOf(expression), operatorsOf(expression))).toBe(2)
  })

  // Whether the finish makes 13 is not this function's question: the string spells what was written,
  // and the accepted-set lookup is what turns it away.
  test('spells a finish that misses, for the lookup to refuse', () => {
    expect(forwardExpression(STEPS_154, { ops: ['*'], tiles: [0, 3] }, goFigureData.bank)).toBe('6*7+9*7')
  })

  test('is null with no finish', () => {
    expect(forwardExpression(TRAIL_154, null, goFigureData.bank)).toBeNull()
  })

  test('is null while the finish ends on a sign', () => {
    expect(forwardExpression(STEPS_154, { ops: ['+'], tiles: [0] }, goFigureData.bank)).toBeNull()
  })

  test('is null when numbers remain', () => {
    expect(forwardExpression(STEPS_154, { ops: [], tiles: [0] }, goFigureData.bank)).toBeNull()
  })

  test('is null when a tile is spent twice', () => {
    // Four tiles against a bank of four -- but tile 3 twice and tile 4 never, so the count matches
    // while the set does not.
    expect(forwardExpression(STEPS_154, { ops: ['+'], tiles: [0, 2] }, goFigureData.bank)).toBeNull()
  })

  test('is null when a tile index is outside the bank', () => {
    expect(forwardExpression(STEPS_154, { ops: ['+'], tiles: [0, 4] }, goFigureData.bank)).toBeNull()
  })

  test('is null when a tile index is not a whole number', () => {
    expect(forwardExpression(STEPS_154, { ops: ['+'], tiles: [0, 1.5] }, goFigureData.bank)).toBeNull()
  })
})
