import { Meta, Pack, PackDate, PuzzleProgress } from '@types'
import { packDateOf } from '@utils/pack-dates'

// Ported from connections-ui/src/services/storage.ts. The comments came with it: they
// document behavior, not code.
//
// The prefixes are the FULL keys, not the `lull:` namespace they share with lull:meta.
// A bare `lull:` scan sweeps in meta and progress, and the pattern filters below are the
// other half of the same guarantee.
const PACK_PREFIX = 'lull:pack:'
const PACK_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const PROGRESS_PREFIX = 'lull:progress:'
const META_KEY = 'lull:meta'
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

export const readPack = (date: PackDate): Pack | null => {
  const raw = safeRead(`${PACK_PREFIX}${date}`)
  if (raw === null) return null
  try {
    return JSON.parse(raw) as Pack
  } catch (error: unknown) {
    console.error('storage parse failed', { date, error })
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

export const writeProgress = (puzzleId: string, progress: PuzzleProgress): void => {
  safeWrite(`${PROGRESS_PREFIX}${puzzleId}`, progress)
  announce()
}

export const removeProgress = (puzzleId: string): void => safeRemove(`${PROGRESS_PREFIX}${puzzleId}`)

// Same derived-index rule as packs, validated by the one part of a puzzle id a client
// may read. Pruning walks this list and keys on that date prefix.
export const cachedProgressIds = (): string[] =>
  keysWithPrefix(PROGRESS_PREFIX).filter((puzzleId) => packDateOf(puzzleId) !== null)

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
