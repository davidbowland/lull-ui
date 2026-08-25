import { ClueParts, splitAt } from './spans'
import { ClueSpan } from '@types'

describe('splitAt', () => {
  // The wire example, 30 characters: [0, 5) is `Dance` and [16, 30) is `instant angora`.
  const CLUE = 'Dance hidden in instant angora'

  it('cuts the definition out of the clue', () => {
    expect(splitAt(CLUE, { end: 5, start: 0 })).toEqual({
      after: ' hidden in instant angora',
      before: '',
      marked: 'Dance',
    })
  })

  // Half-open, so `end === clue.length` is the last character and not one past a cliff. This is the
  // span the wire actually ships for the fodder, so a client that treated the range as inclusive
  // would reject the real thing.
  it('accepts a span that ends at the last character', () => {
    expect(splitAt(CLUE, { end: 30, start: 16 })).toEqual({
      after: '',
      before: 'Dance hidden in ',
      marked: 'instant angora',
    })
  })

  // THE INVARIANT, and it is the test that matters. The clue is rendered verbatim whether or not it
  // is marked; the only thing a span can change is where the element boundaries fall. Cast rather
  // than guarded because every row here is a usable span -- the null cases are below, and a test
  // body may not branch.
  it.each<[string, ClueSpan]>([
    ['the definition', { end: 5, start: 0 }],
    ['the fodder', { end: 30, start: 16 }],
    ['a word in the middle', { end: 15, start: 13 }],
  ])('puts %s back together byte for byte', (_description, span) => {
    const parts = splitAt(CLUE, span) as ClueParts

    expect(parts.before + parts.marked + parts.after).toBe(CLUE)
  })

  // One row per guard, so an eighth guard is a row rather than a test. The two integer rows really
  // do defend one OR-operand each -- delete `Number.isInteger(start)` and only the fractional-start
  // row goes red.
  //
  // THE RANGE ROWS ARE NOT THAT, and the difference is worth knowing before trusting the table.
  // `start >= end` is unfalsifiable through this function: whenever it holds, String.slice returns
  // '' and the whitespace guard below refuses anyway. Its two rows are contract assertions -- a
  // zero-or-negative-width span must be refused, whichever line delivers it -- not coverage of an
  // otherwise-unexercised arm. The guard stays because it states intent where a reader is thinking
  // about ranges, and costs a comparison.
  //
  // THE NEGATIVE-START ROW HAS TO OVERLAP THE CLUE or it proves nothing. `[-1, 5)` was green with
  // `start < 0` deleted, because slice(-1, 5) counts from the end, lands past 5, returns '', and the
  // whitespace guard catches it. `[-5, 30)` is the input that guard actually exists for: without it
  // the function returns before `Dance hidden in instant a` / marked `ngora`, the invariant still
  // holds, and the board confidently underlines the wrong five letters.
  //
  // `[0, 31)` pins the half-open boundary from the far side. `99` is so far out that an off-by-one
  // (`end > clue.length + 1`) survives it while silently accepting an end one past the string.
  //
  // The whitespace row is the least obvious and the one a fuzzed pack finds: [5, 6) on this clue is
  // a single space, which underlines nothing visible and prints the legend as `“ ” is the
  // definition.`
  it.each<[string, ClueSpan]>([
    ['a negative start that overlaps the clue', { end: 30, start: -5 }],
    ['an end past the clue', { end: 99, start: 0 }],
    ['an end one past the clue', { end: 31, start: 0 }],
    ['a start equal to the end', { end: 5, start: 5 }],
    ['a start past the end', { end: 5, start: 6 }],
    ['a fractional start', { end: 5, start: 0.5 }],
    ['a fractional end', { end: 5.5, start: 0 }],
    ['a NaN bound', { end: 5, start: NaN }],
    ['an infinite end', { end: Infinity, start: 0 }],
    ['a slice that is only whitespace', { end: 6, start: 5 }],
    // The type says a span is always there. The network is what decides, and `isValidPuzzle` leaves
    // `data` opaque on purpose -- so the cast is the honest way to write the pack that omits it.
    ['a span the pack left out', undefined as unknown as ClueSpan],
  ])('refuses %s', (_description, span) => {
    expect(splitAt(CLUE, span)).toBeNull()
  })

  // THE CLUE ITSELF, and these rows exist because the docstring above used to claim a degradation
  // this function did not have. It runs on every render rather than only on the win, so before the
  // string guard a pack with no `clue` reached `end > clue.length`, threw a TypeError inside React's
  // commit, and the root error boundary replaced the whole app with "Lull got stuck" -- on every
  // load of that day, offline included, because the pack is persisted and `isValidPuzzle` leaves
  // `data` opaque.
  //
  // The spans are deliberately WELL FORMED in every row, so nothing but the clue can be what these
  // refuse. An object is not here: React rejects it as a child before this function is reached, and
  // no guard in this module can change that.
  it.each<[string, unknown]>([
    ['a clue the pack left out', undefined],
    ['a null clue', null],
    ['a clue that arrived as a number', 5],
  ])('refuses %s', (_description, clue) => {
    expect(splitAt(clue as string, { end: 5, start: 0 })).toBeNull()
  })
})
