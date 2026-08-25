import { packDateOf, toPackDate } from './pack-dates'

describe('toPackDate', () => {
  it('formats a date as YYYY-MM-DD', () => {
    expect(toPackDate(new Date(Date.UTC(2026, 7, 18, 12)))).toEqual('2026-08-18')
  })

  it('zero-pads single-digit months and days', () => {
    expect(toPackDate(new Date(Date.UTC(2026, 0, 5, 12)))).toEqual('2026-01-05')
  })

  // Reads local fields, not toISOString. Under TZ=UTC the two agree, which is why the
  // west-of-UTC behavior is covered by injecting dates rather than by moving the clock.
  it('reads the calendar date, not the instant', () => {
    expect(toPackDate(new Date(Date.UTC(2026, 7, 18, 23, 59, 59)))).toEqual('2026-08-18')
  })
})

describe('packDateOf', () => {
  // The date prefix is the ONLY part of a puzzle id a client may read. The rest is
  // `${type}:${shortId}`, opaque, and carries no position.
  it('reads the date prefix of a puzzle id', () => {
    expect(packDateOf('2026-08-18:gofigure:9f3a1c02')).toEqual('2026-08-18')
  })

  it('reads a prefix even when the remainder holds extra colons', () => {
    expect(packDateOf('2026-08-18:gofigure:9f3a:1c02')).toEqual('2026-08-18')
  })

  it('rejects an id with no date prefix', () => {
    expect(packDateOf('gofigure:9f3a1c02')).toBeNull()
  })

  it('rejects a malformed date prefix', () => {
    expect(packDateOf('2026-8-18:gofigure:9f3a1c02')).toBeNull()
  })

  it('rejects a bare date with no remainder, which is a pack key and not a puzzle id', () => {
    expect(packDateOf('2026-08-18')).toBeNull()
  })

  it('rejects an empty id', () => {
    expect(packDateOf('')).toBeNull()
  })
})
