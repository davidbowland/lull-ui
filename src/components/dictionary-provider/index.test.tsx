import { act, render, screen } from '@testing-library/react'
import React from 'react'

import { DictionaryProvider, useDictionary } from './index'
import { writeDictRetry, writePack, writeProgress } from '@services/storage'
import { goFigurePuzzle, pack, packDate, phrazlePack, phrazlePuzzleId } from '@test/__mocks__'

// A probe rather than an assertion on internals: the provider publishes two facts and this is the
// only way to read them the way a consumer does.
const Probe = (): React.ReactNode => {
  const { status, words } = useDictionary()
  return <p>{`${status}:${words === null ? 'none' : words.size}`}</p>
}

// The same probe with its renders counted, for the one test that is about how often a consumer is
// disturbed rather than about what it reads. It calls the hook itself: a component that merely sits
// UNDER a consumer is not re-rendered when the context changes, because the provider hands `children`
// back by identity, so a counter placed there would read 1 however many values were published.
const CountedProbe = ({ onRender }: { onRender: () => void }): React.ReactNode => {
  const { status, words } = useDictionary()
  onRender()
  return <p>{`${status}:${words === null ? 'none' : words.size}`}</p>
}

// A Response shaped exactly as far as the service reads it, because jsdom has no Response at all.
// The clone carries its own body, which is what cache.put is handed on the paths that have a cache.
//
// ONE-SHOT AND clone()-THROWS-ONCE-DRAINED, matching the stub in services/dictionary.test.ts and
// matching the real thing. Neither behavior is decoration: a permissive clone let a real ordering
// bug ship, because `Response.prototype.clone` raises `TypeError: Body has already been consumed`
// rather than returning a stale copy, and a stub that does not do that is a stub that certifies the
// one mistake this code can make. See the longer note on the sibling stub.
const okResponse = (body: string): { clone: () => unknown; ok: boolean; text: () => Promise<string> } => {
  let read = false
  return {
    clone: () => {
      if (read) throw new TypeError('Response.clone: Body has already been consumed.')
      return okResponse(body)
    },
    ok: true,
    text: () => {
      const alreadyRead = read
      read = true
      return alreadyRead ? Promise.reject(new Error('body already read')) : Promise.resolve(body)
    },
  }
}

describe('DictionaryProvider', () => {
  // The provider schedules a retry with setTimeout, so the clock is fake for the whole file and
  // real again afterwards. Left running, a fake clock poisons every suite that follows.
  beforeAll(() => {
    jest.useFakeTimers()
    console.error = jest.fn()
  })

  afterAll(() => {
    jest.useRealTimers()
    delete (globalThis as { caches?: unknown }).caches
    delete (globalThis as { fetch?: unknown }).fetch
    delete (AbortSignal as unknown as { timeout?: unknown }).timeout
  })

  // Every global this reaches through is absent under jsdom. Installed per test and explicitly,
  // never in a beforeEach.
  //
  // NO CACHE API AT ALL HERE, deliberately: this file is about the provider's REQUEST behavior --
  // when it asks, how often, and when it asks again -- and a cache hit would short-circuit every
  // one of those. `delete` rather than an assignment, because `typeof caches === 'undefined'` is
  // what the service checks, and it is undone in the shared afterAll.
  const setup = (): jest.Mock => {
    window.localStorage.clear()
    const fetchSpy = jest.fn()
    Object.assign(globalThis, { fetch: fetchSpy })
    delete (globalThis as { caches?: unknown }).caches
    Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: jest.fn(), writable: true })
    return fetchSpy
  }

  // The render result is handed back for the one test that takes the tree down mid-request. Every
  // other caller ignores it.
  const mountWith = async (now: () => number): Promise<ReturnType<typeof render>> => {
    let view!: ReturnType<typeof render>
    await act(async () => {
      view = render(
        <DictionaryProvider now={now} random={() => 0.5}>
          <Probe />
        </DictionaryProvider>,
      )
    })
    return view
  }

  const mount = async (): Promise<ReturnType<typeof render>> => mountWith(() => 1_000)

  // PACKS FIRST, DICTIONARY LAST. No pack that needs one, no request -- which is what keeps a
  // player who never opens a Phrazle from paying ~123KB for one.
  //
  // It reads `loading` rather than `absent` and that is unobservable rather than wrong: nothing on
  // this device consults the status at all, because both surfaces read it only under
  // `entry.needsDictionary`. Asserted so the state a device in this shape actually sits in is
  // written down somewhere.
  it('asks for nothing when no pack on the device needs a dictionary', async () => {
    const fetchSpy = setup()
    writePack(packDate, pack)

    await mount()

    expect(screen.getByText('loading:none')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  // The registry is asked, never a type literal, so a type this build has never heard of answers
  // "no" rather than throwing on an undefined entry -- a pack is JSON off the network and lull-api
  // can ship a generator before the UI that draws it.
  it('asks for nothing about a type this build has never heard of', async () => {
    const fetchSpy = setup()
    writePack(packDate, { ...pack, puzzles: [{ ...goFigurePuzzle, type: 'crossword' as typeof goFigurePuzzle.type }] })

    await mount()

    expect(screen.getByText('loading:none')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  // cachedPackDates derives its index from the KEYS, so a key whose value will not validate is
  // listed until something reads it -- and readPack answers null. The pack below is written under
  // a date its own body disagrees with, which is exactly what isValidPack rejects.
  it('asks for nothing about a pack key it cannot read', async () => {
    const fetchSpy = setup()
    writePack('2026-08-19', phrazlePack)

    await mount()

    expect(screen.getByText('loading:none')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('asks once when a pack on the device holds a Phrazle', async () => {
    const fetchSpy = setup()
    writePack(packDate, phrazlePack)
    fetchSpy.mockResolvedValueOnce(okResponse('HOLD\nHOT\nTOE\n'))

    await mount()

    expect(screen.getByText('ready:3')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  // A DEVICE THAT CANNOT KEEP A PACK STILL GETS A WORD LIST. `somethingNeedsIt` scans the cached
  // packs, and PuzzleFrame deliberately plays a pack it could not store -- `readPack(date) ??
  // fetched`, because storage.ts swallows write failures and trusting the re-read alone would answer
  // a successful fetch with "That puzzle isn't here". So on blocked cookies, an exhausted quota or a
  // partitioned context, a Phrazle deep link mounted a board while the pack index stayed empty
  // forever: the provider returned before publishing anything, `status` sat at 'loading' for the
  // life of the tab, and the frame said "Getting this puzzle ready…" with no request ever made and
  // nothing -- not `lull:storage`, not `online` -- able to shake it loose.
  //
  // An empty index is storage telling us NOTHING, which is not storage telling us no. An index with
  // packs in it that need no dictionary is a real answer and is still honored, which is what the
  // three rows above assert.
  //
  // REDDENS ON: `if (!somethingNeedsIt()) return` -- the probe reads loading:none and no request is
  // ever made.
  it('asks on a device that cannot store a pack at all', async () => {
    const fetchSpy = setup()
    fetchSpy.mockResolvedValueOnce(okResponse('HOLD\n'))

    await mount()

    expect(screen.getByText('ready:1')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  // The signal usePrefetch does not have, and the one that matters most: a pack landing seconds
  // after mount is what makes this "packs first" rather than "next app open".
  //
  // THE DEVICE STARTS WITH A PACK THAT NEEDS NOTHING, rather than with empty storage, and that is
  // load-bearing rather than arrangement: an empty index now means "we have been told nothing" and
  // asks, so a mount on empty storage would fetch before the event under test ever fired. A pack
  // already on the device that needs no word list is the real "no" this test needs the provider to
  // be sitting on.
  it('asks as soon as a pack that needs one lands', async () => {
    const fetchSpy = setup()
    writePack(packDate, pack)
    fetchSpy.mockResolvedValueOnce(okResponse('HOLD\n'))

    await mount()
    expect(fetchSpy).not.toHaveBeenCalled()

    await act(async () => {
      writePack(packDate, phrazlePack)
    })

    expect(screen.getByText('ready:1')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  // `online` fires on every transition and a flapping connection fires it for minutes, which is
  // exactly why usePrefetch carries the same ref. Two triggers, one request.
  //
  // THE REQUEST IS HELD OPEN, and that is what makes this a test of the guard rather than of the
  // event plumbing. Dispatching the two events in the same act() as the mount proves nothing: React
  // flushes a passive effect at the END of the outermost act, so the listeners are not attached yet
  // and the guard is never consulted -- that version passed with `inFlight` deleted.
  it('asks once across two rapid triggers', async () => {
    const fetchSpy = setup()
    writePack(packDate, phrazlePack)
    let settle: (response: unknown) => void = () => undefined
    fetchSpy.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve
      }),
    )

    await mount()

    expect(screen.getByText('loading:none')).toBeInTheDocument()

    await act(async () => {
      window.dispatchEvent(new Event('online'))
      window.dispatchEvent(new Event('online'))
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)

    await act(async () => {
      settle(okResponse('HOLD\n'))
    })

    expect(screen.getByText('ready:1')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  // A schedule outlives the tab it was written in, which is the difference between backoff and a
  // delay: a device that closed the app mid-wait does not restart at zero on reopen.
  //
  // THE SECOND HALF IS THE READY GUARD, NOT THE clearTimeout, and this comment used to say the
  // opposite. The mount arms a timeout for the deadline; the reconnect two seconds later arms it
  // again, two seconds nearer; the nearer one fires and succeeds. Deleting `arm`'s `clearTimeout`
  // leaves the further-out timeout pending, and when it fires `run` returns at
  // `statusRef.current === 'ready'` -- so the request count stays at one either way, which was
  // measured rather than assumed. What the last two lines pin is that a timer firing after the word
  // list is in hand asks for nothing.
  //
  // A pending-timer count could not say it either way: `await act` schedules a timer of its own, so
  // the number moves whatever the provider does.
  it('waits out a backoff a previous session stored, and asks nothing more once it succeeds', async () => {
    const fetchSpy = setup()
    writePack(packDate, phrazlePack)
    writeDictRetry({ attempt: 1, nextAt: 5_000 })
    fetchSpy.mockResolvedValue(okResponse('HOLD\n'))
    const clock = { value: 1_000 }

    await mountWith(() => clock.value)

    expect(screen.getByText('absent:none')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()

    clock.value = 3_000
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })

    expect(fetchSpy).not.toHaveBeenCalled()

    clock.value = 5_000
    await act(async () => {
      jest.advanceTimersByTime(2_000)
    })

    expect(screen.getByText('ready:1')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    await act(async () => {
      jest.advanceTimersByTime(2_000)
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  // THE BRANCH THE WHOLE DESIGN EXISTS FOR, end to end. scheduleRetry(null, () => 1_000, () => 0.5)
  // is { attempt: 1, nextAt: 1500 }, so the wait is 500ms exactly -- a literal, never arithmetic
  // against a wall clock. The clock is moved by hand for the same reason: the schedule is consulted
  // again on the second attempt, so a frozen clock would block the retry it is meant to allow.
  it('tries again once the backoff has elapsed, and not before', async () => {
    const fetchSpy = setup()
    writePack(packDate, phrazlePack)
    fetchSpy.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce(okResponse('HOLD\n'))
    const clock = { value: 1_000 }

    await mountWith(() => clock.value)

    expect(screen.getByText('absent:none')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    await act(async () => {
      clock.value = 1_499
      jest.advanceTimersByTime(499)
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)

    await act(async () => {
      clock.value = 1_500
      jest.advanceTimersByTime(1)
    })

    expect(screen.getByText('ready:1')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  // A DEVICE THAT CANNOT STORE THE SCHEDULE STILL HONORS IT, in memory, for the session. This used
  // to arm no timer at all and argue that the four signals would bring the request back -- and one
  // of those four is STORAGE_EVENT, which fires on every single move a player makes, because
  // writeProgress announces even when the write itself threw. So on a device whose localStorage is
  // full -- packs already written, `lull:dict:retry` a NEW key that cannot be added -- every
  // keystroke on any board found no schedule, `mayAttempt(null)` answered true, and a fresh request
  // went out against a route throttled at 2 requests per second across ALL callers. No timer meant
  // no backoff rather than a safe one.
  //
  // The wait is a literal, never arithmetic against a wall clock: scheduleRetry(null, () => 1_000,
  // () => 0.5) is { attempt: 1, nextAt: 1500 }, so 500ms exactly -- the same schedule the device
  // would have stored, computed here instead.
  //
  // REDDENS ON: arming only from `readDictRetry()` again -- the writes take the request count from 1
  // to 2, and the retry at the end never fires at all. Two rather than four because the second and
  // third writes land while the first re-entry is still in flight and are turned away by that guard,
  // which is the only thing standing between this device and a request per keystroke.
  it('honors a backoff it could not store when a player writes progress', async () => {
    const fetchSpy = setup()
    writePack(packDate, phrazlePack)
    fetchSpy.mockResolvedValue({ ok: false })
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    const clock = { value: 1_000 }

    await mountWith(() => clock.value)

    expect(screen.getByText('absent:none')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    await act(async () => {
      writeProgress(phrazlePuzzleId, 'A')
      writeProgress(phrazlePuzzleId, 'AB')
      writeProgress(phrazlePuzzleId, 'ABC')
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)

    clock.value = 1_500
    await act(async () => {
      jest.advanceTimersByTime(500)
    })

    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  // A STORED SCHEDULE IS TAKEN ONLY IF IT IS STILL A WAIT, and both rows are a device that cannot
  // write one. `readDictRetry() ?? scheduleRetry(…)` assumed the record read back was the one
  // `fetchDictionary` had just written -- true exactly when the write worked, and this branch exists
  // for the device where it did not. What comes back instead is an EARLIER SESSION'S record, and the
  // two ways that record can be useless are the two rows here.
  //
  //   an overdue one -- `nextAt` in the past, so `arm` computed `Math.max(0, past - now)` = 0, the
  //     timer fired at once, `mayAttempt` said yes, the request failed, and the same record was read
  //     again. Measured at 11 requests in 10 simulated milliseconds, unbounded, against a route
  //     throttled at 2 per second across ALL callers -- which is the exact failure the in-memory
  //     schedule was written to prevent.
  //   a clock-skewed one -- `nextAt` ten years out, which `mayAttempt` already treats as no schedule
  //     because `scheduleRetry` cannot produce one; armed as a timeout it overflows and a browser
  //     clamps the wait to about a millisecond.
  //
  // Both rows assert the same two things, because the fix is one expression: the wait is the 500ms
  // this session's own count produces, not zero and not a decade. scheduleRetry(null, () => 1_000,
  // () => 0.5) is { attempt: 1, nextAt: 1500 }, so 500ms exactly -- a literal, never arithmetic
  // against a wall clock.
  //
  // REDDENS ON: `readDictRetry() ?? scheduleRetry(…)`. The overdue row fails the first assertion at
  // two requests; the skewed row fails the last at one.
  it.each<[string, number]>([
    ['is already overdue', 500],
    ['was written against a clock ten years fast', 316_000_000_000],
  ])('recomputes a wait it could not store when the one on disk %s', async (_description, nextAt) => {
    const fetchSpy = setup()
    writePack(packDate, phrazlePack)
    writeDictRetry({ attempt: 1, nextAt })
    fetchSpy.mockResolvedValue({ ok: false })
    // AFTER the two writes above, so the record this test is about is genuinely on disk and every
    // write the provider itself attempts fails -- which is the device the branch is for.
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    const clock = { value: 1_000 }

    await mountWith(() => clock.value)

    expect(screen.getByText('absent:none')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    await act(async () => {
      jest.advanceTimersByTime(1)
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)

    clock.value = 1_500
    await act(async () => {
      jest.advanceTimersByTime(499)
    })

    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  // A PROVIDER THAT HAS BEEN UNMOUNTED ASKS FOR NOTHING. `run` is async and held no cancellation
  // token, so a request settling after the tree came down published into a dead tree and then ARMED
  // -- setting `timer.current` after the only code that would clear it had already run. That timer
  // called `runRef.current()`, the attempt failed, and it armed again: measured at five further real
  // requests over five simulated minutes, with nothing left on screen.
  //
  // IT IS REACHABLE IN PRODUCTION. This provider sits INSIDE ErrorBoundary in _app.tsx -- on purpose,
  // so nothing above the boundary can throw with nothing to catch it -- so any render throw anywhere
  // in the app unmounts it while a request is open.
  //
  // The request is held open across the unmount rather than settled before it, because that is the
  // whole shape of the defect: a resolution with no tree under it.
  //
  // REDDENS ON: dropping the `alive` guard from `arm` (the timer is set and fires, reading two);
  // dropping it from `publish` as well adds React's warning about setting state on an unmounted
  // provider.
  it('stops asking once the tree it belongs to has gone', async () => {
    const fetchSpy = setup()
    writePack(packDate, phrazlePack)
    let settle: (response: unknown) => void = () => undefined
    fetchSpy.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve
      }),
    )
    const clock = { value: 1_000 }

    const view = await mountWith(() => clock.value)

    expect(fetchSpy).toHaveBeenCalledTimes(1)

    view.unmount()
    await act(async () => {
      settle({ ok: false })
    })

    clock.value = 301_000
    await act(async () => {
      jest.advanceTimersByTime(300_000)
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  // A RETRY IS NOT A COLD OPEN, and this is what the unconditional `publish({ status: 'loading' })`
  // before each request cost. The status a device with no word list sits in is 'absent' -- "we
  // looked, it is not here, get online" -- and every retry demoted it to 'loading' and back, so a
  // player parked on "Phrazle needs a one-time download" watched it flip to "Getting this puzzle
  // ready…" and back as often as once a minute, with the whole tree re-rendered twice for it.
  //
  // The second request never settles, so the window this test is about stays open for the
  // assertion rather than closing before it can be read.
  //
  // REDDENS ON: putting `publish({ status: 'loading', words: null })` back above the fetch -- the
  // probe then reads loading:none while the retry is in flight.
  it('leaves a player on "not here" while it retries rather than flipping them back to "still looking"', async () => {
    const fetchSpy = setup()
    writePack(packDate, phrazlePack)
    fetchSpy.mockResolvedValueOnce({ ok: false })
    fetchSpy.mockReturnValueOnce(new Promise(() => undefined))
    const clock = { value: 1_000 }

    await mountWith(() => clock.value)

    expect(screen.getByText('absent:none')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    clock.value = 1_500
    await act(async () => {
      jest.advanceTimersByTime(500)
    })

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(screen.getByText('absent:none')).toBeInTheDocument()
  })

  // A PUBLISH IS NEWS, NOT A HEARTBEAT, and this is the common shape of the failure above: absent,
  // with a schedule that is not due yet. Every STORAGE_EVENT re-entered `run`, opened the Cache API
  // -- a cross-process call -- and published { status: 'absent', words: null } all over again: the
  // same two facts under a new object identity, which is a change to React and re-renders every
  // consumer in the app, PuzzleFrame and every ShelfRow, on every keystroke of whatever board the
  // player happens to be on.
  //
  // The probe counts its OWN renders, which is what a consumer feels, and it consumes the context
  // itself rather than sitting under something that does -- a child of the provider whose element
  // identity never changes is not re-rendered at all, so a counter there would read 1 forever and
  // prove nothing.
  //
  // REDDENS ON: publishing unconditionally (the render count reads 3 -- the three writes are one
  // act, so React batches what would be three renders into one); moving the schedule check back
  // below the cache read (caches.open reads 2). Both verified.
  it('publishes nothing and opens no cache while it waits out a backoff', async () => {
    const fetchSpy = setup()
    writePack(packDate, phrazlePack)
    writeDictRetry({ attempt: 1, nextAt: 5_000 })
    const opened = jest.fn(() => Promise.resolve({ match: () => Promise.resolve(undefined) }))
    Object.assign(globalThis, { caches: { open: opened } })
    const rendered = jest.fn()

    await act(async () => {
      render(
        <DictionaryProvider now={() => 1_000} random={() => 0.5}>
          <CountedProbe onRender={rendered} />
        </DictionaryProvider>,
      )
    })

    // One render for the mount and one for the publish that moves `loading` to `absent`. That
    // publish is real news and this test is not about suppressing it.
    expect(screen.getByText('absent:none')).toBeInTheDocument()
    expect(rendered).toHaveBeenCalledTimes(2)

    await act(async () => {
      writeProgress(phrazlePuzzleId, 'A')
      writeProgress(phrazlePuzzleId, 'AB')
      writeProgress(phrazlePuzzleId, 'ABC')
    })

    expect(rendered).toHaveBeenCalledTimes(2)
    expect(opened).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  // Resume, not merely visibility: an installed app keeps its JS context across days, so the
  // morning after a failed night there is no remount, no `online`, and no `appinstalled`.
  it('asks again when the app comes back to the front, and not while it is hidden', async () => {
    const fetchSpy = setup()
    writePack(packDate, phrazlePack)
    writeDictRetry({ attempt: 1, nextAt: 5_000 })
    fetchSpy.mockResolvedValue(okResponse('HOLD\n'))
    const clock = { value: 1_000 }
    const setVisibility = (value: string): void => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value, writable: true })
    }

    await mountWith(() => clock.value)

    expect(fetchSpy).not.toHaveBeenCalled()

    clock.value = 5_000
    setVisibility('hidden')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(fetchSpy).not.toHaveBeenCalled()

    setVisibility('visible')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(screen.getByText('ready:1')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  // The listener list is four long and this is the fourth. An install is the moment the whole
  // offline premise engages, so it is also a moment to ask for the one thing the pack does not
  // carry.
  //
  // The key is written RAW rather than through writePack, and that is the only way this event can
  // be observed at all: writePack announces, the provider listens for STORAGE_EVENT, and the
  // request would go out before `appinstalled` was ever dispatched -- so the test would pass with
  // the listener deleted.
  //
  // A pack that needs nothing is on the device first, for the same reason the test above has one:
  // mounting on empty storage now asks, and the listener would again be unpinned.
  it('asks when the app is installed', async () => {
    const fetchSpy = setup()
    writePack(packDate, pack)
    fetchSpy.mockResolvedValue(okResponse('HOLD\n'))

    await mount()

    expect(fetchSpy).not.toHaveBeenCalled()

    window.localStorage.setItem(`lull:pack:${packDate}`, JSON.stringify(phrazlePack))
    await act(async () => {
      window.dispatchEvent(new Event('appinstalled'))
    })

    expect(screen.getByText('ready:1')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  // A SET IN HAND IS NEVER GIVEN UP, and this is the defect that made the guard worth writing.
  // STORAGE_EVENT is one of the four signals, and every move a player makes announces on it:
  // writeProgress, writeHints and markSolved all do. On a device with no usable Cache API -- and
  // this suite deletes it, which is what a non-secure context and Firefox private browsing look
  // like -- the re-entry found no cached copy, dropped the status to `loading` and asked again. The
  // frame gates on status, so the board the player was in the middle of was replaced by the
  // dead-end panel on their first move, taking any progress not yet written with it. Offline, the
  // second request failed and the board stayed gone for the rest of the session.
  //
  // The second response never settles, so a demotion cannot be quietly undone before the assertions
  // run.
  //
  // REDDENS ON: deleting `if (statusRef.current === 'ready') return` from run() -- the probe then
  // reads loading:none and the request count is 2.
  it('holds on to a word list it already has when a player writes progress', async () => {
    const fetchSpy = setup()
    writePack(packDate, phrazlePack)
    fetchSpy.mockResolvedValueOnce(okResponse('HOLD\n'))
    fetchSpy.mockReturnValue(new Promise(() => undefined))

    await mount()

    expect(screen.getByText('ready:1')).toBeInTheDocument()

    await act(async () => {
      writeProgress(phrazlePuzzleId, 'HOLD')
    })

    expect(screen.getByText('ready:1')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  // WHAT _app.tsx MOUNTS: no props but children. The clock and the randomness are injected because
  // CLAUDE.md requires it, and their defaults are the production values -- so one test drives the
  // shape the app actually ships. Both feed backoff alone, and there is no backoff on a request that
  // succeeds, so nothing here depends on either.
  it('runs with no clock and no randomness handed to it', async () => {
    const fetchSpy = setup()
    writePack(packDate, phrazlePack)
    fetchSpy.mockResolvedValueOnce(okResponse('HOLD\n'))

    await act(async () => {
      render(
        <DictionaryProvider>
          <Probe />
        </DictionaryProvider>,
      )
    })

    expect(screen.getByText('ready:1')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  // The cache is what makes this a ONE-TIME download, and the provider's own branch for it is
  // "answer and ask nothing". Its own describe, with its own globals, because every test above
  // deletes the Cache API on purpose so that a hit cannot short-circuit a request assertion.
  describe('with a word list already in the cache', () => {
    it('answers from the cache without asking the network', async () => {
      const fetchSpy = setup()
      writePack(packDate, phrazlePack)
      Object.assign(globalThis, {
        caches: {
          open: () => Promise.resolve({ match: () => Promise.resolve({ text: () => Promise.resolve('HOLD\nHOT\n') }) }),
        },
      })

      await mount()

      expect(screen.getByText('ready:2')).toBeInTheDocument()
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    // THE FIRST PAINTED FRAME OF A COLD OPEN, which is the one the shell used to lie on. The Cache
    // API is cross-process and this read is followed by a 123KB body and a 51,852-entry Set build,
    // so it settles on a task rather than a microtask -- while the pack the frame and the shelf read
    // comes straight out of localStorage and is on screen first. The stub holds `caches.open` open
    // to make that ordering explicit rather than incidental.
    //
    // REDDENS ON: the provider's useState initial value put back to { status: 'absent', words: null }
    // -- the first assertion then reads absent:none, which is the state both surfaces turn into a
    // sentence telling a player with the word list already downloaded to reconnect.
    it('says it is still looking until the cache has answered', async () => {
      const fetchSpy = setup()
      writePack(packDate, phrazlePack)
      let answer: (cache: unknown) => void = () => undefined
      Object.assign(globalThis, {
        caches: {
          open: () =>
            new Promise((resolve) => {
              answer = resolve
            }),
        },
      })

      render(
        <DictionaryProvider now={() => 1_000} random={() => 0.5}>
          <Probe />
        </DictionaryProvider>,
      )

      expect(screen.getByText('loading:none')).toBeInTheDocument()

      await act(async () => {
        answer({ match: () => Promise.resolve({ text: () => Promise.resolve('HOLD\nHOT\n') }) })
      })

      expect(screen.getByText('ready:2')).toBeInTheDocument()
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })
})
