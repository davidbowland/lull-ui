import { useCallback, useEffect, useRef } from 'react'

import { fetchPack } from '@services/lull'
import { cachedPackDates, readMeta, readPack, removePack } from '@services/storage'
import { PackDate } from '@types'
import { summarizeDay } from '@utils/day-summary'
import { toPackDate } from '@utils/pack-dates'

// Seven packs are kept on the device, whether or not this run fetched them. This is
// emphatically NOT the fetch window: exactly one date is ever requested, so a pruning
// rule derived from what was asked for would wipe the device down to a single day on
// every open.
//
// SEVEN PACKS, NOT SEVEN DAYS. This was an age rule -- anything older than today - 6 went --
// and it deleted the days a player had gone and fetched on purpose. Ask for a week of March
// before a flight, close the app, open it once more at the gate while still online, and
// run() collected all of it: the session exemption below had died with the page, and every
// March day was months past the floor. The plane had nothing on it.
const RETENTION_COUNT = 7

// WHICH SEVEN: the days with something left to play first, then the newest. A finished day is
// the cheapest thing on the device to lose -- its solves live in lull:meta and it re-downloads
// the moment it is opened -- and an unfinished one is the reason anybody fetched it. Recency
// breaks the tie within each group, so a device full of unfinished days keeps the latest ones.
//
// `status !== 'allSolved'` rather than `=== 'hasUnsolved'`, through summarizeDay so "finished"
// means what it means on the day panel: a pack still filling in is never finished, and a pack
// readPack refuses is 'notHere', which ranks it with the unfinished days. It is about to be
// discarded by readPack anyway; this rule has no business deciding that.
//
// Exported so the rule is testable without driving the hook.
export const packsToKeep = (
  cached: PackDate[],
  localToday: PackDate,
  solved: ReadonlySet<string>,
  keep: ReadonlySet<PackDate> = new Set(),
): Set<PackDate> => {
  // Newest first, whatever order the caller handed over.
  const past = cached.filter((date) => date <= localToday).toSorted((first, second) => (first < second ? 1 : -1))
  const isFinished = (date: PackDate): boolean => summarizeDay(date, readPack(date), solved).status === 'allSolved'
  const older = past.slice(1)
  const ranked = [
    // The day the shelf shows by default -- today, or the newest pack before it when today has not
    // arrived -- ranks first whether or not it is finished. Collecting it would move the plate out
    // from under a player who pressed nothing, and on the next open run() would fetch today again
    // only to collect it again.
    ...past.slice(0, 1),
    ...older.filter((date) => !isFinished(date)),
    ...older.filter(isFinished),
  ]

  return new Set([
    ...ranked.slice(0, RETENTION_COUNT),
    // A date newer than today is one no rule here has reached yet; west of UTC it is tomorrow's
    // pack, on the device on purpose.
    ...cached.filter((date) => date > localToday),
    ...cached.filter((date) => keep.has(date)),
  ])
}

// THE DAYS THIS SESSION WENT AND GOT, exempt from the ranking above.
//
// The ranking keeps seven, and the day on screen need not be one of them: open a finished day to look
// back at it and it ranks below every unfinished one, or fetch an eighth unfinished day and the
// oldest of them falls off the end. Either way it is the ONE pack on the device the player is
// looking at.
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
// on the next load, so a day reached yesterday is ranked on tomorrow's first run like any other, and
// it can only grow by one entry per thirty-second round trip a human sat
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
// ~1.8MB against a ~5MB ceiling. Dropping a FINISHED one costs nothing a player notices: it is
// re-requested the moment it is wanted. Dropping an unfinished one is not free -- offline, it is the
// day they meant to play -- which is why the ranking above keeps those first.
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
// The ranked seven AND the session exemption -- see requestedThisSession above for why the day on
// screen has to survive whatever the ranking says about it.
const pruneOutsideWindow = (localToday: PackDate): void => {
  const cached = cachedPackDates()
  const keep = packsToKeep(cached, localToday, new Set(readMeta().solved), requestedThisSession)

  cached.filter((date) => !keep.has(date)).forEach(removePack)
}

// THE DAYS ON THIS DEVICE THAT ARE STILL MISSING PUZZLES, today excluded because the line above the
// call site has just asked for it.
//
// A pack is written the moment it arrives, complete or not, because a partial day is playable and
// that is the whole reason lull-api serves one. fetchPack already re-requests an incomplete pack
// rather than answering it from the device -- but only for a date somebody asks about, and until
// this existed the only date anybody asked about was today. Nothing else in the app re-asks for a
// day it already holds: selectDay renders the cached pack, and the month list's monthRowSelect
// fetches only when `here === undefined`.
//
// So a day cached while the generators were still filling it froze at whatever had landed. Open Lull
// at 03:40 UTC, when the nightly run has written goFigure and the slow lanes are still going, and
// that morning is three puzzles of sixteen until the key ages out of the retention window a week
// later or localStorage is cleared by hand. That is what happened to 2026-09-05, and it is not a
// corner: the whole point of a daily habit is opening the app early.
//
// READ AFTER THE FETCH ABOVE HAS WRITTEN, so a date that just arrived complete is not asked for
// twice. `=== false` and not `!pack.complete`: readPack answers null for a key it just discarded as
// malformed, and a day with no pack is not a day to top up -- it is a day the device does not have,
// which is the day panel's job and not this one's.
const incompleteCachedDates = (except: PackDate): PackDate[] =>
  cachedPackDates().filter((date) => date !== except && readPack(date)?.complete === false)

// ONE AT A TIME, and each failure kept to its own day. Sequential because these are background
// requests against a 35-second timeout on a connection the player is also using, and a Promise.all
// over seven of them is a stampede on the one screen this product is named for. Guarded
// individually because the loop would otherwise abandon every day behind the first rejection --
// and a dropped connection rejects the first one.
//
// The count bounds itself: the prune above has already run, so this walks the seven kept packs plus
// whatever days this session went and got, and only the ones still short. On an ordinary day it is
// empty and costs nothing.
const topUpIncomplete = async (except: PackDate): Promise<void> => {
  for (const date of incompleteCachedDates(except)) {
    try {
      await fetchPack(date)
    } catch (error: unknown) {
      console.error('top-up failed', { date, error })
    }
  }
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

      // AFTER the prune, so no request is spent on a day that is about to be deleted -- and below
      // the `abandoned` guard with it, which costs nothing: run() fires again on the next open, and
      // these are background requests nobody is waiting on.
      await topUpIncomplete(localToday)
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
