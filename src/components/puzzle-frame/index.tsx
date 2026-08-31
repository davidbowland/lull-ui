import React, { useCallback, useEffect, useState } from 'react'

import { useDictionary } from '@components/dictionary-provider'
import { HintBar } from '@components/hint-bar'
import { Crumb, Spine } from '@components/spine'
import { entryFor, RegistryEntry, UNKNOWN_TYPE_MESSAGE } from '@registry'
import { fetchPack } from '@services/lull'
import { markSolved, readMeta, readPack, readProgress, removeHints, writeProgress } from '@services/storage'
import { Pack, PackDate, Puzzle, PuzzleProgress } from '@types'
import { crumbLabel } from '@utils/date-labels'
import { answerOf, hintsOf } from '@utils/hints'
import { difficultyLabel, lengthLabel } from '@utils/labels'
import { packDateOf, toPackDate } from '@utils/pack-dates'

export interface PuzzleFrameProps {
  locale?: string
  // INJECTED, and handed to crumbLabel below. That label adds a year only when the day's year
  // differs from the current one, so a bare call reads the wall clock -- which this repo's
  // non-determinism rule forbids and which no test can pin. The default is the real mount site's
  // answer -- pages/p/[puzzleId] passes nothing -- and unlike the shelf's it needs no freezing:
  // both readings on this surface are in the crumb, one for its label and one for its href (see
  // dayHref), and a midnight between them changes neither answer. No effect depends on it.
  now?: () => number
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

interface DeadEndProps {
  children: React.ReactNode
  trail: Crumb[]
}

// Node 24 defines globalThis.navigator, so the export build reads the build machine's ICU
// default rather than throwing. That is still the wrong language for everyone else, which is
// why nothing formatted with it survives the first render: the frame paints a placeholder
// until an effect has run on the device.
const defaultLocale = (): string => globalThis.navigator?.language ?? 'en-US'

// THE THIRD `dayLabel` IS GONE. This file kept a private one producing what @utils/date-labels calls
// crumbLabel -- the short cut, for the middle crumb of "Lull > ... > Missing Vowels" in a 40px bar
// that has to survive a 320px viewport, where "Tuesday, August 18" would spend the whole bar on the
// crumb nobody came for. That file's own header said the two must stay in step, and they did not:
// crumbLabel grew a year for a day outside the reader's current year and this copy did not, so from
// 2027-01-01 the shelf's crumb read "Lull > Sat, 14 Mar 2026" and the puzzle's read
// "Lull > Sat, 14 Mar > Cryptogram" -- one day, two spellings, one trail, activating on a date
// certain with no deploy in between. Importing the shared one is what makes that unrepeatable.
//
// The breadcrumb, in place of the Back button every surface used to carry. A crumb with no
// href is the page you are on, so the trail stops at the last thing actually known: a dead end
// names the day but never the puzzle, because not knowing what the puzzle was is the whole
// reason it is a dead end.
//
// LULL AND THE DAY POINT AT THE SAME ADDRESS ONLY WHEN THE DAY IS TODAY. `/` is today's shelf and
// nothing else. They were one address for as long as today was the only day a player could reach,
// and this crumb was written to say so -- so the moment `/?d=` shipped, the way back out of an
// August 18th puzzle became a way back to today, on every bench, with the crumb still reading
// "Tue, Aug 18". The day crumb has to name the day it spells.
//
// NOT `/?d=${date}` unconditionally, because the shelf's own selectDay pushes `/` for today and
// `/?d=` for anything else. A crumb spelling the parameter for today would hand back an address
// the shelf replaces on arrival, which is one history entry Back has to be pressed through twice.
//
// The clock is read once here and once inside crumbLabel, and the two cannot disagree in any way a
// reader could see: crossing midnight between them would spell a year onto a day whose href had
// just been decided a moment earlier under the same date, which is the same answer either way.
const dayHref = (date: PackDate, now: () => number): string =>
  date === toPackDate(new Date(now())) ? '/' : `/?d=${date}`

const trailFor = (date: PackDate | null, locale: string, now: () => number, here?: string): Crumb[] => {
  // An id with no date prefix names no day, so there is nothing true to put after Lull -- but
  // Lull itself still gets its href, and that is the only way off this surface.
  //
  // Without it the trail rendered a single href-less crumb, which Spine draws as an
  // aria-current span rather than a link. A mistyped or truncated share link like
  // /p/cryptogram:abc123 then painted "That puzzle isn't here" above a breadcrumb containing no
  // links, no buttons, and no router push -- and the manifest is display: standalone, so there
  // is no browser back button and no address bar either. The reader was stuck in the app with
  // no way back to the day, which is a worse outcome than the missing puzzle they arrived for.
  if (date === null) return [{ href: '/', label: 'Lull' }]

  const day = crumbLabel(date, locale, now)
  if (here === undefined) return [{ href: '/', label: 'Lull' }, { label: day }]

  return [{ href: '/', label: 'Lull' }, { href: dayHref(date, now), label: day }, { label: here }]
}

// Said in one place because it is read in two. Solved ids are never pruned, and neither is
// progress -- so a puzzle solved last week reopens on the board that won it, and this returns
// false. The state it names is therefore the narrow one: solved, with nothing left on the board.
// Empty progress counts as none: Play again empties a solved board and stores that.
//
// IT USED TO BE THE WIDE STATE. Progress was collected with the pack it belonged to, so any
// solved puzzle older than the retention window came up blank and landed here. Nothing collects
// progress by age any more (see writeHints in services/storage.ts), which narrowed this to Play
// again and to a board that stores nothing at all -- fewer readers see the line, and every one
// who does is looking at a board that says nothing about the win on its own.
const wasSolvedBefore = (puzzleId: string): boolean =>
  readMeta().solved.includes(puzzleId) && (readProgress(puzzleId) ?? '') === ''

// A surface with nothing to operate, so it has no seam and no floor -- the instrument exists if
// and only if there is a puzzle to play. It keeps the spine, which is the only way back now
// that no surface carries a Back button.
const DeadEnd = ({ children, trail }: DeadEndProps): React.ReactNode => (
  <div className="flex min-h-0 flex-1 flex-col">
    <Spine trail={trail} />
    {/* The gutter is on THIS box and not on the column, for the same reason it is on the bands of
        a real bench: the spine above is a strip of ground that has to reach both edges, and a
        column that padded it would stop the rule 16px short at each end. */}
    <div className="flex w-full flex-col items-start gap-[var(--lull-s4)] py-[var(--lull-s7)] pr-[var(--lull-gutter-right)] pl-[var(--lull-gutter-left)]">
      {children}
    </div>
  </div>
)

// Mounted fresh per puzzle -- the frame keys it on the id -- so everything read at arrival can
// be read in a state initializer and stay put while the board is played.
//
// It returns a FRAGMENT, and that is structural rather than stylistic: every element below is a
// band of the screen column, and a wrapper here would collapse four bands into one and take the
// board's `order` with it.
const PuzzleView = ({ entry, puzzle }: PuzzleViewProps): React.ReactNode => {
  const { Component } = entry
  // Read once from storage. The board restores from it at mount and owns it from then on;
  // re-reading storage on every render would hand the board back its own writes.
  //
  // STATE RATHER THAN A FROZEN VALUE, and the reason is the hint adapter below rather than the
  // board. Every board reads its OWN portion of this in a lazy initializer and owns it from then on
  // -- all six -- so the squares, guesses and drafts a board draws are unchanged: the value at
  // mount. What changed is that the SHELL now reads it too, on every render, to ask an adapter how
  // many rungs are bought and what they say. Frozen, that question is answered against the board as
  // it was when the player arrived: the frame writes a rung through onProgress, this value does not
  // move, `opened` stays where it was, and the press opens a sheet with nothing in it. The bar would
  // offer "Open hint 1 of 3" forever.
  //
  // TWO BOARDS ALSO RE-READ IT, AND ONLY FOR THE HINT TAIL. Cryptogram and Themed Anagrams draw what
  // a rung revealed, so they decode the SPENT LIST off this live prop on every render -- never their
  // own portion, which stays mount-time state. A bought rung therefore lands without a remount and
  // without discarding anything the player typed. Phrazle's rungs move no tile, so its board never
  // reads hint state and is handed no way to.
  //
  // ONE READING AND NOT TWO. Keeping a frozen `progress` for the board beside a live one for the
  // shell was the other candidate, and it is the arrangement gofigure/board.ts argues against: two
  // readings of one record, at different ages, able to disagree in a state no test would think to
  // write. It also buys nothing -- a state change here re-renders the board either way.
  //
  // It tracks what was WRITTEN and never re-reads to confirm. `writeProgress` refuses a value over
  // 8192 characters and says nothing back, so a refused write leaves this holding a string the
  // device does not. That is already every board's posture through the same refusal, and re-reading
  // would replace one wrong answer with a different one.
  const [progress, setProgress] = useState(() => readProgress(puzzle.id))
  // Frozen at arrival: winning right now is the board's own news to announce, and a second line
  // appearing above it would say it twice.
  //
  // Gated on there being no stored progress as well -- see wasSolvedBefore, where the narrowing
  // is argued. A solved puzzle that still holds its winning answer restores it and says "Solved."
  // itself, at any age now that nothing collects progress by age, and this line too would be the
  // same news, twice, on one screen.
  //
  // Empty progress counts as none. Play again empties a solved board and stores that, so an empty
  // string here means the player wiped it rather than left one keystroke in: the board comes up
  // blank and says nothing, and this line is then the only thing that knows the puzzle is already
  // in the bag.
  const [wasSolved] = useState(() => wasSolvedBefore(puzzle.id))

  // THE ONE PRODUCTION WIRING OF THE SIXTH PROP. `dictionary` is optional by design, so a frame
  // that forgot the line below would fail nowhere and the compiler would say nothing -- which is
  // why it is asserted behaviorally, by typing a guess on a mounted board, rather than by reading
  // props.
  //
  // The hook is the SHELL'S. A board may never call it: the board's contract has to be readable off
  // PuzzleComponentProps, and a context is exactly the thing that is not.
  const { words } = useDictionary()

  // The shell owns the ladder. The board's props are unchanged -- it never learns hints exist, and
  // PuzzleProgress stays an opaque per-type string HERE, whatever an adapter makes of it.
  //
  // THAT SENTENCE IS NOW HALF-TRUE IN AN INTERESTING WAY, so it is worth being exact about which
  // half. A board still receives six props, still gets no `hints`, and still has no name for the
  // thing that sold one. What it can no longer be told is that a hint left it alone: an adapter
  // writes its rung into the board's own progress string, so a cryptogram board comes back to find
  // some squares locked and does not know why. "The board never learns hints exist" is the promise;
  // "the board is never affected by a hint" was never one, and it is the promise this seam spends.
  //
  // WHERE THE RUNGS COME FROM IS THE WHOLE CHANGE. A pack ladder is decided before the puzzle ships,
  // which is right for a hint about what a phrase MEANS and useless for one about its letters --
  // "every Q is an E" is worth nothing to a player who already has Q, and no generator can know
  // whether they do. So three types compute theirs at play time and the other three do not, and the
  // shell asks the registry which it is holding.
  //
  // READ OFF THE REGISTRY, which is the shell asking its own question -- the same standing
  // `needsDictionary` has, and the reason neither one reaches a board. `hintsOf` is untouched: the
  // pack path is what it always was, and it is still the path three types take.
  //
  // Read HERE, above the writer, because the writer needs it: an adapter type's board write has to
  // be merged before it is stored, and the merge is what stops a board clobbering a rung.
  const adapter = entry.hints

  // The board as the player has built it, in the board's own grammar, which this file cannot read
  // and does not try to. Normalized ONCE: `readProgress` answers null for a puzzle never touched,
  // every adapter's grammar spells "nothing spent" as the empty string, and null would be a second
  // spelling of that for every adapter to handle. Doing it here also means the four reads below
  // cannot disagree about which one they got.
  const boardState = progress ?? ''

  // The shell owns persistence; the board is handed three callbacks and no storage.
  //
  // IT IS THE SHELL'S ONE WRITER, which is why the hint control below spends its rung through this
  // rather than through a store of its own. A rung an adapter sells goes into the same string the
  // board writes, so there is one record, one erasure, and nothing to keep in step.
  //
  // NOT the board's callback, though: this is the raw write, and `onProgress` below is what the
  // board gets. The hint control calls this one because an adapter's `open` has already composed the
  // WHOLE string -- board portion and hint tail together -- so putting it through the merge would
  // ask the adapter to re-attach a tail to a string it just wrote the tail into.
  const commit = useCallback(
    (next: PuzzleProgress) => {
      writeProgress(puzzle.id, next)
      setProgress(next)
    },
    [puzzle.id],
  )

  // THE ONE-WRITER RULE, and it is the board's whole side of this seam. A board writes only its own
  // portion -- its `encode` signature does not change and it has no name for the hint field -- so
  // every board write is re-joined here with the tail that is currently stored. Without it the
  // sequence is: the player buys a rung, the adapter writes it, the MOUNTED board still holds the
  // state it read in a lazy initializer at mount, and its very next `encode` overwrites the field.
  // The purchase is gone, silently, and no board is at fault for it.
  //
  // `boardState` IS THIS RENDER'S READING and that is safe here for a specific reason rather than by
  // luck. React has not applied `setProgress` when a second call in the same handler runs, so this
  // closure can be one write behind -- and it does not matter, because `merge` reads only the HINT
  // field out of it, and the hint field cannot move except through `commit` above, which is the
  // shell's own control and never fires in the same tick as a board's press.
  const onProgress = useCallback(
    (next: PuzzleProgress) => commit(adapter === undefined ? next : adapter.merge(next, boardState)),
    [adapter, boardState, commit],
  )
  const onSolved = useCallback(() => markSolved(puzzle.id), [puzzle.id])

  // A NONCE, not a boolean, and it counts rather than toggles because the same puzzle can be
  // started over any number of times in one sitting -- a boolean would be `true` after the first
  // Play again and `true` again after the second, so the second reset would hand HintBar a prop it
  // already holds, its effect would not run, and the ladder would sit where the player had just
  // left it. There is a test for the second reset, because a comment arguing against an alternative
  // is worth what the test behind it is worth.
  //
  // It exists because deleting the stored count is only half the job. HintBar reads its count ONCE,
  // in a state initializer, and subscribes to nothing -- not even STORAGE_EVENT -- which is right
  // for its normal life: the frame keys the view on the puzzle id, so re-reading storage on every
  // render would hand the bar back its own writes. The cost is that an emptied key is invisible to
  // a bar that is already mounted. Without this the ladder went quietly wrong rather than loudly:
  // the stored count read 0, the bar on screen still drew its spent rungs and still offered "Open
  // hint 2 of 3", and the next press wrote 3 back over the zero.
  const [resetNonce, setResetNonce] = useState(0)

  // The board asked for two things it cannot do itself, and neither of them tells it anything back.
  // Deleting the count is storage, which a board gets none of; raising the signal is this frame's
  // own state. So the ladder is reset without the board ever learning that a ladder exists.
  //
  // THE PAIR IS NOT ATOMIC, and it is worth knowing before rediscovering it. A board's Play again
  // calls `onProgress('')` and then `onReset()`, which React batches, so no render ever sees the
  // half-applied state. Storage is not batched: `writeProgress` and `removeHints` each dispatch
  // STORAGE_EVENT synchronously, so between the two dispatches a listener re-reading storage sees
  // empty progress alongside the stale hint count. Nothing observes it today -- the only subscriber
  // is the shelf, which is never mounted with a bench -- so this is a note rather than a defect. A
  // future listener that derives one from the other has to tolerate the interleave or be told once,
  // after both.
  const onReset = useCallback(() => {
    removeHints(puzzle.id)
    setResetNonce((nonce) => nonce + 1)
  }, [puzzle.id])

  const hints = adapter ? adapter.ladder(puzzle, boardState) : hintsOf(puzzle)

  // The count and the purchase, and both are the ADAPTER's answers rather than this frame's. The bar
  // is handed a number and a callback and learns no grammar either.
  //
  // `control` IS NOT NEW. It was built for the goFigure bench, whose rungs also do something to the
  // board rather than only say something about it, and it carries this whole interaction unchanged
  // -- which is the test that the seam is in the right place. If HintBar had needed a contract
  // change to serve this, the wiring would have been wrong rather than the bar.
  //
  // `onOpen` IGNORES THE COUNT THE BAR OFFERS IT. The bar says what the next count WOULD be; an
  // adapter answers with a progress string or with null, and null is a decline that leaves the count
  // exactly where it was. Undefined when there is no adapter, because absence is what tells the bar
  // to keep its own count in `lull:hints:` the way it always has.
  const control = adapter
    ? {
        onOpen: (): void => {
          const next = adapter.open(puzzle, boardState)
          // `commit`, NOT `onProgress`. This string is the adapter's own -- it already carries both
          // the board's portion and the tail it just extended -- so merging it would hand the
          // adapter its own write back and ask it to re-attach a tail that is already there.
          if (next !== null) commit(next)
        },
        opened: adapter.opened(boardState),
      }
    : undefined

  // The end of the ladder, and still the shell's business rather than the board's. The board never
  // learns that hints exist and it does not learn that an answer does either -- both come off the
  // pack, here, and go into the bar the shell already owns.
  //
  // `?? undefined` because HintBar's prop is OPTIONAL and its absence is what says "this bench has
  // no answer to give". Passing null would be a third state for a component that has two.
  const solution = answerOf(puzzle) ?? undefined

  // WHICH bar, not WHETHER there are hints. Every bench has a ladder now -- goFigure's rungs place
  // an operator where a phrase bench's describe a meaning -- so this flag stopped being about the
  // existence of hints and became about who draws the control.
  //
  // The tile bench draws its own, inside its control row, and so it must not also get the shell's:
  // two hint controls on one screen reading different rungs off one stored count is a state no
  // player could make sense of. The other benches have no control row to put one in, so the shell
  // supplies a docked 60px band between the board and the instrument.
  //
  // (The band this replaced on the tile bench is spent on the goal plate and the worked example --
  // which is why the flag is worth keeping even though every bench now has hints.)
  //
  // Read off the BENCH rather than off the type, so a second type that plays on the same surface
  // inherits the decision instead of repeating it. And stated as its own condition rather than
  // shared with anything else: it used to ride on the sign row's flag, which read as one decision
  // and was two, so when the sign row went away the hint bar would have gone with it everywhere.
  const hasHintBar = entry.bench !== 'tile'

  return (
    <>
      {/* The sign over the bench, read the way a wayfinding sign is read: what this is on the left,
          what it costs you on the right. Both facts were already on the day directory's row, in
          these words, from @utils/labels -- a player who picked "Medium · About 4 min" off the
          directory finds the same two words at the top of the board rather than a paraphrase.
          Stacked rather than run together with a middot because the row is 64px tall and two short
          lines fit where one long one would have crowded the name beside it.

          NO rule under the band, and that is the whole reason the bench reads as one surface: the
          title sits on the same raised plate the board does, so a line here would cut the working
          surface in half at its widest point. The bands that ARE ruled off are the ones drawn in
          the darker ground -- the breadcrumb above and the sign row below -- and they are told
          apart by their ground, not by a border on their neighbor.

          Baseline-aligned rather than centered, and NOT `leading-none`. Line-height 1 gives a line
          box exactly one em tall, and a serif descender hangs below that -- so with `truncate`'s
          `overflow: hidden` on the same element, the tail of the g in "Missing Vowels" was sliced
          off flat. Every bench name in the registry is one line, so the clipping bought nothing
          even when it worked. */}
      <div className="lull-title flex h-16 items-end justify-between gap-[var(--lull-s4)] pr-[var(--lull-gutter-right)] pb-[var(--lull-s3)] pl-[var(--lull-gutter-left)]">
        <div className="flex min-w-0 flex-col gap-[var(--lull-s1)]">
          <h1 className="lull-sign truncate text-[22px] leading-[1.25] text-[var(--lull-ink)]">{entry.label}</h1>
          {wasSolved && (
            <p className="text-[12.5px] leading-[1.35] text-[var(--lull-muted)]">
              You solved this one. Play it again if you like.
            </p>
          )}
        </div>
        <p className="flex shrink-0 flex-col items-end text-[12.5px] leading-[1.35] text-[var(--lull-muted)]">
          <span>{difficultyLabel(puzzle.difficulty)}</span>
          <span>{lengthLabel(puzzle.estimatedSeconds)}</span>
        </p>
      </div>

      {/* The board and the instrument both come out of the SAME component -- that is what keeps
          its six-prop contract intact -- but they belong in different bands, with the shell's
          own hint bar between them. `display: contents` dissolves this wrapper, so the two
          elements the component marks `.lull-board` and `.lull-instrument` become flex items of
          the screen column directly and index.css orders them into their bands. Neither side
          learns anything about the other.

          It goes on a semantically neutral <div>, never on an element carrying a role or a
          label: several engines drop such elements from the accessibility tree.

          The FLOOR comes out of the same element. `.lull-instrument` is the component's own
          <FloorBar>, and the frame renders none of its own -- not a preference, a consequence.
          CSS can remove a box (`display: contents`) but it cannot move one into a different
          parent, so the only way an element the component renders can sit INSIDE FloorBar is
          for the component to render FloorBar around it. The alternative -- the frame renders
          FloorBar and the instrument is ordered in beside it -- cannot be built: the instrument
          would be FloorBar's sibling, not its child, and putting it in the band anyway needs
          either a negative margin or absolute positioning, both of which break the moment the
          viewport changes height. And splitting the floor into three ordered siblings would
          trade away the one thing the single box buys: a fixed h-[seam] with overflow-y-auto,
          under which an oversized instrument scrolls inside its band instead of pushing the
          seam down. That box IS the seam, so it stays whole and the component owns it. The
          frame owns the order it appears in, which is the whole of what a shell needs to own. */}
      <div className="contents">
        {/* `words ?? undefined` because the state's absent value is null and the prop's is
            undefined. Every other board is handed it too and reads nothing; that costs one property
            on a render and keeps this to ONE mount site a reviewer or a grep can find. */}
        <Component
          dictionary={words ?? undefined}
          onProgress={onProgress}
          onReset={onReset}
          onSolved={onSolved}
          progress={progress}
          puzzle={puzzle}
        />
      </div>

      {/* Ordered BETWEEN two elements this frame does not own and cannot reach into. The bar
          itself is a fixed 60px strip that neither gives nor takes a pixel, and its opened hints
          are drawn in a sheet out of flow -- so no length of hint text can move the seam.

          HANDED THE NONCE AS A PROP, and it used to be handed to `key` instead. The remount looked
          like the cheaper correct thing -- everything the bar holds after a reset is exactly what it
          holds at mount, so mounting it again says that in one word -- and it was wrong twice.

          A changed key is React's instruction to destroy a subtree unconditionally, and React ships
          no focus handling with that instruction. The bar's control is the thing a keyboard player
          is standing on when they reach for Play again, so destroying it dropped focus to <body> and
          the next Tab restarted at the top of the page (WCAG 2.4.3). It was invisible in Chrome,
          which focuses a <button> when a pointer press lands on it -- so the press on Play again had
          already moved focus off the bar and there was nothing left to lose. Safari on macOS and iOS
          and Firefox on macOS do not, and jsdom emulates Chrome, so no test could see it either
          until one drove the reset without a click.

          The second cost is quieter and would have outlived the first. The bar's role="status"
          region is deliberately mounted empty and never hidden, because a live region inserted with
          its content already in it is routinely missed by NVDA and JAWS. A remount destroyed and
          rebuilt that region on every reset, which is that failure exactly -- and it is why the bar
          can now say "Hints reset." at all.

          So the nonce is a signal the bar reacts to rather than an identity it is rebuilt under.
          Nothing else here is given it: the board keeps its own state through a reset, because the
          board is the thing that just chose to reset. */}
      {/* `resetSignal` STAYS WIRED AS IT WAS, and for an adapter type it is now belt and braces
          rather than the mechanism. Those types keep their count in the board's own progress string,
          so a board's Play again writes `''` through onProgress and the ladder goes with the board
          -- `removeHints` becomes a harmless no-op on a key nothing wrote. What the signal still
          does for them is the half deletion never covered: it tells the MOUNTED bar to shut its
          sheet and stop announcing yesterday's rungs. */}
      {hasHintBar && hints !== null && (
        <HintBar control={control} hints={hints} puzzleId={puzzle.id} resetSignal={resetNonce} solution={solution} />
      )}
    </>
  )
}

export const PuzzleFrame = ({
  locale = defaultLocale(),
  now = Date.now,
  puzzleId,
}: PuzzleFrameProps): React.ReactNode => {
  const [resolution, setResolution] = useState<Resolution | null>(null)
  // The shell's hook, read here so the gate below can refuse to mount a board this build cannot
  // run. A board may never call it.
  const { status } = useDictionary()

  // The date prefix is the ONE part of a puzzle id a client may read. The rest
  // (`${type}:${shortId}`) is opaque: it is matched against the pack's own ids and never taken
  // apart, indexed with, or ordered by.
  const date = puzzleId === undefined ? null : packDateOf(puzzleId)

  useEffect(() => {
    if (date === null) {
      // An id with no date names no pack, so there is nothing to ask the network for.
      setResolution({ isSettled: puzzleId !== undefined, pack: null })
      return
    }

    let abandoned = false

    // Painted from the device first, so a puzzle already here appears without waiting on a
    // request that cannot change the answer.
    setResolution({ isSettled: false, pack: readPack(date) })

    const load = async (): Promise<void> => {
      let fetched: Pack | null = null
      try {
        // Cache-first: a complete stored pack is answered without a request, and an incomplete
        // one is asked again because the day can still fill in.
        fetched = await fetchPack(date)
      } catch (error: unknown) {
        // Offline, or a day that was never generated. Either way the cache below is the last
        // word, and there is nothing to show a reader that the missing-puzzle message does not
        // already say.
        console.error('pack fetch failed', { date, error })
      }
      if (abandoned) return
      // Re-read FIRST, because the request took real time and the prefetch or another tab may
      // have filled the day meanwhile -- but fall back to what we just fetched. storage.ts
      // swallows write failures on purpose, so when localStorage throws (cookies blocked,
      // partitioned context, quota exhausted) writePack no-ops and readPack returns null.
      // Trusting the re-read alone would answer a SUCCESSFUL fetch with "That puzzle isn't here"
      // and leave the app permanently broken while blaming the link.
      setResolution({ isSettled: true, pack: readPack(date) ?? fetched })
    }
    void load()

    return () => {
      abandoned = true
    }
  }, [date, puzzleId])

  // Rendered in Node at build time and shipped as HTML to everyone, so nothing above this line
  // may read the device. The page resolves the id out of window.location in an effect of its
  // own, so this is also the frame before the id arrives -- painting "not here" there would
  // accuse every deep link of being broken.
  if (resolution === null) return <div aria-hidden="true" className="min-h-[420px]" />

  const puzzle = resolution.pack?.puzzles.find((candidate) => candidate.id === puzzleId)

  if (puzzle === undefined) {
    if (!resolution.isSettled) {
      return (
        <DeadEnd trail={trailFor(date, locale, now)}>
          {/* KNOWN GAP, left deliberately rather than half-fixed. This paragraph is mounted WITH
              its text, which is the case the rest of this codebase documents as routinely missed --
              NVDA and JAWS announce changes inside a region they are already watching, and a region
              that appears with its message already in it never changes. So the role is closer to a
              claim than a fact here.

              Dropping the role was tried and is worse: nothing then announces the loading ->
              "isn't here" transition either. The real fix is one live region that outlives both
              branches, which means restructuring what this component returns, and that is a change
              worth making on its own rather than inside a review round. */}
          <p className="text-[var(--lull-muted)]" role="status">
            Looking for this puzzle…
          </p>
        </DeadEnd>
      )
    }

    return (
      <DeadEnd trail={trailFor(date, locale, now)}>
        <h1 className="lull-sign text-2xl text-[var(--lull-ink)]">That puzzle isn’t here</h1>
        <p className="text-[var(--lull-muted)]">
          It may have been cleared to make room for newer ones, or the link may be wrong.
        </p>
      </DeadEnd>
    )
  }

  const entry = entryFor(puzzle.type)

  // lull-api can ship a generator before the UI that draws it, so a pack off the network can
  // name a type this build has never heard of. Destructuring the missing registry entry would
  // throw during render, and ErrorBoundary (_app.tsx) would answer it by replacing the whole
  // app with "Lull got stuck" -- so the cost is the entire surface, not this one row.
  if (entry === undefined) {
    return (
      <DeadEnd trail={trailFor(date, locale, now)}>
        <h1 className="lull-sign text-2xl text-[var(--lull-ink)]">{UNKNOWN_TYPE_MESSAGE}</h1>
      </DeadEnd>
    )
  }

  // STILL LOOKING, so this surface says nothing a player could act on. Every cold open passes
  // through here: `readPack` above is synchronous and the provider's Cache API read is not, so the
  // first painted frame of a Phrazle deep link lands before the word list has been looked for. The
  // panel below would tell a player with the word list already on their device to reconnect and try
  // again, which is false twice over.
  //
  // It keeps the spine, and that is the whole reason it is a DeadEnd rather than the frame's
  // aria-hidden placeholder. The manifest is display: standalone -- no back button, no address bar
  // -- so a blank screen on a slow first download is a screen with no way off it. The live region
  // is the same one the "Looking for this puzzle…" branch above uses, for the same reason and with
  // the same known limit: it is mounted with its text.
  //
  // BELOW the entry guard above, for the reason that guard states: an unknown type has no entry to
  // read needsDictionary off.
  if (entry.needsDictionary && status === 'loading') {
    return (
      <DeadEnd trail={trailFor(date, locale, now, entry.label)}>
        <p className="text-[var(--lull-muted)]" role="status">
          Getting this puzzle ready…
        </p>
      </DeadEnd>
    )
  }

  // Reached when a Phrazle id is opened directly -- a share link, a bookmark, a row that was a link
  // a moment ago -- and the dictionary is absent. It is the gate that keeps the board free of a
  // spinner, a retry button and an error message it has no business owning: the board never has to
  // handle the dictionary's absence, because this refuses to mount it without one.
  //
  // 'absent' AND NOT `!== 'ready'`, which used to lump the window above in with a word list that is
  // genuinely not here. Only a failed attempt reaches this, and reconnecting is then the true next
  // action.
  //
  // The spine names the puzzle -- trailFor's third argument -- because the entry is KNOWN here.
  // That is the whole difference between this dead end and "That puzzle isn't here".
  if (entry.needsDictionary && status === 'absent') {
    return (
      <DeadEnd trail={trailFor(date, locale, now, entry.label)}>
        <h1 className="lull-sign text-2xl text-[var(--lull-ink)]">{`${entry.label} needs a one-time download`}</h1>
        <p className="text-[var(--lull-muted)]">
          {/* `while you’re online`, not `Reconnect`. The app says `while you’re online` in four
              other dead ends -- the shelf's, the registry's unknown type, and both boards that can
              meet a half-arrived pack -- so this was the one place a player was asked to perform a
              named technical act instead of being told when to come back. */}
          The word list downloads once and then works offline. Open this puzzle again while you’re online.
        </p>
      </DeadEnd>
    )
  }

  return (
    // The bench: a flex column in which exactly ONE band flexes. The ceiling and the floor are
    // BOTH in index.css now, on `.lull-bench` and `.lull-page`, because each grew a term Tailwind
    // cannot express -- they subtract --lull-kb, the height of an open software keyboard. Those
    // rules are unlayered and utilities are not, so a `max-h-dvh` left here would be a class that
    // reads as load-bearing and does nothing. The relationship is unchanged: a ceiling on this
    // column, a floor on the page, and without the ceiling the column becomes max(viewport,
    // content) and the seam rides down with a long phrase. The pressure has nowhere to go but
    // into the board's own overflow, which is what index.css gives it.
    //
    // overflow-y-auto, NOT overflow-hidden, and the difference is not cosmetic.
    //
    // Every band but the board is shrink-0, and the board floors at 96px, so this column has a
    // HARD MINIMUM of 492px on the cipher bench: spine 44 + title 64 + board 96 + hint bar 60 +
    // seam 228. Under a shorter viewport than that, the ceiling still applies and
    // hidden simply amputates the bottom -- the instrument is cut off with nothing able to scroll
    // to it. Every phone in landscape is shorter than 492px (844x390 clips 102px; 568x320 clips
    // 172px), and the manifest sets no orientation lock, so this is reachable by rotating the
    // device on any surface in the product.
    //
    // Below its minimum the seam's promise is not merely inconvenient, it is arithmetically
    // impossible: the bands cannot all fit. So the honest degradation is to let the column
    // scroll, which costs the constant position only in the case where no constant position
    // exists, rather than to keep the promise by hiding the thing it was made about. At or above
    // 492px this is a no-op -- the column fits, nothing overflows, and nothing scrolls.
    //
    // THERE IS NO PAGE GUTTER ON THIS ELEMENT, and there is none on the <main> around it either.
    // Every band below is full width and pays for its own text inset out of --lull-gutter-*. An
    // earlier arrangement put the gutter here and had the instrument cancel it with a negative
    // margin, which worked for the instrument and for nothing else: this column is a scroll
    // container, and in a scroll container a negative LEFT margin hangs outside the scrollable
    // region entirely and is clipped, while the matching negative RIGHT margin becomes real
    // sideways drag. The moment a second band wanted the full width -- the board's own plate --
    // that trick would have amputated 16px off its left edge with nothing to show for it.
    //
    // `lull-bench` is the hook for two things: the raised plate this column is drawn on, and the
    // one behavior above 768px that is not the phone layout -- index.css stops the column
    // stretching there and centers it, because a board band that swallows 390px of a desktop
    // window is dead space rather than breathing room.
    <div className="lull-bench flex min-h-0 flex-1 flex-col overflow-y-auto">
      {/* Wrapped only so the band can carry an order of its own. Leaving it to DOM position
          would make the spine the one band whose place in the column is implied rather than
          declared, and the first reordering would move it without touching this file. */}
      <div className="lull-spine">
        <Spine trail={trailFor(date, locale, now, entry.label)} />
      </div>
      {/* Keyed on the id, so opening a different puzzle is a different component rather than a
          prop change -- the board restores its state at mount and would otherwise keep the
          previous puzzle's tiles. */}
      <PuzzleView entry={entry} key={puzzle.id} puzzle={puzzle} />
    </div>
  )
}
