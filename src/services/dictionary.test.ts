import {
  backoffDelay,
  DICT_CACHE_NAME,
  DICT_CACHE_PREFIX,
  DICTIONARY_TIMEOUT_MS,
  DICTIONARY_VERSION,
  fetchDictionary,
  mayAttempt,
  parseDictionary,
  readCachedDictionary,
  RETRY_CAP_MS,
  scheduleRetry,
} from './dictionary'
import { readDictRetry, writeDictRetry } from './storage'

// A Cache API stub, modeled on test/sw-harness.js's createCaches(). Local to this file and not
// imported from there: that harness is a .js file built for a worker evaluated out of a string, and
// a shared fake would have to serve two callers with different needs. Thirty lines that are wrong
// in the same ways the real one is beats a new devDependency, which is the whole argument that
// chose the Cache API over IndexedDB.
interface FakeBody {
  text: () => Promise<string>
}

interface FakeCache {
  match: (key: string) => Promise<FakeBody | undefined>
  put: (key: string, response: FakeBody) => Promise<void>
}

interface FakeCaches {
  delete: (name: string) => Promise<boolean>
  keys: () => Promise<string[]>
  match: (key: string) => Promise<FakeBody | undefined>
  open: (name: string) => Promise<FakeCache>
}

const createCaches = (): FakeCaches => {
  const stores = new Map<string, Map<string, FakeBody>>()

  const cacheFor = (name: string): FakeCache => {
    const store = stores.get(name) ?? new Map<string, FakeBody>()
    stores.set(name, store)
    return {
      match: (key: string) => Promise.resolve(store.get(key)),
      put: (key: string, response: FakeBody) => {
        store.set(key, response)
        return Promise.resolve()
      },
    }
  }

  return {
    delete: (name: string) => Promise.resolve(stores.delete(name)),
    keys: () => Promise.resolve([...stores.keys()]),
    match: (key: string) =>
      Promise.resolve([...stores.values()].map((store) => store.get(key)).find((hit) => hit !== undefined)),
    open: (name: string) => Promise.resolve(cacheFor(name)),
  }
}

// A Response shaped exactly as far as the service reads it, because jsdom has no Response at all.
//
// The body is ONE-SHOT, exactly as the real thing is, and that is what makes the clone testable.
// A stub whose text() could be read twice would let `store(response)` -- no clone -- cache an
// already-consumed response with every assertion in this file still green. With the throw in
// place, "answers from the cache without a request" is the test that catches it: the cached
// response is the one the service already drained, and reading it again fails.
//
// AND clone() THROWS ONCE THE BODY IS DISTURBED, which is the half this stub was missing and which
// cost a shipped bug. `Response.prototype.clone` does not hand back a stale copy on a drained
// body -- it raises `TypeError: Body has already been consumed`, verified against undici rather
// than assumed. A stub that cloned cheerfully after the read let `const words = parse(await
// response.text())` be inserted ABOVE `store(response.clone())` with all 43 suites green, while on
// every real device the clone threw into fetchDictionary's outer catch: every successful 200 logged
// as a failure, scheduled a retry, and returned null, so the word list never loaded and Phrazle was
// unplayable against an API answering perfectly.
//
// A fake is only worth what its failure modes are worth. This one now has the two that matter.
const fakeResponse = (body: string, ok = true): { clone: () => unknown; ok: boolean; text: () => Promise<string> } => {
  let read = false
  return {
    clone: () => {
      if (read) throw new TypeError('Response.clone: Body has already been consumed.')
      return fakeResponse(body, ok)
    },
    ok,
    text: () => {
      const alreadyRead = read
      read = true
      return alreadyRead ? Promise.reject(new Error('body already read')) : Promise.resolve(body)
    },
  }
}

const BODY = 'HOLD\nHOT\nTOE\n'
const WORDS = new Set(['HOLD', 'HOT', 'TOE'])

// A SENTINEL, not an empty object, and it is what makes "asks for the timeout it advertises" able to
// fail. jsdom has no AbortSignal.timeout, so setup() installs one; while it answered `undefined`
// there was no value to trace, and asserting `{ signal: expect.anything() }` would have failed on
// the correct implementation. Handing back an identifiable object lets that test assert the signal
// it computed is the signal fetch was given.
const SIGNAL = { sentinel: 'dictionary timeout' } as unknown as AbortSignal

describe('the dictionary service', () => {
  // EVERY global this service touches is absent under jsdom -- fetch, Response, caches and
  // AbortSignal.timeout are all undefined, measured rather than assumed. So setup() installs them
  // and afterAll removes them, and every test that reaches one calls setup() explicitly. That is
  // also what makes the no-Cache-API tests safe: they delete globalThis.caches, and the next test's
  // setup() puts a fresh one back, so a deleted global cannot poison the rest of the file.
  const setup = (): { caches: FakeCaches; fetchSpy: jest.Mock } => {
    window.localStorage.clear()
    const fetchSpy = jest.fn()
    const cacheStorage = createCaches()
    Object.assign(globalThis, { caches: cacheStorage, fetch: fetchSpy })
    Object.defineProperty(AbortSignal, 'timeout', {
      configurable: true,
      value: jest.fn(() => SIGNAL),
      writable: true,
    })
    return { caches: cacheStorage, fetchSpy }
  }

  beforeAll(() => {
    console.error = jest.fn()
  })

  afterAll(() => {
    delete (globalThis as { caches?: unknown }).caches
    delete (globalThis as { fetch?: unknown }).fetch
    delete (AbortSignal as unknown as { timeout?: unknown }).timeout
  })

  describe('parseDictionary', () => {
    // BLANK LINES ARE DROPPED RATHER THAN STORED, and the clause is load-bearing rather than tidy:
    // an empty string in the set makes everyWordInDictionary true for a word that split to nothing,
    // which is the exact clause is-valid-guess.ts calls load-bearing.
    it('drops blank lines and the trailing newline', () => {
      expect(parseDictionary('HOLD\n\nHOT\nTOE\n')).toEqual(WORDS)
    })

    it('holds one entry per line', () => {
      expect(parseDictionary(BODY).size).toEqual(3)
    })

    it('never holds the empty string', () => {
      expect(parseDictionary('\n\n\n').size).toEqual(0)
    })

    // The trim, which the blank-line filter does not stand in for. Split on '\n' alone leaves a
    // carriage return welded to the end of every word of a CRLF-served file, and a set of 51,852
    // words that all end in \r matches nothing a player can type -- the same outcome as no
    // dictionary at all, reached silently and with the download already paid for.
    it('survives a word list served with Windows line endings', () => {
      expect(parseDictionary('HOLD\r\nHOT\r\nTOE\r\n')).toEqual(WORDS)
    })
  })

  describe('backoffDelay', () => {
    // FULL jitter -- uniform over [0, ceiling), not ceiling plus or minus a wobble. Without it a
    // coordinated app update produces a synchronized retry storm, which is the same event one
    // second later. Driven with literal randoms, never Math.random.
    it('is zero at the bottom of the range', () => {
      expect(backoffDelay(0, () => 0)).toEqual(0)
    })

    it('halves the ceiling at the middle of the range', () => {
      expect(backoffDelay(3, () => 0.5)).toEqual(4000)
    })

    // RETRY_FACTOR ** attempt on an absurd stored attempt yields Infinity, and
    // Math.min(60_000, Infinity) is 60_000 -- the cap SATURATES rather than overflowing, so no clamp
    // on `attempt` is needed for correctness.
    //
    // 60_000 rather than the 59_999 the design document asserts: Math.floor(1 * 60_000) is 60_000,
    // and a real Math.random() never returns 1, so 59_999 is a value this function cannot produce.
    it('saturates at the cap rather than overflowing', () => {
      expect(backoffDelay(9, () => 1)).toEqual(RETRY_CAP_MS)
      expect(backoffDelay(1024, () => 1)).toEqual(RETRY_CAP_MS)
    })

    // A committed table, never a generated one: a random property test passes today and fails
    // tomorrow, which this repo forbids outright.
    it.each([0, 1, 2, 3, 5, 8, 13, 21, 1024])('never exceeds the cap at attempt %i', (attempt: number) => {
      expect(backoffDelay(attempt, () => 0.999_999)).toBeLessThanOrEqual(RETRY_CAP_MS)
    })
  })

  describe('scheduleRetry', () => {
    it('starts at attempt one on a device that has never missed', () => {
      const scheduled = scheduleRetry(
        null,
        () => 1_000,
        () => 0.5,
      )

      expect(scheduled).toEqual({ attempt: 1, nextAt: 1500 })
    })

    // The delay is computed from `attempt - 1`, so the FIRST miss waits over [0, 1000) rather than
    // over [0, 2000). Off by one here doubles every wait on the route this design exists to spare.
    it('counts up from the previous attempt', () => {
      const scheduled = scheduleRetry(
        { attempt: 2, nextAt: 0 },
        () => 1_000,
        () => 0.5,
      )

      expect(scheduled).toEqual({ attempt: 3, nextAt: 3000 })
    })
  })

  describe('mayAttempt', () => {
    it('lets a device with no schedule try', () => {
      expect(mayAttempt(null, () => 0)).toBe(true)
    })

    // A CLOCK THAT RAN FAST WROTE THIS, and no run of `scheduleRetry` could have: every nextAt it
    // writes is `now() + [0, RETRY_CAP_MS)`. `isRetryState` cannot see it either -- the number is
    // finite and the shape is right. Without the horizon check the device waits out the skew in real
    // time, which for a phone whose clock read a year ahead while offline is a year of never asking,
    // with nothing on screen but "needs a connection".
    it('tries anyway when the stored schedule is further out than any it could have written', () => {
      const now = (): number => 1_000

      expect(mayAttempt({ attempt: 1, nextAt: now() + RETRY_CAP_MS + 1 }, now)).toBe(true)
    })

    // The boundary from the legitimate side: exactly at the horizon is a schedule `scheduleRetry`
    // could have produced, so it is still honored.
    it('waits out a schedule that lands exactly on the horizon', () => {
      const now = (): number => 1_000

      expect(mayAttempt({ attempt: 1, nextAt: now() + RETRY_CAP_MS }, now)).toBe(false)
    })

    it('holds a device back before its time', () => {
      expect(mayAttempt({ attempt: 1, nextAt: 500 }, () => 499)).toBe(false)
    })

    // AT nextAt, not after it. A strict `>` leaves a device one millisecond short forever if the
    // clock lands exactly on the boundary, which a fake timer does every time.
    it('lets a device try at its time', () => {
      expect(mayAttempt({ attempt: 1, nextAt: 500 }, () => 500)).toBe(true)
    })
  })

  describe('readCachedDictionary', () => {
    // The `hit === undefined` guard, and it needs the console for the same reason the one below
    // does: drop it and `undefined.text()` throws into the catch, which returns the same null. A
    // cache the player has not filled yet is the first run of the app, not a failure.
    it('finds nothing on a device that has never installed one, and says nothing about it', async () => {
      setup()

      expect(await readCachedDictionary()).toBeNull()
      expect(console.error).not.toHaveBeenCalled()
    })

    // Also the clone's test. The cached response is the one fetchDictionary handed to the cache; if
    // it handed over the response it then drained, this read is the second one and the one-shot
    // body rejects.
    it('answers from the cache without a request', async () => {
      const { fetchSpy } = setup()
      fetchSpy.mockResolvedValueOnce(fakeResponse(BODY))
      await fetchDictionary(
        () => 0,
        () => 0,
      )

      const words = await readCachedDictionary()

      expect(words).toEqual(WORDS)
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    // The `typeof caches === 'undefined'` guard, and it needs its own property to defend because the
    // return value alone does not reach it: with the guard deleted, the bare reference to an
    // undeclared global throws a ReferenceError that the surrounding catch turns into the same null.
    // What separates them is the console. A browser with no Cache API is a normal condition, not a
    // failure, so it reports nothing -- and without the guard every call on such a device logs.
    it('finds nothing in the cache with no Cache API at all, and says nothing about it', async () => {
      setup()
      delete (globalThis as { caches?: unknown }).caches

      expect(await readCachedDictionary()).toBeNull()
      expect(console.error).not.toHaveBeenCalled()
    })

    // A cache that throws on read is "no cache", not a crash. The provider calls this first on every
    // mount, so a throw escaping here would white-screen the shell rather than cost one download.
    it('finds nothing when the cache read throws', async () => {
      const { caches: cacheStorage } = setup()
      const cache = await cacheStorage.open(DICT_CACHE_NAME)
      jest.spyOn(cache, 'match').mockRejectedValue(new Error('corrupt'))
      jest.spyOn(cacheStorage, 'open').mockResolvedValue(cache)

      expect(await readCachedDictionary()).toBeNull()
    })
  })

  describe('fetchDictionary', () => {
    it('reads the words off a 200', async () => {
      const { fetchSpy } = setup()
      fetchSpy.mockResolvedValueOnce(fakeResponse(BODY))

      const words = await fetchDictionary(
        () => 0,
        () => 0,
      )

      expect(words).toEqual(WORDS)
    })

    // THE ONE FAILURE A 200 CAN CARRY, and the only service state a caller cannot see: null and a
    // set separate "no dictionary, say so" from "ready", and an empty set reads as ready. Stored, it
    // is permanent -- the URL is version-keyed and immutable, the cleared schedule means nothing
    // tries again, and the worker's activate sweep now protects this cache across deploys. The board
    // would be enabled by a set that rejects every word a player types.
    //
    // Both rows assert all three consequences, because storing it, clearing the schedule and
    // answering `ready` are three different ways to make it permanent and each has its own line.
    it.each<[string, string]>([
      ['an empty body', ''],
      ['a body with nothing but blank lines', '\n  \n\n'],
    ])('treats %s as a miss rather than an empty word list', async (_description, body) => {
      const { caches: cacheStorage, fetchSpy } = setup()
      writeDictRetry({ attempt: 2, nextAt: 5_000 })
      fetchSpy.mockResolvedValueOnce(fakeResponse(body))

      const words = await fetchDictionary(
        () => 0,
        () => 0,
      )

      expect(words).toBeNull()
      expect(await cacheStorage.keys()).not.toContain(DICT_CACHE_NAME)
      expect(readDictRetry()).toEqual({ attempt: 3, nextAt: 0 })
    })

    it('stores them under the version-named cache', async () => {
      const { caches: cacheStorage, fetchSpy } = setup()
      fetchSpy.mockResolvedValueOnce(fakeResponse(BODY))

      await fetchDictionary(
        () => 0,
        () => 0,
      )

      expect(await cacheStorage.keys()).toContain(DICT_CACHE_NAME)
      expect(DICT_CACHE_NAME).toEqual(`${DICT_CACHE_PREFIX}${DICTIONARY_VERSION}`)
    })

    // THE 35-SECOND TIMEOUT, asked for rather than argued about. A bare fetch has none and the axios
    // instance it replaces carries 35_000, so dropping to fetch would quietly give this one request
    // the only unbounded wait in the app -- and a captive portal that accepts the connection and
    // answers nothing would hang it for as long as the tab lives. Every other test in this file
    // passes on an implementation that never asks for a timeout at all, which is why this one names
    // the argument.
    //
    // AND FOLLOWS IT TO `fetch`, which is the half that was missing. Asserting only that
    // `AbortSignal.timeout` was CALLED leaves the whole point of the call unpinned: computing the
    // signal and then calling `fetch(url())` with no options at all passed every one of the 46 tests
    // in this file, which is precisely the regression that restores the unbounded wait this test
    // exists to forbid. The sentinel is asserted by identity, so the signal fetch got is the signal
    // the timeout produced rather than any signal at all.
    it('asks for the timeout it advertises and hands it to the request', async () => {
      const { fetchSpy } = setup()
      fetchSpy.mockResolvedValueOnce(fakeResponse(BODY))

      await fetchDictionary(
        () => 0,
        () => 0,
      )

      expect(AbortSignal.timeout).toHaveBeenCalledWith(DICTIONARY_TIMEOUT_MS)
      expect(fetchSpy).toHaveBeenCalledWith(expect.any(String), { signal: SIGNAL })
    })

    // THE WHOLE VERSION-MIGRATION STORY. The service is the only code that knows which version is
    // current, which is exactly why sw.js deliberately deletes none of them: a v2 deploy downloads
    // once and drops v1 on the same pass.
    it('drops the caches of every other version', async () => {
      const { caches: cacheStorage, fetchSpy } = setup()
      await cacheStorage.open(`${DICT_CACHE_PREFIX}v0`)
      fetchSpy.mockResolvedValueOnce(fakeResponse(BODY))

      await fetchDictionary(
        () => 0,
        () => 0,
      )

      expect(await cacheStorage.keys()).toContain(DICT_CACHE_NAME)
      expect(await cacheStorage.keys()).not.toContain(`${DICT_CACHE_PREFIX}v0`)
    })

    it('leaves a cache that is not a dictionary alone', async () => {
      const { caches: cacheStorage, fetchSpy } = setup()
      await cacheStorage.open('lull-somebuild')
      fetchSpy.mockResolvedValueOnce(fakeResponse(BODY))

      await fetchDictionary(
        () => 0,
        () => 0,
      )

      expect(await cacheStorage.keys()).toContain('lull-somebuild')
    })

    it('forgets the retry schedule when it succeeds', async () => {
      const { fetchSpy } = setup()
      writeDictRetry({ attempt: 4, nextAt: 1 })
      fetchSpy.mockResolvedValueOnce(fakeResponse(BODY))

      await fetchDictionary(
        () => 0,
        () => 0,
      )

      expect(readDictRetry()).toBeNull()
    })

    // THE BRANCH THIS WHOLE DESIGN EXISTS FOR. Positive assertion first: a null return also happens
    // when nothing ran at all.
    it('schedules a retry and stores nothing on a 429', async () => {
      const { caches: cacheStorage, fetchSpy } = setup()
      fetchSpy.mockResolvedValueOnce(fakeResponse('', false))

      const words = await fetchDictionary(
        () => 1_000,
        () => 0.5,
      )

      expect(readDictRetry()).toEqual({ attempt: 1, nextAt: 1500 })
      expect(words).toBeNull()
      expect(await cacheStorage.keys()).not.toContain(DICT_CACHE_NAME)
    })

    // From the device's side "throttled", "offline", "500" and "hung behind a captive portal" are
    // ONE state: no dictionary. There is no separate handling and these two rows are the proof.
    it('takes the same branch on a network failure', async () => {
      const { fetchSpy } = setup()
      fetchSpy.mockRejectedValueOnce(new Error('offline'))

      const words = await fetchDictionary(
        () => 1_000,
        () => 0.5,
      )

      expect(readDictRetry()).toEqual({ attempt: 1, nextAt: 1500 })
      expect(words).toBeNull()
    })

    it('takes the same branch when the timeout fires', async () => {
      const { fetchSpy } = setup()
      fetchSpy.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }))

      const words = await fetchDictionary(
        () => 1_000,
        () => 0.5,
      )

      expect(readDictRetry()).toEqual({ attempt: 1, nextAt: 1500 })
      expect(words).toBeNull()
    })

    it('counts up across misses', async () => {
      const { fetchSpy } = setup()
      fetchSpy.mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline'))

      await fetchDictionary(
        () => 0,
        () => 0,
      )
      await fetchDictionary(
        () => 0,
        () => 0,
      )

      expect(readDictRetry()?.attempt).toEqual(2)
    })

    // THE IN-MEMORY PATH. typeof caches === 'undefined' is jsdom's default and any non-secure
    // context, and the cost of it is one re-download per app open on a browser that has no service
    // worker either and is therefore not running this app installed. The words still come back, and
    // nothing is reported, for the reason readCachedDictionary's twin above gives.
    it('still returns the words with no Cache API at all', async () => {
      const { fetchSpy } = setup()
      delete (globalThis as { caches?: unknown }).caches
      fetchSpy.mockResolvedValueOnce(fakeResponse(BODY))

      const words = await fetchDictionary(
        () => 0,
        () => 0,
      )

      expect(words).toEqual(WORDS)
      expect(console.error).not.toHaveBeenCalled()
    })

    // A cache that throws is "no cache", the same best-effort posture storage.ts takes for writes.
    // The words are what the caller asked for and a storage failure must not cost them.
    it('returns the words when the cache write throws', async () => {
      const { caches: cacheStorage, fetchSpy } = setup()
      jest.spyOn(cacheStorage, 'open').mockRejectedValue(new Error('quota'))
      fetchSpy.mockResolvedValueOnce(fakeResponse(BODY))

      const words = await fetchDictionary(
        () => 0,
        () => 0,
      )

      expect(words).toEqual(WORDS)
    })

    // The prune runs AFTER the put and its own failure must not cost the caller the words either.
    // caches.delete sits outside the cache object the test above disables, so this is a second arm
    // of the same try rather than a restatement of it.
    it('returns the words when the sibling prune throws', async () => {
      const { caches: cacheStorage, fetchSpy } = setup()
      await cacheStorage.open(`${DICT_CACHE_PREFIX}v0`)
      jest.spyOn(cacheStorage, 'delete').mockRejectedValue(new Error('busy'))
      fetchSpy.mockResolvedValueOnce(fakeResponse(BODY))

      const words = await fetchDictionary(
        () => 0,
        () => 0,
      )

      expect(words).toEqual(WORDS)
    })
  })

  // THE DEFAULTS, which every test above bypasses by passing literals -- so nothing above would
  // notice if `= Math.random` quietly became `= () => 0`, and the jitter that keeps a throttled
  // route standing is the whole reason that default is what it is.
  //
  // Spied, never called live: CLAUDE.md forbids a live Date.now or Math.random in a test body, and
  // the property being pinned is WHICH function the default reaches, not what that function
  // returns. restoreMocks puts both back after each test.
  describe('the defaults behind the injected clock and randomness', () => {
    it('jitters off the device randomness when none is passed', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.5)

      expect(backoffDelay(3)).toEqual(4000)
    })

    it('schedules off the device clock and the device randomness when neither is passed', () => {
      jest.spyOn(Date, 'now').mockReturnValue(1_000)
      jest.spyOn(Math, 'random').mockReturnValue(0.5)

      expect(scheduleRetry(null)).toEqual({ attempt: 1, nextAt: 1500 })
    })

    // ASSERTED IN THE TRUE DIRECTION, which is the only one that needs a real clock. Expecting
    // `false` against a nextAt of 500 holds for any default returning under 500 -- including
    // `() => 0`, which is exactly the mutation this block exists to catch, so the row passed on it.
    it('reads the device clock to decide whether a device may try', () => {
      jest.spyOn(Date, 'now').mockReturnValue(501)

      expect(mayAttempt({ attempt: 1, nextAt: 500 })).toBe(true)
    })

    it('records a miss against the device clock when the caller passes neither', async () => {
      const { fetchSpy } = setup()
      jest.spyOn(Date, 'now').mockReturnValue(1_000)
      jest.spyOn(Math, 'random').mockReturnValue(0.5)
      fetchSpy.mockRejectedValueOnce(new Error('offline'))

      const words = await fetchDictionary()

      expect(readDictRetry()).toEqual({ attempt: 1, nextAt: 1500 })
      expect(words).toBeNull()
    })
  })
})
