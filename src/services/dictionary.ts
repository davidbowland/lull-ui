import { clearDictRetry, readDictRetry, writeDictRetry } from './storage'
import { RetryState } from '@types'

// The version is in the URL, so the response is genuinely immutable: `cache-control: public,
// max-age=31536000, immutable` and the Cache API entry agree and neither is load-bearing on the
// other.
export const DICTIONARY_VERSION = 'v1'

// Matching src/services/lull.ts, and not a number chosen fresh. `fetch` has no timeout of its own
// and the axios instance this replaces carries 35_000, so a bare fetch would quietly give this one
// request the only unbounded wait in the app.
export const DICTIONARY_TIMEOUT_MS = 35_000

// The prefix is what stops the exemption in public/sw.js drifting into a hard-coded 'lull-dict-v1'
// in two places.
export const DICT_CACHE_PREFIX = 'lull-dict-'
export const DICT_CACHE_NAME = `${DICT_CACHE_PREFIX}${DICTIONARY_VERSION}`

export const RETRY_BASE_MS = 1_000
export const RETRY_FACTOR = 2
export const RETRY_CAP_MS = 60_000

const url = (): string => `${process.env.NEXT_PUBLIC_LULL_API_BASE_URL}/dictionary/${DICTIONARY_VERSION}`

// One uppercase word per line, sorted, every entry 3-7 letters. BLANK LINES DROPPED rather than
// stored, because an empty string in the set would make everyWordInDictionary true for a word that
// split to nothing -- the exact clause is-valid-guess.ts calls load-bearing.
export const parseDictionary = (text: string): ReadonlySet<string> =>
  new Set(
    text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  )

// FULL jitter -- uniform over [0, ceiling), not ceiling plus or minus a wobble. Without it a
// coordinated app update produces a synchronized retry storm, which is the same event one second
// later, against a route throttled at 2 requests per second across ALL callers.
//
// `random` is injected with a default because CLAUDE.md requires it: a value from Math.random that
// affects an outcome has to be drivable from a test as a literal.
//
// RETRY_FACTOR ** attempt on an absurd stored attempt yields Infinity, and Math.min(60_000,
// Infinity) is 60_000 -- the cap saturates rather than overflowing, so no clamp on `attempt` is
// needed for correctness. It is validated in storage.ts anyway, because a NaN nextAt would make
// mayAttempt false forever.
export const backoffDelay = (attempt: number, random: () => number = Math.random): number =>
  Math.floor(random() * Math.min(RETRY_CAP_MS, RETRY_BASE_MS * RETRY_FACTOR ** attempt))

// The FIRST miss waits over [0, RETRY_BASE_MS), which is why the delay is computed from
// `attempt - 1`. Off by one here doubles every wait on the route this design exists to spare.
export const scheduleRetry = (
  previous: RetryState | null,
  now: () => number = Date.now,
  random: () => number = Math.random,
): RetryState => {
  const attempt = (previous?.attempt ?? 0) + 1
  return { attempt, nextAt: now() + backoffDelay(attempt - 1, random) }
}

// AT nextAt, not after it. A strict `>` leaves a device one millisecond short forever if the clock
// lands exactly on the boundary.
//
// AND A nextAt FURTHER OUT THAN THE CAP IS TREATED AS NO SCHEDULE, because `scheduleRetry` cannot
// produce one: every value it writes is `now() + [0, RETRY_CAP_MS)`. A stored nextAt beyond that was
// written against a different clock than the one reading it -- a phone whose clock ran fast while
// offline, which is ordinary, not hostile. `isRetryState` cannot catch it, since the number is
// perfectly finite; only this comparison knows what a legitimate horizon looks like. Without it the
// device waits out the skew in real time: a clock nine years fast starves the route for nine years,
// silently, with the shelf saying only that Phrazle needs a connection.
export const mayAttempt = (state: RetryState | null, now: () => number = Date.now): boolean =>
  state === null || now() >= state.nextAt || state.nextAt > now() + RETRY_CAP_MS

// EVERY cache call degrades to "no cache", which is the same best-effort posture storage.ts takes
// for writes. `typeof caches === 'undefined'` is jsdom's default and any non-secure context; the
// cost is one re-download per app open on a browser that has no service worker either and is
// therefore not running this app installed.
const openDictCache = async (): Promise<Cache | null> => {
  try {
    if (typeof caches === 'undefined') return null
    return await caches.open(DICT_CACHE_NAME)
  } catch (error: unknown) {
    console.error('dictionary cache unavailable', { error })
    return null
  }
}

export const readCachedDictionary = async (): Promise<ReadonlySet<string> | null> => {
  const cache = await openDictCache()
  if (cache === null) return null

  try {
    const hit = await cache.match(url())
    if (hit === undefined) return null
    return parseDictionary(await hit.text())
  } catch (error: unknown) {
    console.error('dictionary cache read failed', { error })
    return null
  }
}

// THE ONLY CODE THAT KNOWS WHICH VERSION IS CURRENT, which is exactly why public/sw.js deliberately
// deletes no dictionary cache at all. A v2 deploy downloads once and drops v1 on the same pass, and
// that is the whole version-migration story.
const store = async (response: Response): Promise<void> => {
  const cache = await openDictCache()
  if (cache === null) return

  try {
    await cache.put(url(), response)
    const keys = await caches.keys()
    await Promise.all(
      keys
        .filter((key) => key.startsWith(DICT_CACHE_PREFIX) && key !== DICT_CACHE_NAME)
        .map((key) => caches.delete(key)),
    )
  } catch (error: unknown) {
    console.error('dictionary cache write failed', { error })
  }
}

// ONE branch for every failure, and that is the design rather than a shortcut: from the device's
// side "throttled", "offline", "500", "retired version" and "hung behind a captive portal" are one
// state -- no dictionary -- and routing any of them elsewhere would mean a second retry policy for
// a condition indistinguishable from the first. Nothing here reads response.status; response.ok is
// the whole test.
//
// A 400 "Invalid dictionary version" takes it too, and retrying that forever is useless but right:
// the only way to get one is for this build's DICTIONARY_VERSION to name a version the API has
// retired, and the fix is a deploy. The backoff caps at 60s with full jitter, so the cost of being
// wrong is one request a minute per affected device -- the throttle's design load rather than an
// incident.
//
// AbortSignal.timeout itself is inside the try, which is deliberate: on an engine that does not
// implement it the call throws, and that throw takes the same branch as the timeout it was asking
// for. A device on such a browser gets no dictionary and backs off, rather than a white screen.
export const fetchDictionary = async (
  now: () => number = Date.now,
  random: () => number = Math.random,
): Promise<ReadonlySet<string> | null> => {
  try {
    // fetch, not the axios instance in lull.ts. Two structural reasons: caches.put takes a Response
    // and axios returns a parsed body with no Response to store, and the non-2xx is the branch this
    // whole design is built for -- one property read here, where axios turns it into a thrown error
    // whose shape has to be unwrapped. lull.ts is untouched.
    const response = await fetch(url(), { signal: AbortSignal.timeout(DICTIONARY_TIMEOUT_MS) })
    if (!response.ok) {
      writeDictRetry(scheduleRetry(readDictRetry(), now, random))
      return null
    }

    // PARSED BEFORE IT IS STORED, and that order is the whole of the guard below. An empty word set
    // is the one failure a 200 can carry, and caching it is permanent: the URL is version-keyed and
    // immutable, `clearDictRetry` would wipe the schedule that would have tried again, and the
    // service worker's activate sweep is now told to KEEP this cache across every deploy. Nothing
    // re-fetches it. The board would then be enabled by a set that rejects every word a player can
    // type -- on, silent about why, and unrecoverable short of clearing site data.
    //
    // It is also the one state a caller cannot see. `null` and a set are what separate "no
    // dictionary, say so" from "ready"; an empty set reads as ready. So it takes the failure branch
    // like any other, and the route's own contract is the floor -- 51,852 words, so zero is not a
    // short list, it is a body that was not a word list.
    // CLONED BEFORE THE BODY IS READ, AND THIS LINE HAS TO STAY ABOVE THE `text()` BELOW. A Response
    // body is a one-shot stream and `clone()` THROWS `TypeError` once it is disturbed -- it does not
    // return a stale copy, it fails. Cloning after the read sends every successful 200 into the
    // outer catch, which logs a fetch failure, schedules a retry and returns null, so the word list
    // never loads on any device and Phrazle is permanently unplayable while the API answers
    // perfectly.
    //
    // NOTHING IN THIS SUITE CAN CATCH THAT, which is why the order is spelled out rather than left
    // to the reader. Every fixture here builds a fake Response whose `clone` hands back a fresh
    // object with an untouched body, so the fakes are the one implementation of Response that does
    // not have the behavior this line exists for. Verified against undici directly rather than
    // against a test.
    const forCache = response.clone()
    const words = parseDictionary(await response.text())
    if (words.size === 0) {
      console.error('dictionary fetch returned no words', { url: url() })
      writeDictRetry(scheduleRetry(readDictRetry(), now, random))
      return null
    }

    await store(forCache)
    clearDictRetry()
    return words
  } catch (error: unknown) {
    console.error('dictionary fetch failed', { error })
    writeDictRetry(scheduleRetry(readDictRetry(), now, random))
    return null
  }
}
