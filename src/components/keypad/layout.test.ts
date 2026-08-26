import { ROWS, UNITS } from './layout'

// The only two A-Z pads in the product read their letter order out of this module, so an invariant
// broken here is broken on both benches at once -- and a dropped or doubled letter is exactly the
// kind of typo a hand-written keyboard produces and nothing on screen announces. `ABCDEFG...` had
// no such failure mode, which is why the pad went twenty-eight keys with no test of its contents
// for as long as it did.
describe('ROWS', () => {
  // The shape the layout is named after. Ten, nine, seven -- the seven being the row the two
  // utility keys stand in, which is what makes it a row of nine cells like the one above it.
  it('is three rows of ten, nine and seven', () => {
    expect(ROWS.map((row) => row.length)).toEqual([10, 9, 7])
  })

  // Pinned to the literal, not rebuilt from ROWS: an assertion that derives the expectation from
  // the thing it is checking passes on any order at all, including the alphabet this replaced.
  it('is QWERTY', () => {
    expect(ROWS.map((row) => row.join(''))).toEqual(['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'])
  })

  // THE INVARIANT THAT SURVIVES A REDESIGN. The two tests above pin one particular keyboard; this
  // one pins what any keyboard has to be, so a future switch to AZERTY or to a split layout still
  // has to type every letter exactly once.
  it('carries all twenty-six letters exactly once', () => {
    const letters = ROWS.flat()

    expect([...letters].sort().join('')).toEqual('ABCDEFGHIJKLMNOPQRSTUVWXYZ')
  })

  it('is upper case throughout', () => {
    expect(ROWS.flat().every((letter) => /^[A-Z]$/.test(letter))).toBe(true)
  })
})

// EVERY ROW SPANS THE SAME TEN UNITS, which is what keeps the three rows the same width and the
// keys the same size in all of them. The alphabet pad got this for free from `grid-cols-7`; a
// keyboard has to be told, because its rows hold different numbers of things.
//
// Row 1: ten letters.
// Row 2: nine letters between two half-unit indents -- 0.5 + 9 + 0.5.
// Row 3: seven letters between two utility keys of one and a half units -- 1.5 + 7 + 1.5.
describe('UNITS', () => {
  it('is what the letter row spends', () => {
    expect(ROWS[0].length).toEqual(UNITS)
  })

  it('is what the indented row spends', () => {
    expect(0.5 + ROWS[1].length + 0.5).toEqual(UNITS)
  })

  it('is what the utility row spends', () => {
    expect(1.5 + ROWS[2].length + 1.5).toEqual(UNITS)
  })
})
