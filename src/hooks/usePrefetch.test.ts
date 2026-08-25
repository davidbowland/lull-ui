import { act, renderHook } from '@testing-library/react'

import { keepThisSession, retentionFloor, usePrefetch } from './usePrefetch'
import { fetchPack } from '@services/lull'
import { readHints, readPack, readProgress, writeHints, writePack, writeProgress } from '@services/storage'
import { pack } from '@test/__mocks__'

// jsdom reports navigator.onLine === true, so an unmocked hook fires real axios
// requests against a 35-second timeout.
jest.mock('@services/lull')

// A pack's own `date` must match the key it is stored under -- readPack rejects a
// mismatch as corrupt, which is what stops a poisoned entry crashing every load.
const packFor = (date: string) => ({ ...pack, date })

describe('retentionFloor', () => {
  it('keeps seven days, counting back from today', () => {
    expect(retentionFloor('2026-08-18')).toEqual('2026-08-12')
  })

  it('counts back across a month boundary', () => {
    expect(retentionFloor('2026-08-02')).toEqual('2026-07-27')
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
      writePack('2026-08-11', packFor('2026-08-11'))
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
    // leave a week of expired packs on a device with a ~5MB ceiling.
    it('prunes even when the request fails', async () => {
      setup()
      writePack('2026-08-11', packFor('2026-08-11'))
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
    it('drops a pack older than the retention window', async () => {
      setup()
      writePack('2026-08-11', packFor('2026-08-11'))

      await renderPrefetch()

      expect(readPack('2026-08-11')).toBeNull()
    })

    it('keeps the oldest pack still inside the window', async () => {
      setup()
      writePack('2026-08-12', packFor('2026-08-12'))

      await renderPrefetch()

      expect(readPack('2026-08-12')).toEqual(packFor('2026-08-12'))
    })

    // The retention window is not the fetch window. Only today is ever requested, so a
    // rule derived from what this run fetched would leave the device holding a single day
    // after every open -- and take the shelf's fallback to "the most recent pack on the
    // device" down with it.
    it('keeps a week of packs even though only today was fetched', async () => {
      setup()
      writePack('2026-08-15', packFor('2026-08-15'))

      await renderPrefetch()

      expect(readPack('2026-08-15')).toEqual(packFor('2026-08-15'))
    })

    // Nothing fetches tomorrow any more, but a device that already holds it keeps it: an
    // age rule never reaches a date newer than today. A rule that pruned anything outside
    // the seven dates counted back from today would.
    it("keeps tomorrow's pack when the device already has one", async () => {
      setup()
      writePack('2026-08-19', packFor('2026-08-19'))

      await renderPrefetch()

      expect(readPack('2026-08-19')).toEqual(packFor('2026-08-19'))
    })

    // THE AGE RULE NAMES, PRECISELY, THE DAYS THIS FEATURE EXISTS TO REACH. A player who asks for
    // 14 March waits thirty seconds for a pack five months past the floor. run() fires on open,
    // reconnect and RESUME, and the hook is mounted in _app for the life of the page -- so
    // `abandoned` is never true in practice, and backgrounding the app to read a text was enough to
    // delete the day out from under the screen showing it. The shelf then found it no longer held,
    // rewrote the address bar to `/`, and bounced the player to today with no message.
    //
    // The date here is used by no other case in this file, deliberately: the exemption is a
    // module-level Set with the session's lifetime, so a date one test exempts stays exempt for the
    // rest of the file, and a shared fixture date would make these cases depend on their order.
    it('keeps a day this session went and got, however far past the floor it is', async () => {
      setup()
      writePack('2026-03-14', packFor('2026-03-14'))
      keepThisSession('2026-03-14')

      await renderPrefetch()

      expect(readPack('2026-03-14')).toEqual(packFor('2026-03-14'))
    })

    // The other half: the exemption covers the day that was asked for and nothing beside it. Without
    // this, "keeps a day this session went and got" would still pass against a prune that had simply
    // stopped working.
    it('collects a day of the same age that nobody asked for', async () => {
      setup()
      writePack('2026-03-15', packFor('2026-03-15'))

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
