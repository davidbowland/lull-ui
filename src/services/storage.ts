import { Meta, Pack, PackDate, Puzzle, PuzzleProgress, RetryState } from '@types'

// Ported from connections-ui/src/services/storage.ts. The comments came with it: they
// document behavior, not code.
//
// The prefixes are the FULL keys, not the `lull:` namespace they share with lull:meta.
// A bare `lull:` scan sweeps in meta and progress, and the pattern filter on the one
// family that IS scanned -- packs -- is the other half of the same guarantee. The
// progress and hints prefixes are addressed key by key and never scanned; see the note
// where their read side used to be.
const PACK_PREFIX = 'lull:pack:'
const PACK_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const PROGRESS_PREFIX = 'lull:progress:'
const HINTS_PREFIX = 'lull:hints:'
const META_KEY = 'lull:meta'

// A SINGLE FIXED KEY, like lull:meta, not a scanned family -- so it needs no date pattern, because
// nothing scans it. Checked rather than assumed: it starts with none of `lull:pack:`,
// `lull:progress:` or `lull:hints:`, so every prefix scan in this file misses it -- and
// pruneOutsideWindow, which now scans `lull:pack:` and nothing else, was never going to reach it
// either way. That is correct -- the retry schedule is about the DEVICE, not about a day.
const DICT_RETRY_KEY = 'lull:dict:retry'

const VERSION = 1

// localStorage tells this tab nothing about its own writes -- the native storage event
// fires only in *other* tabs. Anything that renders a count or a solved marker off
// these keys therefore has to be told, or it keeps painting the first read it ever
// made: usePrefetch fills the device seconds after mount, and markSolved lands on a
// win, and neither moves a route, a connection, or a visibility state.
export const STORAGE_EVENT = 'lull:storage'

// A factory, not a constant. Handing out one shared object means the first caller
// to push onto meta.solved corrupts every later read for the life of the page.
const emptyMeta = (): Meta => ({ installDismissed: false, solved: [], v: VERSION })

// Every write is best-effort. Storage can be full, disabled, or partitioned, and
// none of those are worth showing the player an error over -- the app still works,
// it just forgets.
const safeWrite = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value)
  } catch (error: unknown) {
    console.error('storage write failed', { error, key })
  }
}

// Announced after the write, never before: a listener re-reads storage synchronously,
// so firing first would hand it the state it was told had changed.
const announce = (): void => void window.dispatchEvent(new Event(STORAGE_EVENT))

const safeRead = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key)
  } catch (error: unknown) {
    console.error('storage read failed', { error, key })
    return null
  }
}

const safeRemove = (key: string): void => {
  try {
    window.localStorage.removeItem(key)
  } catch (error: unknown) {
    console.error('storage remove failed', { error, key })
  }
}

// The window.localStorage getter itself throws SecurityError when cookies are blocked,
// so the property access has to sit inside the try. This runs during render with no
// error boundary above it -- an escaping throw white-screens the app.
const keysWithPrefix = (prefix: string): string[] => {
  try {
    return Object.keys(window.localStorage)
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length))
  } catch (error: unknown) {
    console.error('storage list failed', { error })
    return []
  }
}

// Packs

// A pack is JSON off the network that was persisted. `JSON.parse(raw) as Pack` asserts a
// shape rather than testing one, so a malformed or hostile payload used to reach the
// shelf's `pack.puzzles.toSorted(...)` and throw during render -- and with no error
// boundary the root unmounts to a white page. Worse, the bad value is on disk, so every
// later load re-read it and crashed again, offline included.
//
// Checked here rather than only in the API client because the shelf and the frame both
// call readPack directly; this is the choke point every consumer shares.
//
// Structural, not exhaustive: it checks what the shell dereferences, not what a puzzle
// type means. `data` stays opaque -- interpreting it belongs to the component.
const isValidPuzzle = (value: unknown): value is Puzzle => {
  if (typeof value !== 'object' || value === null) return false
  const puzzle = value as Record<string, unknown>
  return (
    typeof puzzle.id === 'string' &&
    typeof puzzle.type === 'string' &&
    typeof puzzle.difficulty === 'number' &&
    typeof puzzle.estimatedSeconds === 'number' &&
    typeof puzzle.data === 'object' &&
    puzzle.data !== null
  )
}

export const isValidPack = (value: unknown, date: PackDate): value is Pack => {
  if (typeof value !== 'object' || value === null) return false
  const pack = value as Record<string, unknown>
  return (
    pack.date === date &&
    typeof pack.complete === 'boolean' &&
    Array.isArray(pack.puzzles) &&
    pack.puzzles.every(isValidPuzzle)
  )
}

export const readPack = (date: PackDate): Pack | null => {
  const raw = safeRead(`${PACK_PREFIX}${date}`)
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isValidPack(parsed, date)) {
      // Self-healing: drop it rather than hand it on, or the crash repeats on every load
      // with no request able to replace it.
      console.error('discarding a malformed stored pack', { date })
      safeRemove(`${PACK_PREFIX}${date}`)
      announce()
      return null
    }
    return parsed
  } catch (error: unknown) {
    // Removed, not just reported. cachedPackDates derives its index from the KEYS, so a
    // key whose value will never parse keeps being listed and keeps being chosen -- and
    // the shelf, which takes the newest candidate, would show "No puzzles on this
    // device" permanently while six good packs sat beside it. Offline nothing can
    // overwrite it, which is exactly when the offline promise is supposed to hold.
    console.error('storage parse failed, discarding', { date, error })
    safeRemove(`${PACK_PREFIX}${date}`)
    announce()
    return null
  }
}

export const writePack = (date: PackDate, pack: Pack): void => {
  safeWrite(`${PACK_PREFIX}${date}`, JSON.stringify(pack))
  announce()
}

export const removePack = (date: PackDate): void => {
  safeRemove(`${PACK_PREFIX}${date}`)
  announce()
}

// Derived, never stored. A stored index drifts: iOS evicts localStorage wholesale
// after seven idle days, and a write that fails under quota pressure would leave
// the index claiming a pack that is gone. The keys cannot lie -- but only with the
// full prefix above AND the pattern check here.
export const cachedPackDates = (): PackDate[] =>
  keysWithPrefix(PACK_PREFIX)
    .filter((date) => PACK_DATE_PATTERN.test(date))
    .toSorted()
    .toReversed()

// Progress

// Stored and returned verbatim. The shell never interprets this -- goFigure puts an
// expression here, a later type will put something else, and neither is the shell's
// business.
export const readProgress = (puzzleId: string): PuzzleProgress | null => safeRead(`${PROGRESS_PREFIX}${puzzleId}`)

// THE ONLY BOUND ON A VALUE NOTHING ELSE BOUNDS. Progress is whatever a board hands over, and two
// boards -- Missing Vowels and Cryptic Clue -- hand over the contents of a bare <input> with no
// maxLength, so a paste is a paste of any size. That used to be self-correcting: the key was
// collected within seven days. Nothing collects progress by age any more, so an unbounded value is
// now permanent, and safeWrite deliberately swallows QuotaExceededError -- which turns a filled
// origin into "the app quietly stops caching anything", packs included, with only a console line to
// say so.
//
// 8192 characters, measured against the largest value any board legitimately writes. Phrazle is the
// only one storing JSON, bounded at MAX_STORED = 25 canonical guesses (see phrazle/progress.ts), and
// 25 guesses of a 26-character phrase encode to 738 characters -- ~1.5KB stored, since localStorage
// holds UTF-16. That is better than ten times the headroom, and the cap itself is ~16KB stored: room
// for a board nobody has designed yet, and still small enough that one pathological key cannot crowd
// out a week of packs.
const MAX_PROGRESS_LENGTH = 8192

export const writeProgress = (puzzleId: string, progress: PuzzleProgress): void => {
  // REFUSED, NOT TRUNCATED, and left alone rather than removed. A truncated value is a board state
  // no board ever wrote -- Phrazle would read back JSON that stops mid-string, Cryptogram half a
  // mapping -- and that reads to a player as the app corrupting their board rather than declining to
  // grow it. Keeping the previous value means the worst case is a board that stops saving, which is
  // what every other failure in this file already degrades to.
  if (progress.length > MAX_PROGRESS_LENGTH) {
    console.error('storage write refused, progress too long', { length: progress.length, puzzleId })
    return
  }
  safeWrite(`${PROGRESS_PREFIX}${puzzleId}`, progress)
  announce()
}

// THERE IS NO removeProgress AND NO cachedProgressIds, and both are absent deliberately. They were
// the remove and the read halves of a collector that no longer exists: pruning walked
// cachedProgressIds and keyed on the date prefix of each id, until a player could reach a day older
// than the retention window -- see writeHints below for the argument, which is the same one. The
// collector went, and a tested export with no caller is a contract nobody signed, so they went with
// it. Starting a puzzle over does not need a remove either: a board's Play again writes `''` through
// onProgress, and empty progress reads as no progress everywhere it is read.
//
// The day this family genuinely needs collecting, do not restore either of these first. The rule has
// to be "oldest first, under pressure", which wants sizes and a budget rather than a filtered list
// of ids -- see the block above pruneOutsideWindow in usePrefetch.ts.

// Hints

// The REVEALED COUNT, not a set: reveal is strictly sequential, so one integer says everything a
// set would.
//
// Written independently of solve state and never cleared by solving, so reopening a solved puzzle
// shows the rungs the player opened.
//
// NOTHING COLLECTS THIS PREFIX BY AGE, AND THAT IS DELIBERATE -- do not add it back. usePrefetch
// pruned `lull:hints:` and `lull:progress:` on the date prefix of the puzzle id, which was safe only
// while no day older than the retention window could be opened: an old day held nothing, so nothing
// old could be lost. The day a player could reach back past the window, that same rule started
// deleting the board and the paid-for rungs of a puzzle they were in the middle of, on the next
// open. Keeping both families rests on the argument lull:meta.solved already rests on: one integer
// here and a couple of hundred bytes there, against a pack's kilobytes a day. See the block above
// pruneOutsideWindow in usePrefetch.ts for the measured version, including what it costs at ten
// years and what would have to change first.
//
// What DOES remove a key here is removeHints, called by the shell when a board reports onReset. A
// player who starts a puzzle over gives up the ladder; a player who walks away for a month does not.
export const writeHints = (puzzleId: string, revealed: number): void => {
  safeWrite(`${HINTS_PREFIX}${puzzleId}`, `${revealed}`)
  announce()
}

// Validated the way readPack is -- parse, validate, self-heal -- and NOT the way readProgress is,
// which is a bare safeRead with no validation at all. Progress is free text a board wrote and any
// string is a state its own input could have reached; a reveal count is an integer the shell
// indexes a ladder with, so a NaN or a 7 would open rungs that do not exist.
//
// The bound is `hintCount + 1`, and the extra one is the ANSWER rather than a fourth rung. The bar
// spends every rung and then offers "Show answer", which stores one past the ladder -- a count no
// `hints[]` index is ever taken from, so nothing downstream dereferences it. Under the old bound
// that value was not merely refused: this function SELF-HEALS, so the write below would have put a
// 0 on disk and taken back the three rungs the player had paid for as well as the answer.
//
// It also makes the stored count FORWARD-ONLY. A build with the old bound reading a 4 discards it
// and rewrites 0, so rolling back loses the ladder for anyone who had revealed an answer.
export const readHints = (puzzleId: string, hintCount: number): number => {
  const raw = safeRead(`${HINTS_PREFIX}${puzzleId}`)
  if (raw === null) return 0

  const revealed = Number.parseInt(raw, 10)
  const isUsable = Number.isInteger(revealed) && revealed >= 0 && revealed <= hintCount + 1
  if (isUsable) return revealed

  // Rewritten, not just reported. The bad value is on disk, so leaving it means every later load
  // re-reads it, offline included.
  console.error('discarding a malformed stored hint count', { puzzleId, raw })
  writeHints(puzzleId, 0)
  return 0
}

export const removeHints = (puzzleId: string): void => {
  safeRemove(`${HINTS_PREFIX}${puzzleId}`)
  announce()
}

// THERE IS NO cachedHintIds either, and it is absent for the reason cachedProgressIds is: it
// indexed this family for the collector, and the collector is gone. Puzzle ids carry a random
// shortId, so a regenerated pack never reuses one -- a stale hint key orphans rather than collides,
// and nothing collects it, by the argument above. An orphan is one integer kept forever, which is
// the price of never taking a rung away from a player who was still using it.

// The dictionary's retry schedule

// Persisted so a device that closed the tab mid-wait does not restart at zero on reopen. That is
// the difference between backoff and a delay.
//
// A NaN nextAt is the case this guard is really for. `mayAttempt` compares `now() >= state.nextAt`
// and every comparison against NaN is false, so a NaN would stop the device retrying for the life
// of the install -- silently, with no error anywhere. It is reachable: JSON.stringify writes NaN as
// `null`, and a hand-edited key can hold anything.
const isRetryState = (value: unknown): value is RetryState => {
  if (typeof value !== 'object' || value === null) return false
  const state = value as Record<string, unknown>
  return (
    Number.isInteger(state.attempt) &&
    (state.attempt as number) >= 0 &&
    // `Number.isFinite` IS THE WHOLE nextAt GUARD. It does not coerce, so it already refuses a
    // string, a null, an undefined and an object -- everything a `typeof === 'number'` clause beside
    // it would have refused, which is why that clause was deleted rather than kept: no fixture could
    // redden it, and the compiler narrows without it.
    Number.isFinite(state.nextAt)
  )
}

// SELF-HEALS BY REMOVING, the way readPack does, and NOT by rewriting the way readHints does. A
// hint count has a meaningful zero to fall back to and a retry schedule does not: the honest
// fallback for a corrupt one is "no schedule", which is null, which is mayAttempt returning true.
// Remove it and let the next attempt write a fresh record.
export const readDictRetry = (): RetryState | null => {
  const raw = safeRead(DICT_RETRY_KEY)
  if (raw === null) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRetryState(parsed)) {
      console.error('discarding a malformed stored retry schedule', { raw })
      safeRemove(DICT_RETRY_KEY)
      return null
    }
    return parsed
  } catch (error: unknown) {
    console.error('retry schedule parse failed, discarding', { error })
    safeRemove(DICT_RETRY_KEY)
    return null
  }
}

// NOT ANNOUNCED, unlike every other writer in this file, and the difference is not an oversight.
// announce() exists so this tab learns about its own writes for anything that RENDERS off a key,
// and nothing renders off this one -- the provider holds its status in React state. Announcing
// would also re-enter the provider's own STORAGE_EVENT listener from inside its own failure
// branch, which is a loop waiting for a reason.
export const writeDictRetry = (state: RetryState): void => {
  safeWrite(DICT_RETRY_KEY, JSON.stringify(state))
}

// Called on a successful install, so a device that recovers does not carry a 60-second floor into
// its next miss.
export const clearDictRetry = (): void => {
  safeRemove(DICT_RETRY_KEY)
}

// Meta

export const readMeta = (): Meta => {
  const raw = safeRead(META_KEY)
  if (raw === null) return emptyMeta()
  try {
    const parsed = JSON.parse(raw) as Partial<Meta>
    if (parsed.v !== VERSION) return emptyMeta()
    return {
      installDismissed: parsed.installDismissed === true,
      // Anything JSON can hold reaches this. A bare string would satisfy both
      // includes() and the spread in markSolved, silently and wrongly.
      solved: Array.isArray(parsed.solved) ? parsed.solved : [],
      v: VERSION,
    }
  } catch (error: unknown) {
    console.error('storage parse failed', { error, key: META_KEY })
    return emptyMeta()
  }
}

const writeMeta = (meta: Meta): void => safeWrite(META_KEY, JSON.stringify(meta))

// Solved ids are never pruned. They are a few bytes each, so history outlives the pack
// payloads it names: an old solved puzzle still shows as solved and re-downloads if
// opened.
export const markSolved = (puzzleId: string): void => {
  const meta = readMeta()
  if (meta.solved.includes(puzzleId)) return
  writeMeta({ ...meta, solved: [...meta.solved, puzzleId] })
  announce()
}

export const setInstallDismissed = (dismissed: boolean): void =>
  writeMeta({ ...readMeta(), installDismissed: dismissed })
