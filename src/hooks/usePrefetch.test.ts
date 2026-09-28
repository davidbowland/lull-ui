import { act, renderHook } from '@testing-library/react'

import { keepThisSession, packsToKeep, usePrefetch } from './usePrefetch'
import { fetchPack } from '@services/lull'
import {
  cachedPackDates,
  markSolved,
  readHints,
  readMeta,
  readPack,
  readProgress,
  writeHints,
  writePack,
  writeProgress,
} from '@services/storage'
import { incompletePack, pack } from '@test/__mocks__'

// jsdom reports navigator.onLine === true, so an unmocked hook fires real axios
// requests against a 35-second timeout.
jest.mock('@services/lull')

// A pack's own `date` must match the key it is stored under -- readPack rejects a
// mismatch as corrupt, which is what stops a poisoned entry crashing every load. The ids
// carry the date too, so solving one day's puzzles finishes that day and no other.
const packFor = (date: string) => ({
  ...pack,
  date,
  puzzles: pack.puzzles.map((puzzle) => ({ ...puzzle, id: `${date}:${puzzle.type}:${puzzle.id.split(':')[2]}` })),
})

const partialPackFor = (date: string) => ({ ...incompletePack, date })

const store = (...dates: string[]): void => dates.forEach((date) => writePack(date, packFor(date)))

const finish = (...dates: string[]): void =>
  dates.forEach((date) => {
    writePack(date, packFor(date))
    packFor(date).puzzles.forEach((puzzle) => markSolved(puzzle.id))
  })

// Today and the six days before it, none of them finished.
const WEEK = ['2026-08-18', '2026-08-17', '2026-08-16', '2026-08-15', '2026-08-14', '2026-08-13', '2026-08-12']

describe('packsToKeep', () => {
  const TODAY = '2026-08-18'

  const keptFrom = (keep: ReadonlySet<string> = new Set()): string[] =>
    [...packsToKeep(cachedPackDates(), TODAY, new Set(readMeta().solved), keep)].toSorted()

  const setup = (): void => {
    window.localStorage.clear()
  }

  it('keeps every pack when there are seven or fewer', () => {
    setup()
    store(...WEEK)

    expect(keptFrom()).toEqual(WEEK.toSorted())
  })

  it('drops the oldest of eight unfinished days', () => {
    setup()
    store(...WEEK, '2026-08-11')

    expect(keptFrom()).toEqual(WEEK.toSorted())
  })

  // AGE IS NOT THE RULE. Three March days fetched for a flight outrank six finished August days,
  // however much newer the August days are.
  it('keeps unfinished days ahead of newer finished ones', () => {
    setup()
    store(TODAY, '2026-03-14', '2026-03-15', '2026-03-16')
    finish('2026-08-17', '2026-08-16', '2026-08-15', '2026-08-14', '2026-08-13', '2026-08-12')

    expect(keptFrom()).toEqual([
      '2026-03-14',
      '2026-03-15',
      '2026-03-16',
      '2026-08-15',
      '2026-08-16',
      '2026-08-17',
      '2026-08-18',
    ])
  })

  // THE PLANE. Ten March days fetched the night before; the next open prunes before anyone plays one.
  it('keeps the newest unfinished days when more were fetched than fit', () => {
    setup()
    store(TODAY)
    store(...Array.from({ length: 10 }, (_, index) => `2026-03-${String(index + 10).padStart(2, '0')}`))

    expect(keptFrom()).toEqual([
      '2026-03-14',
      '2026-03-15',
      '2026-03-16',
      '2026-03-17',
      '2026-03-18',
      '2026-03-19',
      '2026-08-18',
    ])
  })

  // The day the shelf shows by default. Collecting it would move the plate under a player who pressed
  // nothing, and the next run() would fetch today again only to collect it again.
  it('keeps today even when it is finished and seven older days are not', () => {
    setup()
    finish(TODAY)
    store('2026-08-17', '2026-08-16', '2026-08-15', '2026-08-14', '2026-08-13', '2026-08-12', '2026-08-11')

    expect(keptFrom()).toContain(TODAY)
    expect(keptFrom()).toHaveLength(7)
  })

  it('keeps the newest pack when today has not arrived', () => {
    setup()
    finish('2026-08-17')
    store('2026-08-16', '2026-08-15', '2026-08-14', '2026-08-13', '2026-08-12', '2026-08-11', '2026-08-10')

    expect(keptFrom()).toContain('2026-08-17')
  })

  it('keeps a pack dated after today', () => {
    setup()
    store(...WEEK, '2026-08-11', '2026-08-19')

    expect(keptFrom()).toContain('2026-08-19')
  })

  it('keeps a day it is told to keep, whatever its rank', () => {
    setup()
    store(...WEEK)
    finish('2026-02-01')

    expect(keptFrom(new Set(['2026-02-01']))).toContain('2026-02-01')
  })
})

describe('usePrefetch', () => {
  const mockFetchPack = jest.mocked(fetchPack)

  // 2026-08-18T10:00:00Z. Tests run under TZ=UTC, so this is the local date the hook
  // derives and the only date it ever asks for.
  const morning = () => Date.UTC(2026, 7, 18, 10)

  const setup = (): void => {
    window.localStorage.clear()
    mockFetchPack.mockResolvedValue(pack)
  }

  const goOffline = (): void => {
    jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
  }

  const deferred = (): { promise: Promise<any>; resolve: () => void } => {
    let resolve: () => void = () => undefined
    const promise = new Promise<any>((settle) => {
      resolve = () => settle(pack)
    })
    return { promise, resolve }
  }

  const renderPrefetch = async () => {
    const rendered = renderHook(() => usePrefetch(morning))
    await act(async () => undefined)
    return rendered
  }

  beforeAll(() => {
    console.error = jest.fn()
  })

  describe('fetching', () => {
    // One date, the local one. Not a window, not a staged tomorrow, and not conditional
    // on whether the app is installed.
    it("asks for today's pack and nothing else", async () => {
      setup()

      await renderPrefetch()

      expect(mockFetchPack).toHaveBeenCalledTimes(1)
      expect(mockFetchPack).toHaveBeenCalledWith('2026-08-18')
    })

    // THE BUG THIS FUNCTION WAS ADDED FOR. A day cached while the generator was still filling it
    // stays partial forever: nothing else in the app re-asks for a date already on the device --
    // selectDay renders the cached pack and the month list only fetches a day it does NOT hold --
    // so 2026-09-05 sat at two of sixteen puzzles until localStorage was cleared by hand.
    it('re-asks for a cached pack that is still incomplete', async () => {
      setup()
      writePack('2026-08-16', partialPackFor('2026-08-16'))

      await renderPrefetch()

      expect(mockFetchPack).toHaveBeenCalledWith('2026-08-16')
    })

    // The other half, and the one that keeps the cost at one request on an ordinary day: a complete
    // pack never changes, so a device holding a week of finished days asks for today and nothing
    // else.
    it('leaves a complete cached pack alone', async () => {
      setup()
      writePack('2026-08-16', packFor('2026-08-16'))

      await renderPrefetch()

      expect(mockFetchPack).toHaveBeenCalledTimes(1)
      expect(mockFetchPack).toHaveBeenCalledWith('2026-08-18')
    })

    // Today is fetched by the line above the top-up and fetchPack is cache-first, so asking twice
    // would spend a second request on the one date that was certainly just requested.
    it("asks once for today even when today's cached pack is incomplete", async () => {
      setup()
      writePack('2026-08-18', partialPackFor('2026-08-18'))

      await renderPrefetch()

      expect(mockFetchPack).toHaveBeenCalledTimes(1)
      expect(mockFetchPack).toHaveBeenCalledWith('2026-08-18')
    })

    // Every one of them, not the newest. A player who opened the app on three thin mornings has
    // three partial days, and healing one per open would take three days to finish.
    it('re-asks for every incomplete pack on the device', async () => {
      setup()
      writePack('2026-08-16', partialPackFor('2026-08-16'))
      writePack('2026-08-15', partialPackFor('2026-08-15'))

      await renderPrefetch()

      expect(mockFetchPack).toHaveBeenCalledWith('2026-08-16')
      expect(mockFetchPack).toHaveBeenCalledWith('2026-08-15')
    })

    // A day whose top-up fails must not take the days behind it down with it. The loop is
    // sequential, so one rejection propagating would abandon every date after it -- and the request
    // most likely to fail is the one on a connection that is about to drop for all of them.
    it('tops up the remaining days when one of them fails', async () => {
      setup()
      writePack('2026-08-16', partialPackFor('2026-08-16'))
      writePack('2026-08-15', partialPackFor('2026-08-15'))
      mockFetchPack.mockResolvedValueOnce(pack).mockRejectedValueOnce(new Error('Network Error'))

      await renderPrefetch()

      expect(mockFetchPack).toHaveBeenCalledWith('2026-08-15')
    })

    // The top-up reads the device AFTER today's fetch has written to it, so a date that has just
    // arrived complete is not asked for a second time. Nothing else in this file can catch that:
    // the fetch and the scan are one function apart.
    it('does not re-ask for a day the run just completed', async () => {
      setup()
      writePack('2026-08-17', partialPackFor('2026-08-17'))
      mockFetchPack.mockImplementationOnce(async () => {
        writePack('2026-08-17', packFor('2026-08-17'))
        return pack
      })

      await renderPrefetch()

      expect(mockFetchPack).toHaveBeenCalledTimes(1)
    })

    // A request against a 35-second timeout hangs for the whole timeout with no network.
    // onLine is only trustworthy when false, which is the direction that matters here.
    it('asks for nothing while the device reports itself offline', async () => {
      setup()
      goOffline()

      await renderPrefetch()

      expect(mockFetchPack).not.toHaveBeenCalled()
    })

    it('runs again on reconnect', async () => {
      setup()
      await renderPrefetch()

      await act(async () => {
        window.dispatchEvent(new Event('online'))
      })

      expect(mockFetchPack).toHaveBeenCalledTimes(2)
    })

    // The one that makes a daily habit work. An installed app keeps its JS context across
    // days, so the next morning there is no remount and no `online` -- the connection
    // never dropped.
    it('runs again when the app comes back to the foreground', async () => {
      setup()
      await renderPrefetch()

      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'))
      })

      expect(mockFetchPack).toHaveBeenCalledTimes(2)
    })

    // Installing used to widen the window from two days to seven, which is why it was a
    // trigger. The target is today either way now, so an appinstalled run would only
    // re-ask for the date the run on open already fetched.
    it('does not run again on install', async () => {
      setup()
      await renderPrefetch()

      await act(async () => {
        window.dispatchEvent(new Event('appinstalled'))
      })

      expect(mockFetchPack).toHaveBeenCalledTimes(1)
    })

    // online fires on every transition with no backoff, and a flapping connection fires
    // it for minutes. Without the guard, a reconnect mid-request starts a second sequence
    // that snapshots the cache before the first one writes.
    it('ignores a trigger that arrives while a run is still going', async () => {
      setup()
      const pending = deferred()
      mockFetchPack.mockReturnValueOnce(pending.promise)

      const rendered = renderHook(() => usePrefetch(morning))
      await act(async () => {
        window.dispatchEvent(new Event('online'))
      })
      await act(async () => {
        pending.resolve()
      })
      rendered.unmount()

      expect(mockFetchPack).toHaveBeenCalledTimes(1)
    })

    // Pruning runs after the request, so it is still ahead when the screen goes away
    // mid-flight. Nobody is left to receive it, and it is a delete.
    it('skips pruning when the screen goes away mid-request', async () => {
      setup()
      store(...WEEK, '2026-08-11')
      const pending = deferred()
      mockFetchPack.mockReturnValueOnce(pending.promise)

      const rendered = renderHook(() => usePrefetch(morning))
      rendered.unmount()
      await act(async () => {
        pending.resolve()
      })

      expect(readPack('2026-08-11')).toEqual(packFor('2026-08-11'))
    })

    // The failure is swallowed on purpose: a day that cannot be fetched is no reason to
    // leave an eighth pack on a device with a ~5MB ceiling.
    it('prunes even when the request fails', async () => {
      setup()
      store(...WEEK, '2026-08-11')
      mockFetchPack.mockRejectedValueOnce(new Error('Network Error'))

      await renderPrefetch()

      expect(readPack('2026-08-11')).toBeNull()
    })

    // The clock, the date arithmetic and the pruning pass all sit outside the per-pack
    // guard. run is called bare and registered as a listener, so nothing at either call
    // site has anywhere to put a rejection.
    it('survives a run that throws outside the per-pack guard', async () => {
      setup()
      const brokenClock = () => {
        throw new Error('clock unavailable')
      }

      await expect(
        act(async () => {
          renderHook(() => usePrefetch(brokenClock))
        }),
      ).resolves.toBeUndefined()
      expect(mockFetchPack).not.toHaveBeenCalled()
    })
  })

  describe('pruning', () => {
    it('drops the eighth pack', async () => {
      setup()
      store(...WEEK, '2026-08-11')

      await renderPrefetch()

      expect(readPack('2026-08-11')).toBeNull()
    })

    it('keeps seven packs', async () => {
      setup()
      store(...WEEK, '2026-08-11')

      await renderPrefetch()

      expect(cachedPackDates()).toEqual(WEEK)
    })

    // THE PLANE. Days fetched on purpose used to be deleted by the next open at the gate: an age rule
    // collected everything older than today - 6, and the session exemption had died with the page.
    // Unfinished days now outrank finished ones, whatever their age.
    it('keeps unfinished older days over finished recent ones', async () => {
      setup()
      store('2026-08-18', '2026-03-14', '2026-03-15')
      finish('2026-08-17', '2026-08-16', '2026-08-15', '2026-08-14', '2026-08-13', '2026-08-12')

      await renderPrefetch()

      expect(readPack('2026-03-14')).toEqual(packFor('2026-03-14'))
      expect(readPack('2026-03-15')).toEqual(packFor('2026-03-15'))
      expect(readPack('2026-08-12')).toBeNull()
    })

    // The retention count is not the fetch window. Only today is ever requested, so a
    // rule derived from what this run fetched would leave the device holding a single day
    // after every open -- and take the shelf's fallback to "the most recent pack on the
    // device" down with it.
    it('keeps a week of packs even though only today was fetched', async () => {
      setup()
      writePack('2026-08-15', packFor('2026-08-15'))

      await renderPrefetch()

      expect(readPack('2026-08-15')).toEqual(packFor('2026-08-15'))
    })

    // Nothing fetches tomorrow any more, but a device that already holds it keeps it.
    it("keeps tomorrow's pack when the device already has one", async () => {
      setup()
      store(...WEEK, '2026-08-19')

      await renderPrefetch()

      expect(readPack('2026-08-19')).toEqual(packFor('2026-08-19'))
    })

    // THE RANKING CAN STILL NAME THE DAY ON SCREEN. A finished day opened to look back at ranks below
    // every unfinished one, and run() fires on open, reconnect and RESUME -- so backgrounding the app
    // to read a text would delete the day out from under the screen showing it.
    //
    // The date here is used by no other case in this file, deliberately: the exemption is a
    // module-level Set with the session's lifetime, so a date one test exempts stays exempt for the
    // rest of the file, and a shared fixture date would make these cases depend on their order.
    it('keeps a day this session went and got, however it ranks', async () => {
      setup()
      store(...WEEK)
      finish('2026-03-14')
      keepThisSession('2026-03-14')

      await renderPrefetch()

      expect(readPack('2026-03-14')).toEqual(packFor('2026-03-14'))
    })

    // The other half: the exemption covers the day that was asked for and nothing beside it. Without
    // this, "keeps a day this session went and got" would still pass against a prune that had simply
    // stopped working.
    it('collects a day of the same rank that nobody asked for', async () => {
      setup()
      store(...WEEK)
      finish('2026-03-15')

      await renderPrefetch()

      expect(readPack('2026-03-15')).toBeNull()
    })

    // Progress is NOT pruned by age. It was, until reaching a day older than the window became
    // possible: a player who opened 14 March, started a puzzle and closed the app lost the board
    // on next open, because run() fires on open, reconnect and resume. Packs are the weight this
    // function exists to collect -- kilobytes a day -- and a progress string is hundreds of bytes at
    // its largest, which is the same argument lull:meta.solved already keeps solved ids forever on.
    it('keeps progress for a puzzle older than the window', async () => {
      setup()
      writeProgress('2026-08-10:gofigure:9f3a1c02', '6+9')

      await renderPrefetch()

      expect(readProgress('2026-08-10:gofigure:9f3a1c02')).toEqual('6+9')
    })

    it('keeps progress for a puzzle inside the window', async () => {
      setup()
      writeProgress('2026-08-14:gofigure:9f3a1c02', '6+9')

      await renderPrefetch()

      expect(readProgress('2026-08-14:gofigure:9f3a1c02')).toEqual('6+9')
    })

    // Hints follow progress for the same reason and are smaller still -- one integer per puzzle.
    // A player returning to a March puzzle finds the rungs they paid for, not a reset ladder.
    it('keeps hint counts for a puzzle older than the window', async () => {
      setup()
      writeHints('2026-08-10:missingvowels:9f8e7d6c', 2)

      await renderPrefetch()

      expect(readHints('2026-08-10:missingvowels:9f8e7d6c', 3)).toBe(2)
    })

    it('keeps hint counts for a puzzle inside the window', async () => {
      setup()
      writeHints('2026-08-14:missingvowels:9f8e7d6c', 2)

      await renderPrefetch()

      expect(readHints('2026-08-14:missingvowels:9f8e7d6c', 3)).toBe(2)
    })

    // Solved ids live in lull:meta and are a few bytes each. History outlives the pack
    // payloads it names.
    it('never touches the solved list', async () => {
      setup()
      window.localStorage.setItem(
        'lull:meta',
        JSON.stringify({ installDismissed: false, solved: ['2020-01-01:gofigure:old'], v: 1 }),
      )

      await renderPrefetch()

      expect(window.localStorage.getItem('lull:meta')).toContain('2020-01-01:gofigure:old')
    })
  })
})
