import { useCallback, useEffect, useRef } from 'react'

import { fetchPack } from '@services/lull'
import { cachedPackDates, cachedProgressIds, removePack, removeProgress } from '@services/storage'
import { PackDate } from '@types'
import { packDateOf, toPackDate, utcPackDate } from '@utils/pack-dates'

// Installing stores the most recent seven days. Fixed, not configurable.
const INSTALLED_WINDOW = 7

// Seven days of packs are kept on the device, whether or not they were fetched by this
// window. This is NOT the fetch window, even though the two numbers happen to match:
// prefetchTargets collapses to [localToday] when the app is not installed, so a pruning
// rule derived from targets would wipe a casual visitor's whole cache on every open.
// Prune on age, never on target membership.
const RETENTION_WINDOW = 7

// Checked on every open rather than latched at install time. iOS fires no
// appinstalled event at all, and it evicts localStorage after seven idle days, so a
// one-shot fill is undone before the flight it was meant for.
export const isInstalled = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as Navigator & { standalone?: boolean }).standalone === true

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

export interface PrefetchTargetsOptions {
  installed: boolean
  localToday: PackDate
  utcToday: PackDate
}

// Pure, and exported so the staged-tomorrow branch is testable. utcToday > localToday
// is unreachable through the ambient clock on a machine in or east of UTC, so the dates
// have to be injected rather than manufactured by moving the clock around.
export const prefetchTargets = ({ installed, localToday, utcToday }: PrefetchTargetsOptions): PackDate[] => {
  const wanted = installed ? recentPackDates(INSTALLED_WINDOW, localToday) : [localToday]

  // West of UTC, the pack for tomorrow's local date already exists: the generator runs
  // nightly for the following UTC date. Store it now so it is on the device before
  // midnight. The shelf still renders localToday, so nothing reveals early. East of UTC
  // this is never true. It is also what makes the window up to EIGHT requests, not seven.
  if (utcToday > localToday) {
    wanted.unshift(utcToday)
  }

  return wanted
}

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
}

export const usePrefetch = (now = Date.now): void => {
  const inFlight = useRef(false)
  const abandoned = useRef(false)

  const run = useCallback(async () => {
    // online fires on every transition, with no backoff, and a flapping connection fires
    // it for minutes. Without this, install plus a reconnect start two sequences that
    // both snapshot the cache before either writes, so both fetch everything.
    if (inFlight.current) return

    // Offline, eight sequential requests against a 35-second timeout can hang for over
    // four minutes. onLine is only trustworthy when false, which is the direction that
    // matters here.
    if (!window.navigator.onLine) return

    inFlight.current = true
    try {
      const localToday = toPackDate(new Date(now()))

      // Before the fetches, not after: the writes below are what run into the quota, and
      // freeing it first is the point of pruning at all.
      pruneOutsideWindow(localToday)

      const wanted = prefetchTargets({
        installed: isInstalled(),
        localToday,
        utcToday: utcPackDate(now),
      })

      // Every target, not just the ones missing from the cache. fetchPack is cache-first
      // and answers a COMPLETE stored pack without a request, but an incomplete one has
      // to be asked again -- and a filter on stored dates alone could not tell the two
      // apart, so a day that filled in later would stay partial forever.
      for (const date of wanted) {
        // Nobody is left to receive these. Stop rather than spend the rest of the window
        // on requests for a screen that is gone.
        if (abandoned.current) return

        try {
          await fetchPack(date)
        } catch (error: unknown) {
          console.error('prefetch failed', { date, error })
        }
      }
    } catch (error: unknown) {
      // isInstalled, prefetchTargets and the pruning pass all sit outside the per-pack
      // guard above, and matchMedia and localStorage can each throw. run is called bare
      // and registered as a listener, so neither call site has anywhere to put a
      // rejection: without this it surfaces as an unhandled rejection that names no hook,
      // and on the listener path nothing catches it at all.
      console.error('prefetch run failed', { error })
    } finally {
      inFlight.current = false
    }
  }, [now])

  useEffect(() => {
    abandoned.current = false
    run()

    // Never on a timer: a service worker cannot wake itself without push, so open,
    // reconnect, and install are the only moments this can run.
    window.addEventListener('online', run)
    window.addEventListener('appinstalled', run)
    return () => {
      abandoned.current = true
      window.removeEventListener('online', run)
      window.removeEventListener('appinstalled', run)
    }
  }, [run])
}
