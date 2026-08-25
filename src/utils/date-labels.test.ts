import { crumbLabel, dayLabel, monthLabel } from './date-labels'

// Two locales, never navigator.language: the label is what is being asserted, and a test that read
// the runner's locale would pass or fail on the machine rather than on the code.
//
// Both are here because ONE would not be a test of anything. These functions exist so the device
// decides how a day is spelled, and an implementation that hardcoded a locale and ignored the
// parameter would satisfy any single-locale file. en-GB puts the day first with no comma after the
// weekday; en-US puts the month first and a comma after both -- and en-US is what actually ships,
// since defaultLocale() is navigator.language. None of it is assembled here: a test that hand-built
// the separators would be asserting a format this file does not own.
const GB = 'en-GB'
const US = 'en-US'

// A fixed clock, because the year is conditional and a live Date.now() would make these assertions
// stop holding on 1 January. Mid-June, so the device's local year is 2026 in every zone.
const IN_2026 = (): number => Date.UTC(2026, 5, 15)

describe('dayLabel', () => {
  it('spells the day out in full', () => {
    expect(dayLabel('2026-08-25', GB, IN_2026)).toEqual('Tuesday 25 August')
  })

  it('lets the locale decide the word order and the punctuation', () => {
    expect(dayLabel('2026-08-25', US, IN_2026)).toEqual('Tuesday, August 25')
  })

  it('leaves the year off a day in the current year', () => {
    expect(dayLabel('2026-03-14', GB, IN_2026)).toEqual('Saturday 14 March')
  })

  // The day panel reaches back to 2026-01-01, so a row can name a day in a year the reader is no
  // longer in. "Saturday 14 March" is a different promise from "Friday, 14 March 2025".
  it('names the year of a day outside the current year', () => {
    expect(dayLabel('2025-03-14', GB, IN_2026)).toEqual('Friday, 14 March 2025')
  })

  // This does NOT guard the zone bug, and saying so is the point. A PackDate is a plain string and
  // every label is formatted with timeZone: 'UTC', without which a device west of UTC would render
  // 2026-01-01 as "Wednesday 31 December". The suite runs TZ=UTC, so deleting that option leaves
  // this expectation green -- and no assertion here can change that, because Jest gives each
  // environment a copy of process.env and a mid-test write to TZ never reaches Node. What this test
  // does defend is the arithmetic at the year boundary, where an off-by-one in utcDay's month index
  // or a rollover would show up first.
  it('names the first day of the year without rolling into the previous one', () => {
    expect(dayLabel('2026-01-01', GB, IN_2026)).toEqual('Thursday 1 January')
  })
})

describe('crumbLabel', () => {
  it('abbreviates so the day never fills a 320px bar', () => {
    expect(crumbLabel('2026-08-25', GB, IN_2026)).toEqual('Tue 25 Aug')
  })

  it('lets the locale decide the word order and the punctuation', () => {
    expect(crumbLabel('2026-08-25', US, IN_2026)).toEqual('Tue, Aug 25')
  })

  it('leaves the year off a day in the current year', () => {
    expect(crumbLabel('2026-03-14', GB, IN_2026)).toEqual('Sat 14 Mar')
  })

  it('names the year of a day outside the current year', () => {
    expect(crumbLabel('2025-03-14', GB, IN_2026)).toEqual('Fri, 14 Mar 2025')
  })
})

describe('monthLabel', () => {
  it('names a month and its year from a YYYY-MM key', () => {
    expect(monthLabel('2026-03', GB)).toEqual('March 2026')
  })

  it('handles the first month without rolling into the previous year', () => {
    expect(monthLabel('2026-01', GB)).toEqual('January 2026')
  })

  it('names the year even when it is the current one, because a month heading is where the year lives', () => {
    expect(monthLabel('2026-08', US)).toEqual('August 2026')
  })
})

// The injected clock is the test's clock. Production passes nothing and gets the device's, so the
// default is a real code path and is exercised here rather than assumed.
describe('the default clock', () => {
  beforeAll(() => {
    jest.useFakeTimers()
    jest.setSystemTime(Date.UTC(2026, 5, 15))
  })

  afterAll(() => {
    jest.useRealTimers()
  })

  it('reads the device clock when the caller injects none', () => {
    expect(dayLabel('2026-03-14', GB)).toEqual('Saturday 14 March')
    expect(dayLabel('2025-03-14', GB)).toEqual('Friday, 14 March 2025')
    expect(crumbLabel('2026-03-14', GB)).toEqual('Sat 14 Mar')
    expect(crumbLabel('2025-03-14', GB)).toEqual('Fri, 14 Mar 2025')
  })
})
