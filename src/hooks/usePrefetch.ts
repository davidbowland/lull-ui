import { useCallback, useEffect, useRef } from 'react'

import { fetchPack } from '@services/lull'
import {
  cachedHintIds,
  cachedPackDates,
  cachedProgressIds,
  removeHints,
  removePack,
  removeProgress,
} from '@services/storage'
import { PackDate } from '@types'
import { packDateOf, toPackDate } from '@utils/pack-dates'

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

// New relative to connections, which never prunes and does not have to: it accumulates
// ~1KB a day. A Lull pack is ~15KB of JSON, and localStorage stores UTF-16, so a year is
// ~11MB against a ~5MB ceiling.
//
// Keep the record, drop the content: solved ids stay in lull:meta, a few bytes each, so
// an old solved puzzle still shows as solved and re-downloads if opened.
const pruneOutsideWindow = (localToday: PackDate): void => {
  const floor = retentionFloor(localToday)

  cachedPackDates()
    .filter((date) => date < floor)
    .forEach(removePack)

  // The date prefix of a puzzle id is the one part of it a client may parse. The rest
  // (`${type}:${shortId}`) is opaque and carries no position, so never index into a pack
  // or infer order from an id. cachedProgressIds has already rejected anything without a
  // valid prefix, which is why the parse cannot fail here.
  cachedProgressIds()
    .filter((puzzleId) => packDateOf(puzzleId)! < floor)
    .forEach(removeProgress)

  // A third lull: prefix, and the only one that would otherwise grow without bound: reveal state is
  // written on every reveal and deliberately never cleared by solving, so nothing but this collects
  // it. cachedHintIds has already rejected anything without a valid date prefix, which is why the
  // parse cannot fail here.
  cachedHintIds()
    .filter((puzzleId) => packDateOf(puzzleId)! < floor)
    .forEach(removeHints)
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
      // The quota argument for pruning first does not survive measurement: a real
      // five-puzzle pack is ~1.3KB, not the ~15KB the spec assumed for a 14-puzzle
      // four-type day. A week is under 10KB against a ~5MB budget.
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
