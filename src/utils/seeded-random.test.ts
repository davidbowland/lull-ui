import { seededRandom } from '@utils/seeded-random'

// CARRIED FROM phrazle/rungs.test.ts, where they ran against that board's own copy. The three rows
// below are unchanged; what moved is the subject, from one of three identical functions to the only
// one. The other two suites went on exercising their copies THROUGH a chooser and never asserted the
// generator itself, so nothing is lost by their copies going away.
describe('seededRandom', () => {
  it('is deterministic for one seed', () => {
    const left = seededRandom('2026-08-31:phrazle:abcd1234')
    const right = seededRandom('2026-08-31:phrazle:abcd1234')
    expect([left(), left(), left()]).toStrictEqual([right(), right(), right()])
  })

  it('differs between seeds', () => {
    expect(seededRandom('one')()).not.toBe(seededRandom('two')())
  })

  it('stays inside the unit interval', () => {
    const random = seededRandom('seed')
    const drawn = Array.from({ length: 50 }, () => random())
    expect(drawn.every((value) => value >= 0 && value < 1)).toBe(true)
  })

  // THE ROW THE CONSOLIDATION OWES, and it exists because the merge was only safe if the three copies
  // agreed. They were identical to the byte on the day this moved -- so every golden fixture written
  // against a board's own copy still holds, and a future edit that changes the sequence would now
  // move all three benches at once rather than one.
  //
  // Written out rather than computed, which is what makes it an assertion: an expectation built by
  // calling `seededRandom` again would agree with any sequence at all, including a rewritten one.
  it('produces the sequence the boards’ golden fixtures were written against', () => {
    const random = seededRandom('2026-08-20:phrazle:4b2c8a1d')
    expect(Array.from({ length: 3 }, () => Number(random().toFixed(10)))).toStrictEqual([
      0.5258393029, 0.3117877922, 0.7206841942,
    ])
  })
})
