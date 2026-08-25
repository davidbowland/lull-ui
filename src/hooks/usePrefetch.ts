import { useCallback, useEffect, useRef } from 'react'

import { fetchPack } from '@services/lull'
import { cachedPackDates, removePack } from '@services/storage'
import { PackDate } from '@types'
import { toPackDate } from '@utils/pack-dates'

// Seven days of packs are kept on the device, whether or not this run fetched them. This
// is emphatically NOT the fetch window: exactly one date is ever requested, so a pruning
// rule derived from what was asked for would wipe the device down to a single day on
// every open. Prune on age, never on what this run went and got.
const RETENTION_WINDOW = 7

// Seeded from the date, not from a clock, so the window always contains the day it is
// counted back from. Parsed field by field rather than through Date(string), which
// reads a bare date as UTC midnight -- and lands on yesterday everywhere west of it.
const recentPackDates = (count: number, from: PackDate): PackDate[] => {
  const [year, month, day] = from.split('-').map(Number)
  const cursor = new Date(year, month - 1, day)
  const dates: PackDate[] = []
  for (let index = 0; index < count; index += 1) {
    dates.push(toPackDate(cursor))
    cursor.setDate(cursor.getDate() - 1)
  }
  return dates
}

// The oldest date the device keeps. Anything strictly older goes. Exported so the rule
// is testable without driving the hook.
export const retentionFloor = (localToday: PackDate): PackDate =>
  recentPackDates(RETENTION_WINDOW, localToday)[RETENTION_WINDOW - 1]

// THE DAYS THIS SESSION WENT AND GOT, exempt from the age rule below.
//
// An age rule was the whole story while nothing could reach a day older than the window: every
// cached pack was one this app had put there itself, within the last seven days, so "older than the
// floor" and "nobody wants this" were the same sentence. Reaching an earlier day breaks that
// identity outright. A player who names 14 March and waits thirty seconds for it has a pack that is
// five months past the floor and is the ONE pack on the device they are looking at -- so the rule
// that collects by age now names, precisely, the set of days this feature exists to reach.
//
// It is not a corner. run() fires on open, reconnect and RESUME, and the hook is mounted in _app for
// the life of the page, so `abandoned` is never true in practice: background the app to read a text,
// come back, and visibilitychange deletes 14 March out from under the screen showing it. removePack
// announces, the shelf re-reads, the day is no longer held, and the address bar is rewritten to `/`
// -- the player is bounced to today with no message, and the March row in the panel goes on saying
// "Here now" about a day that is gone.
//
// SESSION-SCOPED ON PURPOSE, and this is the half worth arguing rather than the exemption itself.
// The spec's rejected alternative was a STORED set of requested days, and that objection still
// stands: a key that outlives the tab turns "I looked at March once" into a permanent lease on the
// budget, needs its own collector to ever give the space back, and hands the next reader a second
// retention rule to reconcile with this one. A module-level Set is bounded by the page: it is empty
// on the next load, so a day reached yesterday is collected on tomorrow's first run exactly as it
// would have been, and it can only grow by one entry per thirty-second round trip a human sat
// through. Nothing else may write to it -- see keepThisSession, which is the only door in.
const requestedThisSession = new Set<PackDate>()

// The one writer, called by the shelf when a day the player named has actually landed. It takes a
// date and answers nothing: the caller learns no more about the retention rule than that the day it
// just fetched is worth keeping.
export const keepThisSession = (date: PackDate): void => {
  requestedThisSession.add(date)
}

// PACKS ONLY, and new relative to connections, which never prunes and does not have to: it
// accumulates ~1KB a day. Packs are the one family whose per-day weight is measured in kilobytes. A
// five-puzzle day with its hint ladders measures ~2.5KB of JSON against the fixtures in
// test/__mocks__.ts, and localStorage stores UTF-16, so it is ~5KB on the device and a year is
// ~1.8MB against a ~5MB ceiling. Dropping one costs nothing a player notices: reaching a past day
// needs a connection anyway, so the pack is re-requested the moment it is wanted.
//
// Keep the record, drop the content: solved ids stay in lull:meta, a few bytes each, so an old
// solved puzzle still shows as solved and re-downloads if opened.
//
// Progress and hints are hundreds of bytes INCLUDING THE KEY, which is most of the total and is the
// easy part to forget: `lull:progress:2026-08-10:missingvowels:9f8e7d6c` is 47 characters, 94 bytes
// stored, before any value at all. Call it ~230 bytes for a puzzle a player both started and took a
// rung on, and ~1.5KB for the largest thing any board writes -- a full Phrazle board, whose codec
// caps itself at 25 canonical guesses. A year of playing all five puzzles every day is therefore
// ~400KB, a quarter of what a year of packs costs, which is the bet lull:meta.solved already makes
// on solved ids.
//
// Not free forever, and worth saying so rather than rounding it to zero: a DECADE of that is
// megabytes, because the key is paid on every entry. Two things answer for it. writeProgress caps a
// single value, so no one board can run away with the budget. And the day this genuinely needs
// collecting, the rule has to be "oldest first, under pressure" -- never "older than N days", which
// is the rule that deleted a board the player was still sitting in front of.
//
// The two blocks that used to sit here -- progress and hints -- were therefore deleted rather than
// narrowed. They pruned by the date prefix of a puzzle id, which was sound while nothing could reach
// a day older than the window: no old day could hold progress, so no old progress could be lost.
// Reaching an earlier day puts exactly that on the feature's primary path -- open 14 March, start a
// puzzle, close the app, and the next run() takes the board and the revealed rungs with it.
//
// So an old pack is dropped and re-requested if the day is opened again, while everything the PLAYER
// put there survives.
//
// Age AND the session exemption, never age alone -- see requestedThisSession above for why an age
// rule stopped being the whole story the moment a day older than the window became reachable.
const pruneOutsideWindow = (localToday: PackDate): void => {
  const floor = retentionFloor(localToday)

  cachedPackDates()
    .filter((date) => date < floor && !requestedThisSession.has(date))
    .forEach(removePack)
}

export const usePrefetch = (now = Date.now): void => {
  const inFlight = useRef(false)
  const abandoned = useRef(false)

  const run = useCallback(async () => {
    // online fires on every transition, with no backoff, and a flapping connection fires
    // it for minutes. Without this, a reconnect during the first run starts a second
    // sequence that snapshots the cache before the first one writes.
    if (inFlight.current) return

    // A request against a 35-second timeout hangs for the whole timeout when there is no
    // network. onLine is only trustworthy when false, which is the direction that matters
    // here.
    if (!window.navigator.onLine) return

    inFlight.current = true
    try {
      const localToday = toPackDate(new Date(now()))

      // ONE request, for the date the shelf renders. Not a window, not a staged tomorrow,
      // and not conditional on whether the app is installed.
      //
      // Asked for on every run rather than only when it is missing: fetchPack is
      // cache-first and answers a COMPLETE stored pack without a request, but an
      // INCOMPLETE day has to be asked again, and a check against stored dates alone
      // could not tell the two apart -- so a day that filled in later would stay partial
      // forever.
      try {
        await fetchPack(localToday)
      } catch (error: unknown) {
        console.error('prefetch failed', { date: localToday, error })
      }

      // AFTER the fetch, not before, and it still runs when the fetch failed. run() bails
      // when navigator.onLine is false, so the genuinely-offline case never reaches here
      // -- but the case this product is named for is onLine === true with no usable
      // throughput: a captive portal, one bar in a waiting room. Pruning first meant a
      // player returning after a week had every cached pack deleted, then the fetch failed
      // and was swallowed, leaving an empty app where playable content sat a moment
      // earlier.
      //
      // The quota argument for pruning first does not survive measurement: a day's pack is a couple
      // of kilobytes, not the order of magnitude more the spec assumed for a 14-puzzle four-type
      // day, so a week of them is tens of kilobytes against a ~5MB budget. The measured sizes are
      // stated once, above pruneOutsideWindow.
      //
      // Nobody is left to receive a write for a screen that is gone.
      if (abandoned.current) return
      pruneOutsideWindow(localToday)
    } catch (error: unknown) {
      // The clock, the date arithmetic and the pruning pass all sit outside the per-pack
      // guard above. run is called bare and registered as a listener, so neither call site
      // has anywhere to put a rejection: without this it surfaces as an unhandled
      // rejection that names no hook, and on the listener path nothing catches it at all.
      console.error('prefetch run failed', { error })
    } finally {
      inFlight.current = false
    }
  }, [now])

  useEffect(() => {
    abandoned.current = false
    run()

    // Never on a timer: a service worker cannot wake itself without push, so open,
    // reconnect and RESUME are the only moments this can run. Installing is NOT one of
    // them any more -- it used to widen the window from two days to seven, and now that
    // the target is today either way, an appinstalled run would re-ask for the date the
    // run on open already fetched.
    //
    // visibilitychange is the one that makes a daily habit work. An installed app keeps
    // its JS context across days, so the next morning there is no remount and no `online`
    // (the connection never dropped). Without this the shelf re-reads storage on resume,
    // finds nothing newer, and says "Today's puzzles aren't ready yet" about a pack that
    // is sitting on the server -- and nothing ever asks for it. The Shelf already listens
    // for this; the writer did not, which is the half that matters.
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void run()
    }

    window.addEventListener('online', run)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      abandoned.current = true
      window.removeEventListener('online', run)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [run])
}
