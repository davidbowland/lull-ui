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

// Today's page flow, moved off <main> so the docked branch below can decline it. Every non-docked
// return is wrapped in this, which is what makes "goFigure and Missing Vowels are untouched" true
// of the rendered page and not just of the code.
// gap-4, which is what this container has always used -- the page's own gap-6 sat on a <main> with
// a single child and so never applied to anything. Taking gap-6 here would have quietly moved
// goFigure and Missing Vowels 8px further apart, and "the other two types are untouched" has to be
// true of the rendered page, not only of the code.
const Flowed = ({ children }: { children: React.ReactNode }): React.ReactNode => (
  <div className="flex w-full flex-col gap-4 py-10">{children}</div>
)

// Said in one place because it is now read in two. Solved ids are never pruned, but progress is
// pruned with the pack it belongs to, so a puzzle solved last week reopens on an empty board.
// Empty progress counts as none: Play again empties a solved board and stores that.
const wasSolvedBefore = (puzzleId: string): boolean =>
  readMeta().solved.includes(puzzleId) && (readProgress(puzzleId) ?? '') === ''

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
  //
  // Not rendered at all under the docked layout, where the header row says it in the space it
  // already occupies -- the phrase cap is 224px at a 390 viewport and 98px at 320, and a banner row
  // would come straight out of it.
  const [wasSolved] = useState(() => wasSolvedBefore(puzzle.id))

  // The shell owns persistence; the board is handed two callbacks and no storage.
  const onProgress = useCallback((next: PuzzleProgress) => writeProgress(puzzle.id, next), [puzzle.id])
  const onSolved = useCallback(() => markSolved(puzzle.id), [puzzle.id])

  // The shell owns the ladder. The board's props are unchanged -- it never learns hints exist, and
  // PuzzleProgress stays an opaque per-type string.
  const hints = hintsOf(puzzle)
  const isDocked = entry.layout === 'docked'

  // Rendered once and placed twice, because WHERE it goes is a layout decision and WHAT it is is
  // not. Under the docked layout it goes ABOVE the board: the keypad is the board's last child and
  // the board fills what is left of the column, so a drawer underneath would push the keypad up by
  // however much the revealed list grows -- and spec decision 7 says the keypad never moves, "not
  // when a hint opens". Above it, the phrase box absorbs the growth instead, which is what the
  // budget's phrase cap is for. Everywhere else it stays where it has always been, under the thing
  // it is a hint about.
  const drawer = hints === null ? null : <HintDrawer compact={isDocked} hints={hints} puzzleId={puzzle.id} />

  return (
    <>
      {wasSolved && !isDocked && (
        <p className="text-[var(--lull-ink-muted)]">You solved this one. Play it again if you like.</p>
      )}
      {isDocked && drawer}
      <Component onProgress={onProgress} onSolved={onSolved} progress={progress} puzzle={puzzle} />
      {!isDocked && drawer}
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
        <Flowed>
          <p className="text-[var(--lull-ink-muted)]" role="status">
            Looking for this puzzle…
          </p>
        </Flowed>
      )
    }

    return (
      <Flowed>
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
      </Flowed>
    )
  }

  const entry = entryFor(puzzle.type)

  if (entry === undefined) {
    return (
      <Flowed>
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
      </Flowed>
    )
  }

  if (entry.layout === 'docked') {
    return (
      // max-h-dvh is the CEILING this column never had. The page's <main> is min-h-dvh, which is a
      // floor: it makes the column at least the viewport and lets it become max(viewport, content),
      // so content taller than the viewport grew the page and scrolled it instead of the phrase cap
      // absorbing the growth. At 320x568 with the drawer open on three rungs the column computes to
      // ~783px in a 568px viewport, and the keypad rides down with it -- which defeats spec decision
      // 7, "the keypad never moves... not when a hint opens", the load-bearing property of this
      // whole layout. Capping HERE rather than on <main> is what keeps the flowed path untouched:
      // the page cannot tell the two apart, because the id is in the URL and the pack is on the
      // device, so only this branch knows.
      //
      // overflow-hidden is the other half and not a tidy-up. Children that overflow a visible box
      // still add scrollable overflow to the viewport, so the cap alone would stop the column
      // growing and leave the page scrolling anyway. Clipped, the pressure has nowhere to go but
      // into the phrase box's flex-1 overflow-y-auto and the drawer's own bound, which is what
      // those were written to absorb.
      //
      // pb-[env(safe-area-inset-bottom)] is the 34px the budget in spec decision 13 reserves and
      // nothing in this repo had ever spent -- the fixed totals of 440 and 470 only add up once it
      // exists. The flowed path clears the iOS home indicator incidentally, through its py-10; this
      // branch has pt-3 and no bottom padding at all, and the keypad is the last flex child, so its
      // bottom row sat under the indicator.
      //
      // It only reserves anything because _app.tsx sends viewport-fit=cover. Without cover iOS
      // insets the layout viewport itself and every env(safe-area-inset-*) resolves to 0 -- which
      // is what this padding did for the whole of its first commit. Cover is page-wide and cannot
      // be scoped to one type (/p/<id> is ONE exported document for all three), so it also lets the
      // flowed path reach the notch in landscape; the page's max(1rem, inset) horizontal padding is
      // the other half of the same change.
      <div className="flex max-h-dvh min-h-0 flex-1 flex-col gap-3 overflow-hidden pt-3 pb-[env(safe-area-inset-bottom)]">
        {/* One compact row instead of an h1 above the board and a Back button below it. Roughly
            180px of chrome the board cannot see, on a page whose phrase cap is 98px at 320. */}
        <div className="flex shrink-0 items-center gap-3">
          {/* Visible label shortened, accessible name kept whole. WCAG 2.5.3 needs the accessible
              name to contain the visible text, and "Back to today's puzzles" contains "Back". */}
          <button
            aria-label="Back to today’s puzzles"
            className="min-h-11 cursor-pointer rounded-full border border-[var(--lull-border)] px-4 text-[var(--lull-ink)]"
            onClick={goHome}
            type="button"
          >
            Back
          </button>
          <h1 className="flex-1 text-lg text-[var(--lull-ink)]">{entry.label}</h1>
          {/* Read during render rather than frozen in state, and that is safe here: PuzzleFrame
              re-renders only when the pack resolution changes, and nothing on this path writes to
              lull:meta or lull:progress between those renders -- the board's writes go through
              PuzzleView, which is keyed and does freeze it. */}
          {wasSolvedBefore(puzzle.id) && (
            <span className="shrink-0 text-sm text-[var(--lull-ink-muted)]">Solved earlier</span>
          )}
        </div>
        <PuzzleView entry={entry} key={puzzle.id} puzzle={puzzle} />
      </div>
    )
  }

  return (
    <Flowed>
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
    </Flowed>
  )
}
