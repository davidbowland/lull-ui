import { allPackDates, FIRST_PACK_DATE, isSelectablePackDate, monthsOf, packDateOf, toPackDate } from './pack-dates'

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

describe('FIRST_PACK_DATE', () => {
  // Duplicated from lull-api's PACK_START_DATE with no sync mechanism, so the literal is pinned
  // here rather than only implied by the bounds tests below. If the archive floor ever moves, this
  // is the assertion that says so out loud instead of letting a date arithmetic test drift with it.
  it('is the day Lull began', () => {
    expect(FIRST_PACK_DATE).toEqual('2026-01-01')
  })
})

describe('allPackDates', () => {
  // 2026-01-04T12:00:00Z. Tests run under TZ=UTC, so this is the local date too.
  const fourthOfJanuary = () => Date.UTC(2026, 0, 4, 12)

  it('lists every date from today back to the floor, newest first', () => {
    expect(allPackDates(fourthOfJanuary)).toEqual(['2026-01-04', '2026-01-03', '2026-01-02', '2026-01-01'])
  })

  // The floor is INCLUSIVE. Lull began on 1 January 2026 and that day is playable.
  it('includes the floor itself when today is the floor', () => {
    expect(allPackDates(() => Date.UTC(2026, 0, 1, 12))).toEqual(['2026-01-01'])
  })

  it('crosses a month boundary', () => {
    expect(allPackDates(() => Date.UTC(2026, 1, 1, 12))).toContain('2026-01-31')
  })

  // The only input that produces an empty day panel, and a skewed device clock reaches it without
  // anyone doing anything wrong. It has to come back empty rather than looping to the epoch.
  it('lists nothing when the clock reads before the floor', () => {
    expect(allPackDates(() => Date.UTC(2025, 11, 31, 12))).toEqual([])
  })
})

describe('isSelectablePackDate', () => {
  const august = () => Date.UTC(2026, 7, 25, 12)

  it('accepts today', () => {
    expect(isSelectablePackDate('2026-08-25', august)).toBe(true)
  })

  it('accepts the floor', () => {
    expect(isSelectablePackDate('2026-01-01', august)).toBe(true)
  })

  // Tomorrow is refused even though the API would serve it. A half-generated pack a day
  // early dissolves the daily rhythm the product is built on.
  it('refuses tomorrow', () => {
    expect(isSelectablePackDate('2026-08-26', august)).toBe(false)
  })

  it('refuses a date before Lull began', () => {
    expect(isSelectablePackDate('2025-12-31', august)).toBe(false)
  })

  // A ?d= value is a string off the address bar and may be anything at all. The last three are
  // well-formed and impossible: without the round-trip check '2026-02-30' passes the pattern, sits
  // inside both bounds, and sends the reader to a row labeled 2 March for a day that never existed.
  it.each([
    '',
    'today',
    '2026-8-25',
    '2026-08-25T00:00:00Z',
    '../../etc/passwd',
    '2026-02-30',
    '2026-02-29',
    '2026-03-00',
  ])('refuses the malformed value %p', (value) => {
    expect(isSelectablePackDate(value, august)).toBe(false)
  })
})

describe('monthsOf', () => {
  it('collapses a run of dates to one key per month', () => {
    expect(monthsOf(['2026-03-02', '2026-03-01', '2026-02-28', '2026-02-27'])).toEqual(['2026-03', '2026-02'])
  })

  it('answers an empty list with an empty list', () => {
    expect(monthsOf([])).toEqual([])
  })

  // The single pass collapses NEIGHBORS, not duplicates, and that is the documented precondition:
  // callers pass a contiguous newest-first run, where the two are the same thing. Pinned so the
  // "obvious" rewrite to a Set reads as the behavior change it is rather than as a free tidy-up.
  it('repeats a month when the dates are out of order, which callers must not do', () => {
    expect(monthsOf(['2026-03-02', '2026-02-28', '2026-03-01'])).toEqual(['2026-03', '2026-02', '2026-03'])
  })
})

describe('the default clock', () => {
  // The `now = Date.now` defaults are the only lines no injected clock reaches. Fake timers pin the
  // system clock, so this exercises the default without a live reading in a test body.
  beforeAll(() => {
    jest.useFakeTimers()
    jest.setSystemTime(Date.UTC(2026, 7, 25, 12))
  })

  afterAll(() => jest.useRealTimers())

  it('reads the system clock when none is injected', () => {
    expect(allPackDates()[0]).toEqual('2026-08-25')
    expect(isSelectablePackDate('2026-08-25')).toBe(true)
    expect(isSelectablePackDate('2026-08-26')).toBe(false)
  })
})
