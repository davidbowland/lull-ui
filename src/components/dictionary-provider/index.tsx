import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

import { entryFor } from '@registry'
import { fetchDictionary, mayAttempt, readCachedDictionary, scheduleRetry } from '@services/dictionary'
import { cachedPackDates, readDictRetry, readPack, STORAGE_EVENT } from '@services/storage'
import { RetryState } from '@types'

export interface DictionaryState {
  // Three states and no error, because a player can do exactly one thing about a missing word list
  // -- be online -- and the shelf says so in six words. There is no toast, no retry button, and no
  // progress bar anywhere downstream of this.
  //
  // WHAT EACH ONE MEANS, because two of them used to be told apart nowhere and are now told apart by
  // both surfaces:
  //
  //   'loading' -- no answer yet. It covers the cache read as well as the request, which is the
  //     whole point: reading the Cache API is asynchronous, so there is a real window on every cold
  //     open in which nothing is known, and calling that window 'absent' made both surfaces print a
  //     sentence that was false.
  //   'absent' -- we looked, it is not here, and being online is what fixes it. Only a failed
  //     attempt, or a backoff left over from one, produces it.
  //   'ready' -- the set is in hand.
  //
  // So 'loading' is the state a surface must say nothing actionable about, and 'absent' is the one
  // it may tell the player to reconnect for.
  status: 'absent' | 'loading' | 'ready'
  words: ReadonlySet<string> | null
}

// The default is the CONSERVATIVE one: a tree with no provider above it reports absent, so a shelf
// row that needs a dictionary is refused rather than linking to a board the frame will not mount.
//
// IT DIFFERS FROM THE PROVIDER'S INITIAL STATE BELOW, on purpose, and the two say different things.
// A tree with no provider will never look, so "we looked and it is not here" is exactly true of it.
// A mounted provider is already looking on its first render, so the same value there would be a
// claim it has not earned.
//
// EXPORTED FOR THE SHELL'S TESTS, which supply a state directly instead of driving a network. A
// BOARD MAY NOT IMPORT IT, and neither may anything under src/components that a board renders --
// that is the whole line the sixth prop draws: the board's contract is readable off
// PuzzleComponentProps, and a context is exactly the thing that is not.
export const DictionaryContext = createContext<DictionaryState>({ status: 'absent', words: null })

// The shell's hook, and only the shell's. PuzzleFrame reads it and hands the set down as the sixth
// prop; the shelf reads it to decide whether a row is a link. A BOARD MAY NEVER CALL IT.
export const useDictionary = (): DictionaryState => useContext(DictionaryContext)

// PACKS FIRST, DICTIONARY LAST. A device holding packs that need no word list does not ask for one,
// so a player whose packs never carry a Phrazle does not pay for it. It reads the registry rather
// than a type literal, so the day a second type needs one this function is already right.
//
// It answers a question about the CACHED packs and nothing else, and its caller is careful about
// what an empty answer means -- see the note beside the call.
//
// readPack answers null for a key whose value will not parse or does not validate, which is why the
// `?? []` is here rather than a non-null read: cachedPackDates derives its index from the KEYS, so
// a bad key is listed until something reads it.
const somethingNeedsIt = (): boolean =>
  cachedPackDates().some((date) =>
    (readPack(date)?.puzzles ?? []).some((puzzle) => entryFor(puzzle.type)?.needsDictionary === true),
  )

interface DictionaryProviderProps {
  children: React.ReactNode
  // Injected with defaults because CLAUDE.md requires it: both feed backoff, which decides when
  // the next request goes out, and a test drives them as literals.
  now?: () => number
  random?: () => number
}

// THE SHELL'S, and nobody should move it. It owns the fetch, the Cache API, the retry state and
// the timers, and it publishes the two facts the shell needs. One provider means one fetch per app
// open however many surfaces read it, and the 51,852-entry Set is built once rather than per board
// mount.
export const DictionaryProvider = ({
  children,
  now = Date.now,
  random = Math.random,
}: DictionaryProviderProps): React.ReactNode => {
  // 'loading' AND NOT 'absent', which is the one place this differs from DictionaryContext's default
  // above. `readCachedDictionary` is asynchronous -- a cross-process Cache API call, a 123KB body
  // read and a 51,852-entry Set build -- while the frame's `readPack` is synchronous, so on a cold
  // open the first painted frame lands well before the cache has answered. Starting at 'absent' made
  // that frame say "Phrazle needs a one-time download" on a device that had the word list, and put
  // "Needs a connection to set up." on a shelf row that needed neither.
  //
  // 'loading' is what that window actually is: we are looking. Nothing downstream may turn it into
  // an instruction.
  //
  // A device whose cached packs need no dictionary never leaves this value, because `run` returns
  // before setting anything. THAT IS ONLY UNOBSERVABLE ON THE SHELF, and this comment used to claim
  // it was unobservable everywhere: a shelf row reads `status` under `entry.needsDictionary`, and a
  // row carrying that flag does mean a pack carrying that puzzle is on the device. PuzzleFrame is
  // the counterexample -- it plays `readPack(date) ?? fetched`, so it mounts boards from packs that
  // were never stored -- which is why `run`'s pack scan now treats an EMPTY index as "we have been
  // told nothing" rather than as "no". See the note there.
  const [state, setState] = useState<DictionaryState>({ status: 'loading', words: null })

  // Exactly as usePrefetch does it: `online` fires on every transition and a flapping connection
  // fires it for minutes, so without this a reconnect during an in-flight request starts a second.
  const inFlight = useRef(false)
  // THE STATUS, READ BACK. `run` needs to know whether a set is already in hand, and it may not read
  // `state` to find out: naming state in its dependencies rebuilds the callback on every publish,
  // which re-runs the effect below, which detaches and re-attaches four listeners on every change.
  // A ref is the same fact with no render in it.
  const statusRef = useRef<DictionaryState['status']>('loading')
  // The other half of the published value, kept for the same reason and used for one thing: telling
  // a republish of the same two facts apart from a real change. See `publish`.
  const wordsRef = useRef<DictionaryState['words']>(null)
  // THE SCHEDULE, HELD IN MEMORY AS WELL AS ON DISK, because a device that cannot write it still has
  // to honor it. `lull:dict:retry` is a NEW key, so a full localStorage refuses it while the packs
  // already written go on reading back perfectly -- and the four signals below include
  // STORAGE_EVENT, which fires on every single move a player makes. With the schedule readable only
  // from storage, `readDictRetry()` answered null on every one of those, `mayAttempt(null)` was
  // true, and the provider issued a fresh request per keystroke against a route throttled at 2
  // requests per second across ALL callers. In memory the backoff still holds for the session, which
  // is the span that matters: the alternative was no backoff at all.
  const scheduleRef = useRef<RetryState | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The timer reaches `run` through a ref, and that is a cycle rather than a preference: `arm`
  // schedules the next attempt and the next attempt is `run`, which calls `arm`. Two consts cannot
  // name each other, and naming `run` in `arm`'s dependencies would rebuild `arm` on every change
  // to `run` -- which rebuilds `run`. The effect below keeps the ref current.
  const runRef = useRef<() => void>(() => undefined)
  // STILL MOUNTED, and this is the only thing that ends a session. `run` is async and holds no
  // cancellation token, so a request that settles after the tree came down went on to publish and
  // then to ARM -- setting `timer.current` after the one piece of code that would have cleared it
  // had already run. That timer called `runRef.current()`, the attempt failed, and it armed again:
  // a provider that had been unmounted for five minutes was still issuing requests against a route
  // throttled at 2 per second across all callers.
  //
  // IT IS REACHABLE IN PRODUCTION, not only from a test. This provider sits INSIDE ErrorBoundary in
  // _app.tsx -- deliberately, so nothing above the boundary can throw with nothing to catch it --
  // so any render throw anywhere in the app unmounts it mid-flight.
  //
  // Set true at the top of the effect rather than only at construction, so a re-run of the effect
  // brings it back rather than leaving a live provider inert.
  const alive = useRef(true)

  // The one writer. Every publish moves the refs and the state together, so `run`'s guard can never
  // read a status the tree is not showing.
  //
  // AN UNCHANGED FACT IS NOT A PUBLISH. This value is the context, so setState here re-renders every
  // consumer in the app -- PuzzleFrame and every ShelfRow -- and a fresh object is a change to React
  // however identical its contents. `run` is re-entered on every STORAGE_EVENT, which is every move
  // a player makes, and the common case downstream of a failed attempt is republishing `absent` with
  // no words: the same two facts, a new identity, a re-render of the whole tree per keystroke. The
  // words are compared by IDENTITY on purpose -- one provider builds one 51,852-entry Set and hands
  // the same one out, so a different set really is different news.
  const publish = useCallback((next: DictionaryState): void => {
    if (!alive.current) return
    if (next.status === statusRef.current && next.words === wordsRef.current) return
    statusRef.current = next.status
    wordsRef.current = next.words
    setState(next)
  }, [])

  // ONE timer at a time, which is hygiene rather than the stampede guard it used to claim to be.
  // Two timers landing on a due schedule are absorbed by `inFlight` in `run` -- the second finds a
  // request already open and returns -- so what this `clearTimeout` actually buys is that a wait
  // re-armed nearer (a reconnect during a backoff) replaces the older, further-out timeout instead
  // of leaving it pending to fire after the retry has already succeeded. That is worth having and
  // is not the thing that stops a burst of requests.
  const arm = useCallback(
    (nextAt: number): void => {
      if (!alive.current) return
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(() => runRef.current(), Math.max(0, nextAt - now()))
    },
    [now],
  )

  const run = useCallback(async (): Promise<void> => {
    // A SET ALREADY IN HAND IS NEVER GIVEN UP, and this is the first line for a reason. Every one of
    // the four signals below re-enters here, and STORAGE_EVENT fires on every single move a player
    // makes: writeProgress, writeHints and markSolved all announce. Without this guard a device with
    // no usable Cache API -- `caches` undefined outside a secure context, Firefox private browsing,
    // a `cache.put` that failed and was swallowed -- fell through to a fresh request on every
    // keystroke, and the state it set on the way past was 'loading'. PuzzleFrame gates on status, so
    // the board a player was in the middle of was replaced by the dead-end panel and its unsaved
    // work went with it; offline, the request failed and the board was gone for the rest of the
    // session.
    //
    // The healthy path paid for it too: a re-read and a re-parse of the whole word list into a fresh
    // 51,852-entry Set, and a new context object through the entire app, per move.
    if (statusRef.current === 'ready') return
    if (inFlight.current) return

    // Consulted BEFORE every attempt, which is the difference between backoff and a delay: a device
    // that closed the tab mid-wait does not restart at zero on reopen. `scheduled` is read for the
    // null case explicitly rather than through mayAttempt alone, because the arm below needs the
    // nextAt and TypeScript cannot narrow a value through another function.
    //
    // AND IT IS NOW THE CHEAPEST QUESTION ASKED, ahead of both the pack scan and the cache read.
    // Waiting out a backoff is the ordinary state of a device with no word list, and every keystroke
    // on any board re-enters here: the two below are a JSON.parse of every cached pack and a
    // cross-process Cache API call, and running them per move to arrive at "still absent" pays the
    // whole cost of the wait over and over.
    //
    // Nothing is lost by asking in this order. A SCHEDULE EXISTS ONLY BECAUSE AN ATTEMPT ALREADY
    // FAILED, so a device that reaches this line has already answered both questions below at least
    // once -- it held a pack that needed a word list, and it did not have one. And a schedule cannot
    // coexist with a populated cache: the cache is written only by a fetch that succeeded, and that
    // same fetch clears the schedule on its way out. Were one ever left behind, the timer armed
    // below is the recovery, and the wait is capped at 60 seconds.
    const scheduled = readDictRetry() ?? scheduleRef.current
    if (scheduled !== null && !mayAttempt(scheduled, now)) {
      // ABSENT, not left at 'loading'. A schedule exists only because an attempt already failed, so
      // this is not the "we have not looked yet" window the initial state describes -- it is "we
      // looked, it is not here, and we are waiting before asking again", which is exactly what the
      // player can act on by getting online.
      publish({ status: 'absent', words: null })
      arm(scheduled.nextAt)
      return
    }

    // STORAGE SAYING NOTHING IS NOT STORAGE SAYING NO, which is the whole of the first clause.
    // `somethingNeedsIt` scans the packs ON THE DEVICE, and PuzzleFrame deliberately plays a pack it
    // could not store: it reads `readPack(date) ?? fetched`, because storage.ts swallows write
    // failures and trusting the re-read alone would answer a successful fetch with "That puzzle
    // isn't here". So on a device with blocked cookies, an exhausted quota or a partitioned context,
    // a Phrazle deep link mounts a board while `cachedPackDates()` is empty forever -- and this
    // function used to return here without publishing anything, leaving `status` at 'loading' for
    // the life of the tab. The frame's "Getting this puzzle ready…" was then permanent, no request
    // was ever made, and neither `lull:storage` nor `online` could shake it loose. Before the
    // dictionary existed the same device at least got a board.
    //
    // PACKS FIRST IS INTACT. An empty index means we have been told nothing, so we ask; an index
    // with packs in it that need no dictionary is a real answer, and it is still honored. The cost
    // is the one request a first-ever open makes before its first pack lands, and the beneficiary is
    // every device that cannot keep one.
    if (cachedPackDates().length > 0 && !somethingNeedsIt()) return

    inFlight.current = true
    try {
      const cached = await readCachedDictionary()
      if (cached !== null) {
        publish({ status: 'ready', words: cached })
        return
      }

      // NOTHING IS PUBLISHED HERE, and the `publish({ status: 'loading', words: null })` that used
      // to sit on this line is gone rather than guarded. `run` returns above if the status is
      // 'ready', and `inFlight` is already set, so by the time control reaches here the status is
      // either 'loading' -- where the publish was an Object.is no-op -- or 'absent', where it was a
      // visible demotion: a player parked on "Phrazle needs a one-time download" watched it flip to
      // "Getting this puzzle ready…" and back on every retry, as often as once a minute, and the
      // whole tree re-rendered twice for it. A guard whose false arm is unreachable would just be
      // the same dead line with an `if` in front of it.
      const words = await fetchDictionary(now, random)
      if (words === null) {
        publish({ status: 'absent', words: null })
        // The schedule fetchDictionary just persisted is what says WHEN to try again, and a device
        // that cannot store one -- quota, blocked cookies, a partitioned context -- computes the
        // same schedule here and keeps it in memory instead. NOT A TIMER FROM THE CURRENT INSTANT:
        // `scheduleRetry` counts the attempt on from the last one this session made, so the wait
        // grows exactly as it does on a device with storage and caps at 60 seconds with full jitter.
        //
        // Leaving it unscheduled was the alternative and it was worse than it read. The four signals
        // "bringing it back" include STORAGE_EVENT, which fires on every move a player makes on any
        // board, so no schedule meant a fresh request per keystroke -- no backoff at all, against a
        // route throttled at 2 requests per second across all callers.
        //
        // AND THE STORED RECORD IS TAKEN ONLY IF IT IS A WAIT. `readDictRetry() ?? scheduleRetry(…)`
        // assumed the value read back was the one `fetchDictionary` had just written, which is true
        // exactly when the write worked -- and this branch exists for the device where it did not.
        // There, the read answered with an EARLIER SESSION'S record, whose `nextAt` is in the past,
        // so `arm` computed `Math.max(0, past - now)` = 0, the timer fired at once, `mayAttempt`
        // said yes, the request failed, and the same stale record was read again: 11 requests in 10
        // milliseconds, unbounded, against the route the in-memory schedule below exists to spare.
        // The same line let a clock-skewed far-future `nextAt` through, where setTimeout's overflow
        // clamps the wait to about a millisecond.
        //
        // `mayAttempt` is the one function that knows what a legitimate wait looks like -- not yet
        // due, and not further out than the cap -- so a stored record that is still a wait is
        // honored and anything else is recomputed from this session's own count.
        const stored = readDictRetry()
        const next =
          stored !== null && !mayAttempt(stored, now) ? stored : scheduleRetry(scheduleRef.current, now, random)
        scheduleRef.current = next
        arm(next.nextAt)
        return
      }
      // fetchDictionary cleared the stored schedule on its way out; this is the same clearing for
      // the copy that was never stored.
      scheduleRef.current = null
      publish({ status: 'ready', words })
    } finally {
      // IN A FINALLY, on every path. This is what makes the 35-second timeout in the service worth
      // having at all: without it a hang behind a captive portal would leave this ref set and block
      // every retry for the rest of the session, defeating the backoff the whole design is built
      // around.
      inFlight.current = false
    }
  }, [arm, now, publish, random])

  useEffect(() => {
    alive.current = true
    runRef.current = () => void run()
    void run()

    // THE SAME FOUR SIGNALS THE SHELF LISTENS TO. STORAGE_EVENT is the one that matters most and is
    // the one usePrefetch does not have: it is what tells this provider that a pack just landed, so
    // the request goes out moments after the first pack containing a Phrazle is written rather than
    // on the next app open.
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void run()
    }
    const onRun = (): void => void run()

    window.addEventListener(STORAGE_EVENT, onRun)
    window.addEventListener('online', onRun)
    window.addEventListener('appinstalled', onRun)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      // FIRST, and before the timer is cleared: a request still open at this moment settles after
      // this callback has finished, and `alive` is what stops it publishing into a dead tree and
      // then arming a timeout nothing will ever clear.
      alive.current = false
      if (timer.current !== null) clearTimeout(timer.current)
      window.removeEventListener(STORAGE_EVENT, onRun)
      window.removeEventListener('online', onRun)
      window.removeEventListener('appinstalled', onRun)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [run])

  return <DictionaryContext.Provider value={state}>{children}</DictionaryContext.Provider>
}
