import { act, renderHook } from '@testing-library/react'

import { isInstalled, prefetchTargets, retentionFloor, usePrefetch } from './usePrefetch'
import { fetchPack } from '@services/lull'
import { readHints, readPack, readProgress, writeHints, writePack, writeProgress } from '@services/storage'
import { pack } from '@test/__mocks__'

// jsdom reports navigator.onLine === true, so an unmocked hook fires real axios
// requests against a 35-second timeout.
jest.mock('@services/lull')

// A pack's own `date` must match the key it is stored under -- readPack rejects a
// mismatch as corrupt, which is what stops a poisoned entry crashing every load.
const packFor = (date: string) => ({ ...pack, date })

describe('prefetchTargets', () => {
  // Two days, not one. The shelf's fallback to "the most recent pack on the device"
  // searches the cache, so a single candidate leaves it nothing to fall back to when
  // today 404s -- day one of the product, a failed nightly, or a clock ahead of the
  // generator all show an empty app with a good pack one request away.
  it('asks for today and yesterday when the app is not installed', () => {
    expect(prefetchTargets({ installed: false, localToday: '2026-08-18', utcToday: '2026-08-18' })).toEqual([
      '2026-08-18',
      '2026-08-17',
    ])
  })

  it('asks for seven days when the app is installed', () => {
    expect(prefetchTargets({ installed: true, localToday: '2026-08-18', utcToday: '2026-08-18' })).toEqual([
      '2026-08-18',
      '2026-08-17',
      '2026-08-16',
      '2026-08-15',
      '2026-08-14',
      '2026-08-13',
      '2026-08-12',
    ])
  })

  // Seeded from the date, not from a clock, and parsed field by field: new Date('2026-08-01')
  // reads as UTC midnight and lands on July everywhere west of it.
  it('counts back across a month boundary', () => {
    expect(prefetchTargets({ installed: true, localToday: '2026-08-02', utcToday: '2026-08-02' })).toEqual([
      '2026-08-02',
      '2026-08-01',
      '2026-07-31',
      '2026-07-30',
      '2026-07-29',
      '2026-07-28',
      '2026-07-27',
    ])
  })

  // West of UTC the pack for tomorrow's local date already exists. Storing it now puts
  // it on the device before midnight; the shelf still renders localToday, so nothing
  // reveals early. This is what makes the window up to EIGHT requests, not seven.
  it('stages tomorrow when the UTC date runs ahead of the local one', () => {
    const targets = prefetchTargets({ installed: true, localToday: '2026-08-17', utcToday: '2026-08-18' })

    expect(targets).toHaveLength(8)
    expect(targets[0]).toEqual('2026-08-18')
  })

  it('stages tomorrow for a visitor who has not installed', () => {
    expect(prefetchTargets({ installed: false, localToday: '2026-08-17', utcToday: '2026-08-18' })).toEqual([
      '2026-08-18',
      '2026-08-17',
      '2026-08-16',
    ])
  })
})

describe('retentionFloor', () => {
  it('keeps seven days, counting back from today', () => {
    expect(retentionFloor('2026-08-18')).toEqual('2026-08-12')
  })

  it('counts back across a month boundary', () => {
    expect(retentionFloor('2026-08-02')).toEqual('2026-07-27')
  })
})

describe('isInstalled', () => {
  it('reports an app running in a standalone window', () => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: true })

    expect(isInstalled()).toBe(true)
  })

  it('reports a browser tab as not installed', () => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: false })

    expect(isInstalled()).toBe(false)
  })

  // iOS has no display-mode to match. navigator.standalone is the only signal there,
  // and it is the platform the whole retention window is written for.
  it('reports an iOS home-screen app', () => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: false })
    Object.defineProperty(window.navigator, 'standalone', { configurable: true, value: true })

    expect(isInstalled()).toBe(true)

    Reflect.deleteProperty(window.navigator, 'standalone')
  })
})

describe('usePrefetch', () => {
  const mockFetchPack = jest.mocked(fetchPack)

  // 2026-08-18T10:00:00Z. Under TZ=UTC the local and UTC dates agree, which is why the
  // staged-tomorrow branch is covered by injecting dates into prefetchTargets instead.
  const morning = () => Date.UTC(2026, 7, 18, 10)

  const setup = (installed = false): void => {
    window.localStorage.clear()
    window.matchMedia = jest.fn().mockReturnValue({ matches: installed })
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
    it("fetches today's and yesterday's packs for a visitor who has not installed", async () => {
      setup()

      await renderPrefetch()

      // Yesterday is what the shelf's fallback falls back TO when today has no pack.
      expect(mockFetchPack).toHaveBeenCalledTimes(2)
      expect(mockFetchPack).toHaveBeenCalledWith('2026-08-18')
      expect(mockFetchPack).toHaveBeenCalledWith('2026-08-17')
    })

    it('fetches the whole window once installed', async () => {
      setup(true)

      await renderPrefetch()

      expect(mockFetchPack).toHaveBeenCalledTimes(7)
    })

    // isInstalled is checked on every open rather than latched at install time. iOS
    // fires no appinstalled event at all, and it evicts localStorage after seven idle
    // days, so a one-shot fill is undone before the flight it was meant for.
    it('checks the installed state again on a later run', async () => {
      setup()
      await renderPrefetch()
      window.matchMedia = jest.fn().mockReturnValue({ matches: true })

      await act(async () => {
        window.dispatchEvent(new Event('online'))
      })

      expect(mockFetchPack).toHaveBeenCalledTimes(9)
    })

    // Offline, eight sequential requests against a 35-second timeout can hang for over
    // four minutes. onLine is only trustworthy when false, which is the direction that
    // matters here.
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

      expect(mockFetchPack).toHaveBeenCalledTimes(4)
    })

    it('runs again on install', async () => {
      setup()
      await renderPrefetch()

      await act(async () => {
        window.dispatchEvent(new Event('appinstalled'))
      })

      expect(mockFetchPack).toHaveBeenCalledTimes(4)
    })

    // online fires on every transition with no backoff, and a flapping connection fires
    // it for minutes. Without the guard, install plus a reconnect start two sequences
    // that both snapshot the cache before either writes.
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

      // Two, because a non-installed run asks for today and yesterday. The point is that
      // it is not FOUR: the `online` event that arrived mid-flight started no second run.
      expect(mockFetchPack).toHaveBeenCalledTimes(2)
    })

    // Nobody is left to receive these. Stop rather than spend the rest of the window on
    // requests for a screen that is gone.
    it('abandons the rest of the window when the screen goes away', async () => {
      setup(true)
      const pending = deferred()
      mockFetchPack.mockReturnValueOnce(pending.promise)

      const rendered = renderHook(() => usePrefetch(morning))
      rendered.unmount()
      await act(async () => {
        pending.resolve()
      })

      expect(mockFetchPack).toHaveBeenCalledTimes(1)
    })

    it('keeps filling the window when one pack fails', async () => {
      setup(true)
      mockFetchPack.mockRejectedValueOnce(new Error('Network Error'))

      await renderPrefetch()

      expect(mockFetchPack).toHaveBeenCalledTimes(7)
    })

    // isInstalled and the pruning pass sit outside the per-pack guard, and matchMedia
    // and localStorage can each throw. run is registered as a listener, so nothing at
    // the call site has anywhere to put a rejection.
    it('survives a run that throws outside the per-pack guard', async () => {
      setup()
      window.matchMedia = jest.fn().mockImplementation(() => {
        throw new Error('SecurityError')
      })

      await expect(renderPrefetch()).resolves.toBeDefined()
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

    // Retention window is not the fetch window. prefetchTargets collapses to
    // [localToday] when the app is not installed, so a rule derived from TARGETS would
    // wipe a casual visitor's whole cache on every open. Prune on age.
    it('keeps a week of packs for a visitor who has not installed', async () => {
      setup()
      writePack('2026-08-15', packFor('2026-08-15'))

      await renderPrefetch()

      expect(readPack('2026-08-15')).toEqual(packFor('2026-08-15'))
    })

    // Staged tomorrow is newer than today, so an age rule never reaches it. A rule that
    // pruned anything outside the seven dates counted back from today would.
    it("keeps tomorrow's staged pack", async () => {
      setup()
      writePack('2026-08-19', packFor('2026-08-19'))

      await renderPrefetch()

      expect(readPack('2026-08-19')).toEqual(packFor('2026-08-19'))
    })

    // Progress prunes by the YYYY-MM-DD prefix of the puzzle id -- the one part of an id
    // a client may read.
    it('drops progress for a puzzle older than the window', async () => {
      setup()
      writeProgress('2026-08-10:gofigure:9f3a1c02', '6+9')

      await renderPrefetch()

      expect(readProgress('2026-08-10:gofigure:9f3a1c02')).toBeNull()
    })

    it('keeps progress for a puzzle inside the window', async () => {
      setup()
      writeProgress('2026-08-14:gofigure:9f3a1c02', '6+9')

      await renderPrefetch()

      expect(readProgress('2026-08-14:gofigure:9f3a1c02')).toEqual('6+9')
    })

    // The one lull: prefix nothing else collects. Reveal state is written on every reveal and
    // deliberately never cleared by solving, so without this it grows without bound. Puzzle ids
    // carry a random shortId, so a regenerated pack never reuses one -- a stale hint key orphans
    // rather than collides, and pruning is what collects it.
    it('drops hint counts for a puzzle older than the window', async () => {
      setup()
      writeHints('2026-08-10:missingvowels:9f8e7d6c', 2)

      await renderPrefetch()

      expect(readHints('2026-08-10:missingvowels:9f8e7d6c', 3)).toBe(0)
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
