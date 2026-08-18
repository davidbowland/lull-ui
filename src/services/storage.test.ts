import {
  cachedPackDates,
  cachedProgressIds,
  markSolved,
  readMeta,
  readPack,
  readProgress,
  removePack,
  removeProgress,
  setInstallDismissed,
  STORAGE_EVENT,
  writePack,
  writeProgress,
} from './storage'
import { pack, packDate, puzzleId } from '@test/__mocks__'

describe('storage', () => {
  const setup = (): void => {
    window.localStorage.clear()
  }

  // onAnnounce runs inside the listener, so a test can assert what storage looked like
  // at the moment it was told rather than only that it was told. The listener is
  // detached before the assertions run: window outlives every test in this file, and
  // one left attached would keep firing for the rest of the suite.
  const announcementsDuring = (act: () => void, onAnnounce: () => void = () => undefined): jest.Mock => {
    const listener = jest.fn(onAnnounce)
    window.addEventListener(STORAGE_EVENT, listener)
    act()
    window.removeEventListener(STORAGE_EVENT, listener)
    return listener
  }

  // Cookies blocked, storage partitioned, or a private window on some browsers: the
  // window.localStorage getter itself throws, before any method is reached. That is why
  // the property access sits inside the try in storage.ts rather than outside it.
  const denyStorage = (): void => {
    jest.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError')
    })
  }

  beforeAll(() => {
    console.error = jest.fn()
  })

  describe('packs', () => {
    it('round-trips a pack', () => {
      setup()
      writePack(packDate, pack)

      expect(readPack(packDate)).toEqual(pack)
    })

    it('returns null for a pack that was never stored', () => {
      setup()

      expect(readPack('2026-01-01')).toBeNull()
    })

    it('returns null rather than throwing when the stored value is corrupt', () => {
      setup()
      window.localStorage.setItem('lull:pack:2026-01-01', 'not json')

      expect(readPack('2026-01-01')).toBeNull()
    })

    it('removes a pack', () => {
      setup()
      writePack(packDate, pack)
      removePack(packDate)

      expect(readPack(packDate)).toBeNull()
    })

    it('derives the cached date list from the keys themselves, newest first', () => {
      setup()
      writePack('2026-01-15', pack)
      writePack('2026-08-08', pack)
      writePack('2026-06-01', pack)

      expect(cachedPackDates()).toEqual(['2026-08-08', '2026-06-01', '2026-01-15'])
    })

    // A bare `lull:` scan would sweep in lull:meta and every lull:progress: key. The
    // prefix has to be the full one, and both halves of this are load-bearing.
    it('scans on the full pack prefix, so meta and progress keys stay out', () => {
      setup()
      writePack(packDate, pack)
      writeProgress(puzzleId, '6+9')
      window.localStorage.setItem('lull:meta', '{}')
      window.localStorage.setItem('unrelated', 'x')

      expect(cachedPackDates()).toEqual([packDate])
    })

    // The other half. Without the pattern check a malformed key enters the derived
    // index, and "the keys cannot lie" stops being true.
    it('rejects a malformed date, so it cannot enter the derived index', () => {
      setup()
      writePack(packDate, pack)
      window.localStorage.setItem('lull:pack:tomorrow', '{}')
      window.localStorage.setItem('lull:pack:2026-8-1', '{}')

      expect(cachedPackDates()).toEqual([packDate])
    })

    // This runs during render with no error boundary above it -- an escaping throw
    // white-screens the app.
    it('reports no cached packs rather than throwing when localStorage is unavailable', () => {
      setup()
      denyStorage()

      expect(cachedPackDates()).toEqual([])
    })

    it('announces a write', () => {
      setup()

      const listener = announcementsDuring(() => writePack(packDate, pack))

      expect(listener).toHaveBeenCalled()
    })

    // Announced after the write, never before: a listener re-reads storage
    // synchronously, so firing first hands it the state it was told had changed.
    it('announces a write only once storage already holds it', () => {
      setup()
      const seen: unknown[] = []

      announcementsDuring(
        () => writePack(packDate, pack),
        () => seen.push(readPack(packDate)),
      )

      expect(seen).toEqual([pack])
    })

    it('announces a removal', () => {
      setup()
      writePack(packDate, pack)

      const listener = announcementsDuring(() => removePack(packDate))

      expect(listener).toHaveBeenCalled()
    })
  })

  describe('progress', () => {
    it('round-trips progress', () => {
      setup()
      writeProgress(puzzleId, '6+9+7')

      expect(readProgress(puzzleId)).toEqual('6+9+7')
    })

    // The shell persists progress verbatim and never reads inside it. A value that
    // happens to look like JSON must come back as the same string, not as an object.
    it('stores progress opaquely, without interpreting it', () => {
      setup()
      writeProgress(puzzleId, '{"not":"parsed"}')

      expect(readProgress(puzzleId)).toEqual('{"not":"parsed"}')
    })

    it('returns null for a puzzle with no progress', () => {
      setup()

      expect(readProgress(puzzleId)).toBeNull()
    })

    it('removes progress', () => {
      setup()
      writeProgress(puzzleId, '6+9')
      removeProgress(puzzleId)

      expect(readProgress(puzzleId)).toBeNull()
    })

    it('derives the progress id list from the keys themselves', () => {
      setup()
      writeProgress(puzzleId, '6+9')
      writeProgress('2026-08-17:gofigure:abcd1234', '1+2')

      expect(cachedProgressIds().toSorted()).toEqual(['2026-08-17:gofigure:abcd1234', puzzleId])
    })

    it('keeps pack and meta keys out of the progress id list', () => {
      setup()
      writeProgress(puzzleId, '6+9')
      writePack(packDate, pack)
      window.localStorage.setItem('lull:meta', '{}')

      expect(cachedProgressIds()).toEqual([puzzleId])
    })

    it('rejects a progress key that is not a puzzle id', () => {
      setup()
      writeProgress(puzzleId, '6+9')
      window.localStorage.setItem('lull:progress:nonsense', 'x')

      expect(cachedProgressIds()).toEqual([puzzleId])
    })

    it('reports no stored progress rather than throwing when localStorage is unavailable', () => {
      setup()
      denyStorage()

      expect(cachedProgressIds()).toEqual([])
    })

    it('announces a progress write', () => {
      setup()

      const listener = announcementsDuring(() => writeProgress(puzzleId, '6+9'))

      expect(listener).toHaveBeenCalled()
    })
  })

  describe('meta', () => {
    it('returns an empty meta when nothing is stored', () => {
      setup()

      expect(readMeta()).toEqual({ installDismissed: false, solved: [], v: 1 })
    })

    // A factory, not a constant. One shared object means the first caller to push onto
    // meta.solved corrupts every later read for the life of the page.
    it('hands out a fresh solved array each time', () => {
      setup()

      readMeta().solved.push('poison')

      expect(readMeta().solved).toEqual([])
    })

    it('marks a puzzle solved', () => {
      setup()
      markSolved(puzzleId)

      expect(readMeta().solved).toEqual([puzzleId])
    })

    it('does not record a puzzle twice', () => {
      setup()
      markSolved(puzzleId)
      markSolved(puzzleId)

      expect(readMeta().solved).toEqual([puzzleId])
    })

    it('announces a newly solved puzzle', () => {
      setup()

      const listener = announcementsDuring(() => markSolved(puzzleId))

      expect(listener).toHaveBeenCalled()
    })

    it('stays quiet when the puzzle was already solved', () => {
      setup()
      markSolved(puzzleId)

      const listener = announcementsDuring(() => markSolved(puzzleId))

      expect(listener).not.toHaveBeenCalled()
    })

    it('records the install dismissal', () => {
      setup()
      setInstallDismissed(true)

      expect(readMeta().installDismissed).toBe(true)
    })

    it('keeps solved ids when the install card is dismissed', () => {
      setup()
      markSolved(puzzleId)
      setInstallDismissed(true)

      expect(readMeta().solved).toEqual([puzzleId])
    })

    it('discards meta written by an older version', () => {
      setup()
      window.localStorage.setItem('lull:meta', JSON.stringify({ installDismissed: true, solved: [puzzleId], v: 0 }))

      expect(readMeta()).toEqual({ installDismissed: false, solved: [], v: 1 })
    })

    // Anything JSON can hold reaches this. A bare string would satisfy both includes()
    // and the spread in markSolved, silently and wrongly.
    it('replaces a non-array solved list with an empty one', () => {
      setup()
      window.localStorage.setItem('lull:meta', JSON.stringify({ installDismissed: false, solved: 'nope', v: 1 }))

      expect(readMeta().solved).toEqual([])
    })

    it('returns an empty meta rather than throwing when the stored value is corrupt', () => {
      setup()
      window.localStorage.setItem('lull:meta', 'not json')

      expect(readMeta()).toEqual({ installDismissed: false, solved: [], v: 1 })
    })
  })

  // Every write is best-effort. Storage can be full, disabled, or partitioned, and none
  // of those are worth showing the player an error over.
  describe('when storage refuses', () => {
    it('swallows a failed write', () => {
      setup()
      denyStorage()

      expect(() => writePack(packDate, pack)).not.toThrow()
    })

    it('swallows a failed read', () => {
      setup()
      denyStorage()

      expect(readPack(packDate)).toBeNull()
    })

    it('swallows a failed removal', () => {
      setup()
      denyStorage()

      expect(() => removePack(packDate)).not.toThrow()
    })

    it('swallows a failed progress removal', () => {
      setup()
      denyStorage()

      expect(() => removeProgress(puzzleId)).not.toThrow()
    })
  })
})
