import { useRouter } from 'next/router'
import React, { useCallback, useEffect, useState } from 'react'

import { HintDrawer } from '@components/hint-drawer'
import { entryFor, RegistryEntry, UNKNOWN_TYPE_MESSAGE } from '@registry'
import { fetchPack } from '@services/lull'
import { markSolved, readMeta, readPack, readProgress, writeProgress } from '@services/storage'
import { Pack, Puzzle, PuzzleProgress } from '@types'
import { hintsOf } from '@utils/hints'
import { packDateOf } from '@utils/pack-dates'

export interface PuzzleFrameProps {
  puzzleId?: string
}

interface Resolution {
  isSettled: boolean
  pack: Pack | null
}

interface PuzzleViewProps {
  entry: RegistryEntry
  puzzle: Puzzle
}

// Mounted fresh per puzzle -- the frame keys it on the id -- so everything read at
// arrival can be read in a state initializer and stay put while the board is played.
const PuzzleView = ({ entry, puzzle }: PuzzleViewProps): React.ReactNode => {
  const { Component } = entry
  // Read once. The board restores from it at mount and owns it from then on; re-reading
  // storage on every render would hand the board back its own writes.
  const [progress] = useState(() => readProgress(puzzle.id))
  // Solved ids are never pruned, but progress is pruned with the pack it belongs to, so
  // a puzzle solved last week reopens on an empty board. Frozen at arrival: winning
  // right now is the board's own news to announce, and a second banner appearing
  // underneath the first would say it twice.
  //
  // Gated on there being no stored progress as well. Within the retention window a
  // solved puzzle still holds its winning expression, so the board restores it and
  // announces "Solved." itself -- rendering the banner too would say it twice, which is
  // the doubling this freeze exists to avoid.
  //
  // Empty progress counts as none. Play again empties a solved board and stores that, so
  // an empty string here means the player wiped it, not that they left one keystroke in:
  // the board comes up blank and says nothing, and the banner is then the only thing that
  // knows this puzzle is already in the bag.
  const [wasSolved] = useState(() => readMeta().solved.includes(puzzle.id) && (readProgress(puzzle.id) ?? '') === '')

  // The shell owns persistence; the board is handed two callbacks and no storage.
  const onProgress = useCallback((next: PuzzleProgress) => writeProgress(puzzle.id, next), [puzzle.id])
  const onSolved = useCallback(() => markSolved(puzzle.id), [puzzle.id])

  // The shell owns the ladder. The board's props are unchanged -- it never learns hints exist, and
  // PuzzleProgress stays an opaque per-type string.
  const hints = hintsOf(puzzle)

  return (
    <>
      {wasSolved && <p className="text-[var(--lull-ink-muted)]">You solved this one. Play it again if you like.</p>}
      <Component onProgress={onProgress} onSolved={onSolved} progress={progress} puzzle={puzzle} />
      {hints !== null && <HintDrawer hints={hints} puzzleId={puzzle.id} />}
    </>
  )
}

export const PuzzleFrame = ({ puzzleId }: PuzzleFrameProps): React.ReactNode => {
  const router = useRouter()
  const [resolution, setResolution] = useState<Resolution | null>(null)

  // The date prefix is the ONE part of a puzzle id a client may read. The rest
  // (`${type}:${shortId}`) is opaque: it is matched against the pack's own ids and
  // never taken apart, indexed with, or ordered by.
  const date = puzzleId === undefined ? null : packDateOf(puzzleId)

  useEffect(() => {
    if (date === null) {
      // An id with no date names no pack, so there is nothing to ask the network for.
      setResolution({ isSettled: puzzleId !== undefined, pack: null })
      return
    }

    let abandoned = false

    // Painted from the device first, so a puzzle already here appears without waiting
    // on a request that cannot change the answer.
    setResolution({ isSettled: false, pack: readPack(date) })

    const load = async (): Promise<void> => {
      let fetched: Pack | null = null
      try {
        // Cache-first: a complete stored pack is answered without a request, and an
        // incomplete one is asked again because the day can still fill in.
        fetched = await fetchPack(date)
      } catch (error: unknown) {
        // Offline, or a day that was never generated. Either way the cache below is
        // the last word, and there is nothing to show a reader that the missing-puzzle
        // message does not already say.
        console.error('pack fetch failed', { date, error })
      }
      if (abandoned) return
      // Re-read FIRST, because the request took real time and the prefetch or another
      // tab may have filled the day meanwhile -- but fall back to what we just fetched.
      // storage.ts swallows write failures on purpose, so when localStorage throws
      // (cookies blocked, partitioned context, quota exhausted) writePack no-ops and
      // readPack returns null. Trusting the re-read alone would answer a SUCCESSFUL
      // fetch with "That puzzle isn't here" and leave the app permanently broken while
      // blaming the link.
      setResolution({ isSettled: true, pack: readPack(date) ?? fetched })
    }
    void load()

    return () => {
      abandoned = true
    }
  }, [date, puzzleId])

  const goHome = (): void => void router.push('/')

  // Rendered in Node at build time and shipped as HTML to everyone, so nothing above
  // this line may read the device. The page resolves the id out of window.location in
  // an effect of its own, so this is also the frame before the id arrives -- painting
  // "not here" there would accuse every deep link of being broken.
  if (resolution === null) return <div aria-hidden="true" className="min-h-[420px]" />

  const puzzle = resolution.pack?.puzzles.find((candidate) => candidate.id === puzzleId)

  if (puzzle === undefined) {
    if (!resolution.isSettled) {
      return (
        <p className="text-[var(--lull-ink-muted)]" role="status">
          Looking for this puzzle…
        </p>
      )
    }

    return (
      <section className="flex flex-col items-start gap-4">
        <h1 className="text-2xl text-[var(--lull-ink)]">That puzzle isn’t here</h1>
        <p className="text-[var(--lull-ink-muted)]">
          It may have been cleared to make room for newer ones, or the link may be wrong.
        </p>
        <button
          className="min-h-11 cursor-pointer rounded-full border border-[var(--lull-border)] px-4 text-[var(--lull-ink)]"
          onClick={goHome}
          type="button"
        >
          Back to today’s puzzles
        </button>
      </section>
    )
  }

  const entry = entryFor(puzzle.type)

  if (entry === undefined) {
    return (
      <section className="flex flex-col items-start gap-4">
        <h1 className="text-2xl text-[var(--lull-ink)]">{UNKNOWN_TYPE_MESSAGE}</h1>
        <button
          className="min-h-11 cursor-pointer rounded-full border border-[var(--lull-border)] px-4 text-[var(--lull-ink)]"
          onClick={goHome}
          type="button"
        >
          Back to today’s puzzles
        </button>
      </section>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl text-[var(--lull-ink)]">{entry.label}</h1>
      {/* Keyed on the id, so opening a different puzzle is a different component rather
          than a prop change -- the board restores its state at mount and would otherwise
          keep the previous puzzle's tiles. */}
      <PuzzleView entry={entry} key={puzzle.id} puzzle={puzzle} />
      <div>
        <button
          className="min-h-11 cursor-pointer rounded-full border border-[var(--lull-border)] px-4 text-[var(--lull-ink)]"
          onClick={goHome}
          type="button"
        >
          Back to today’s puzzles
        </button>
      </div>
    </div>
  )
}
