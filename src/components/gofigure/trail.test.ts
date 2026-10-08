import { evaluateLeftToRight } from './evaluate'
import { forwardExpression, stepOf, TrailStep } from './trail'
import { goFigureData } from '@test/__mocks__'
import { Operator } from '@types'

// The bank is 6, 9, 7, 7 and the goal is 154. This is the spec's trail (S-17): / 7 with tile 3,
// - 9, - 7 with tile 4, - 6. Indices here are zero-based, so "tile 3" is index 2.
const TRAIL_154: TrailStep[] = [
  { from: 154, op: '/', tile: 2, to: 22 },
  { from: 22, op: '-', tile: 1, to: 13 },
  { from: 13, op: '-', tile: 3, to: 6 },
  { from: 6, op: '-', tile: 0, to: 0 },
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
  test('spells the 154 trail as 6+7+9*7 (S-17)', () => {
    expect(forwardExpression(TRAIL_154, goFigureData.bank)).toBe('6+7+9*7')
  })

  test('spells an expression the fixture pack accepts', () => {
    expect(goFigureData.acceptedSolutions).toContain(forwardExpression(TRAIL_154, goFigureData.bank))
  })

  test('spells an expression that evaluates, left to right, to where the trail started', () => {
    const expression = forwardExpression(TRAIL_154, goFigureData.bank) ?? ''

    expect(evaluateLeftToRight(operandsOf(expression), operatorsOf(expression))).toBe(TRAIL_154[0].from)
  })

  test('turns a backward * into a forward / that divides evenly', () => {
    // From 4: * 3 is 12, - 1 is 11, - 2 is 9, - 9 is 0. Forward, 9+2=11, +1=12, /3=4.
    const bank = [3, 2, 1, 9]
    const steps: TrailStep[] = [
      { from: 4, op: '*', tile: 0, to: 12 },
      { from: 12, op: '-', tile: 2, to: 11 },
      { from: 11, op: '-', tile: 1, to: 9 },
      { from: 9, op: '-', tile: 3, to: 0 },
    ]
    const expression = forwardExpression(steps, bank) ?? ''

    expect(expression).toBe('9+2+1/3')
    expect(evaluateLeftToRight(operandsOf(expression), operatorsOf(expression))).toBe(4)
  })

  test('turns a backward + into a forward -', () => {
    // From 2: + 9 is 11, - 3 is 8, - 1 is 7, - 7 is 0. Forward, 7+1=8, +3=11, -9=2.
    const steps: TrailStep[] = [
      { from: 2, op: '+', tile: 1, to: 11 },
      { from: 11, op: '-', tile: 0, to: 8 },
      { from: 8, op: '-', tile: 2, to: 7 },
      { from: 7, op: '-', tile: 3, to: 0 },
    ]

    const expression = forwardExpression(steps, [3, 9, 1, 7]) ?? ''

    expect(expression).toBe('7+1+3-9')
    expect(evaluateLeftToRight(operandsOf(expression), operatorsOf(expression))).toBe(2)
  })

  test('is null when the trail does not end at 0', () => {
    const steps: TrailStep[] = [...TRAIL_154.slice(0, 3), { from: 6, op: '-', tile: 0, to: 1 }]

    expect(forwardExpression(steps, goFigureData.bank)).toBeNull()
  })

  test('is null when the last step reaches 0 without subtracting', () => {
    // The trail went negative and came back up: -5 + 5 reaches 0, but only a subtraction can be the
    // forward expression's opening tile.
    const steps: TrailStep[] = [
      { from: 4, op: '-', tile: 1, to: -5 },
      { from: -5, op: '-', tile: 2, to: -12 },
      { from: -12, op: '+', tile: 3, to: -5 },
      { from: -5, op: '+', tile: 0, to: 0 },
    ]

    expect(forwardExpression(steps, [5, 9, 7, 7])).toBeNull()
  })

  test('is null when tiles remain', () => {
    const steps: TrailStep[] = [
      { from: 22, op: '-', tile: 1, to: 13 },
      { from: 13, op: '-', tile: 3, to: 6 },
      { from: 6, op: '-', tile: 0, to: 0 },
    ]

    expect(forwardExpression(steps, goFigureData.bank)).toBeNull()
  })

  test('is null when a tile is spent twice', () => {
    // Four steps against a bank of four, ending at 0 on a subtraction -- but tile 3 twice and tile 1
    // never, so the count matches while the set does not.
    const steps: TrailStep[] = [...TRAIL_154.slice(0, 3), { from: 6, op: '-', tile: 2, to: 0 }]

    expect(forwardExpression(steps, goFigureData.bank)).toBeNull()
  })

  test('is null when a tile index is outside the bank', () => {
    const steps: TrailStep[] = [...TRAIL_154.slice(0, 3), { from: 6, op: '-', tile: 4, to: 0 }]

    expect(forwardExpression(steps, goFigureData.bank)).toBeNull()
  })

  test('is null when a tile index is not a whole number', () => {
    const steps: TrailStep[] = [...TRAIL_154.slice(0, 3), { from: 6, op: '-', tile: 1.5, to: 0 }]

    expect(forwardExpression(steps, goFigureData.bank)).toBeNull()
  })

  test('is null for an empty trail', () => {
    expect(forwardExpression([], goFigureData.bank)).toBeNull()
  })
})
