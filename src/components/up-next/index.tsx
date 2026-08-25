import React, { useId, useState } from 'react'

import { Button } from '@components/button'
import { entryFor } from '@registry'
import { dayLabel } from '@utils/date-labels'
import { difficultyLabel, lengthLabel } from '@utils/labels'
import { UpNextPick } from '@utils/up-next'

export interface UpNextProps {
  locale: string
  // REQUIRED, with no default, and that is the whole reason it is on the props at all. dayLabel
  // takes `now: () => number = Date.now` because it prints the year only when the day is not in the
  // reader's current year -- so calling it bare works, reads the wall clock, and cannot be pinned by
  // any test or by the shelf's own frozen clock. Shelf freezes one clock at mount precisely so
  // everything on the surface agrees about what day it is; a default here would quietly opt this
  // panel out of it, and the disagreement would only show across a midnight or a New Year.
  now: () => number
  onPickAnother: () => void
  onPlay: (puzzleId: string) => void
  // How many puzzles are still unsolved on the day currently on screen. ABOVE ZERO, THIS PANEL
  // DEFERS -- see the note on the component below.
  openCount: number
  // A readable PREFIX for the two ids built inside, and nothing more: uniqueness comes from useId(),
  // which React makes unique per mounted instance, so two UpNexts on one screen with the same
  // panelId still get different ids. PASS A LITERAL. Handing it another useId() value renders ids
  // like `:r1:-:r5:-card` -- unique twice over and readable neither time -- which throws away the
  // only thing this prop still contributes.
  panelId: string
  pick: UpNextPick | null
  // What is left to play beyond the day on screen.
  //
  //   'none'   there is nothing for this panel to say. Either the device holds no pack at all --
  //            where the shelf's own empty state wins outright and there is nothing to be next to --
  //            or something unsolved is on the device that this build cannot recommend right now.
  //   'spent'  every puzzle in every cached pack is solved, and Lull can still bring back an
  //            earlier day.
  //
  // THE SECOND HALF OF 'none' IS WHY THIS IS MEASURED OFF `solved` AND NOT OFF `pick`. A null pick
  // means "nothing to recommend", which is not "nothing is left": the shelf refuses to name a board
  // it could not mount, and Phrazle is unmountable until the word list arrives. Reading a null pick
  // as an empty pool put "You've solved everything on this device" under a day whose unsolved
  // Phrazle was sitting in the rows above, and flashed it on every cold open while the cache
  // answered. The shelf now decides this from what is solved alone.
  //
  // A THIRD MEMBER, 'exhausted', HAS BEEN HERE AND CAME OUT. It was set on one thing -- a 404 for a
  // single date -- and it printed a second sentence and withheld the button below. The defect was
  // that two components reported one event: the day panel already says "Trying again won't help.
  // Choose another day." about that press, so this panel repeating it in different words left the
  // reader with the news that they should pick another day and no control to do it with. And after
  // a 404 the 'spent' sentence is still true in both of its clauses -- everything on the device
  // really is solved, and Lull really can bring back an earlier day. A 404 is a fact about one date
  // and falsifies neither, so it leaves this at 'spent' and the offer standing.
  //
  // TWO MEMBERS AND STILL A UNION, which is a decision and not an oversight, because this prop was a
  // boolean once already. The only honest name for the boolean is `hasPacks`, and that is a fact
  // about what localStorage holds: the shelf would pass `packs.length > 0`, a measurement standing
  // in for the conclusion this panel actually renders on. `poolState="spent"` at a call site says
  // what the sentence underneath is about to claim; `hasPacks={true}` says where it was measured.
  //
  // A third member returns the day `GET /packs` ships. "The archive is finished" is the one claim
  // that would justify withdrawing the offer, and it is a claim this app cannot make: §2 of the
  // design keeps that endpoint undeployed on purpose, so the app can never learn it.
  //
  // A fact and not a capability: no callable, no destination, no URL, no status. It sits on the line
  // onReset and dictionary drew.
  poolState: 'none' | 'spent'
  // Which sentence the card prints. 'app' means the app chose the day; 'day' means the player did,
  // and the pick is the gentlest thing left on the day they are looking at.
  reason: 'app' | 'day'
}

// THE INSTALL-CARD NOTICE GRAMMAR, and deliberately not a third double bezel. Shell+Plate is spent
// on the date plate and the goal plate, and a third use turns the technique into background noise --
// which is the argument install-card already makes on the same shelf, two elements further down.
//
// --lull-rule and not --lull-hair: the edge is what separates the card from the ground it sits on,
// and hair is forbidden from carrying that job anywhere it could be read as a component boundary.
//
// THE SAME THREE UTILITIES install-card spells, character for character, and no inset highlight on
// top of them. The two plates render adjacent on the same shelf, so a lit top edge here and none
// eighteen pixels below reads as two different materials rather than one grammar used twice -- and
// the fix for that is to drop it here, never to add it there.
const CARD = 'rounded-[var(--lull-r-lg)] border border-[var(--lull-rule)] bg-[var(--lull-plate)] p-[var(--lull-s4)]'

// The category label the shelf's other signs wear, at the size the date plate's eyebrow uses. It is
// a HEADING rather than a paragraph because it is the only title this panel has -- the card names a
// puzzle, not the panel -- so it is both the landmark's name and a jump target of its own.
const EYEBROW = 'text-[11.5px] font-semibold tracking-[0.11em] text-[var(--lull-muted)] uppercase'

const TITLE = 'lull-sign text-xl text-[var(--lull-ink)]'

const META = 'mt-[3px] text-[12.5px] text-[var(--lull-muted)]'

const NOTE = 'text-[12.5px] leading-[1.45] text-[var(--lull-muted)]'

const ACTIONS = 'mt-[var(--lull-s4)] flex flex-wrap items-center gap-[var(--lull-s2)]'

// Spelled out to nine and printed as digits above it, which is how every other sentence on this
// surface writes a small number. Index 0 holds a PLACEHOLDER rather than a word, so that the rest
// line up with the numbers they spell: the strip only renders when openCount is above zero, so "no
// puzzles are still open" is a sentence this branch cannot reach.
//
// IDENTICAL TO day-panel's, character for character, and kept separate anyway -- and neither reason
// this note has given for that survives. "Three different sentences would be forced onto one casing"
// is wrong on its face: there are two casings across the three copies, and these two are the same
// one. The replacement -- that openLine below range-checks where day-panel's and shelf's index and
// fall through -- is true and proves the opposite of what it was written to prove. The three differ
// in ROBUSTNESS, not in behavior: on every count any of them can actually be handed they answer with
// the same word. What differs is which counts they survive, and the other two survive zero only
// because a guard in a different function happens to hold (`!isEmptyDevice` in day-panel,
// `pack.puzzles.length > 0` in shelf). This one is the careful one and is therefore the one worth
// sharing; what three call sites would still need is three SENTENCES, which is not the same thing as
// three number-to-word wrappers. They are still three copies because nobody has converged them.
const COUNT_WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']

// "On this day" and not "above". This component does not control its own position -- the shelf does,
// and the empty-device promotion already reshuffles that screen -- so a sentence that points at the
// rows by direction is a layout claim nothing here can keep. Where the panel lands, the day it is
// talking about is the same day.
//
// THE RANGE IS CHECKED, rather than indexed and given a `?? count` fallback. Two holes close with
// one expression: noUncheckedIndexedAccess is off, so the checker believes every index yields a
// string and the fallback is a branch it has already decided can never be taken; and `.at()` wraps
// negatives, so `.at(-1)` answers 'Nine' and `.at(0)` answers '' -- "Nine puzzles are still open"
// for a count of -1, and a leading space for a count of 0. Both are unreachable today only because
// a guard twenty lines below, in a different function, happens to hold.
const openLine = (count: number): string => {
  const word = count >= 2 && count <= 9 ? COUNT_WORDS[count] : `${count}`

  return count === 1
    ? 'One puzzle is still open on this day. Another one is waiting when you finish.'
    : `${word} puzzles are still open on this day. Another one is waiting when you finish.`
}

/**
 * One puzzle to play next, with its date printed beside it as a FACT rather than offered as a
 * control. That is the whole claim of this panel: you do not want a date, you want one more good
 * puzzle, and the day it came from is worth knowing and not worth operating.
 *
 * IT DEFERS WHILE THE DAY ON SCREEN IS UNFINISHED, and that behavior is the point rather than a
 * detail. A recommendation parked above five unsolved rows competes with the screen it sits on, so
 * the panel says nothing but how many are still open and puts the pick behind a quiet disclosure. No
 * card, no accent, no offer until the player asks for one.
 *
 * It never names a puzzle it cannot open. The pick is drawn from a pack in hand by nextUnsolved, and
 * a type this build has no registry entry for is refused here -- lull-api can ship a generator
 * before the UI that draws it.
 *
 * WITH NO PICK IT HAS THREE ANSWERS, not one. nextUnsolved is called with the day on screen
 * excluded, so a null pick is a claim about every OTHER day and none at all about this one -- see
 * the branch below, where open work outranks every claim the pool could make.
 */
export const UpNext = ({
  locale,
  now,
  onPickAnother,
  onPlay,
  openCount,
  panelId,
  pick,
  poolState,
  reason,
}: UpNextProps): React.ReactNode => {
  const [isShown, setIsShown] = useState(false)
  // TWO IDS BUILT HERE, both from one useId(). `eyebrowId` is the target of the section's
  // aria-labelledby in every branch -- break it and the landmark loses its name, so a role query
  // fails and says so. `cardId` is the target of the disclosure's aria-controls, which contributes
  // nothing to a name and can therefore rot in silence, so the test resolves that one explicitly at
  // both ends. It is applied ONLY in the deferred branch, because that is the only branch with a
  // disclosure to point at it; an id nothing references is a claim the code does not keep.
  const generatedId = useId()
  const cardId = `${panelId}-${generatedId}-card`
  const eyebrowId = `${panelId}-${generatedId}-eyebrow`

  // The section's name in all three branches, and VISIBLE in only two of them. The deferred strip
  // says three things in a row to report that it has nothing to say -- an uppercase tracked heading,
  // a sentence, a toggle -- and the heading is the loudest of the three while restraint is that
  // branch's whole point. sr-only keeps the landmark named and takes the shout away.
  const eyebrow = (className: string): React.ReactNode => (
    <h2 className={className} id={eyebrowId}>
      Up next
    </h2>
  )

  if (pick === null) {
    // OPEN WORK ON SCREEN WINS OVER EVERY POOL CLAIM, and this order is the whole reason the branch
    // is written out rather than folded into one expression. `pick` is drawn with the day on screen
    // EXCLUDED, so a null pick means "everything OUTSIDE today is solved" and says nothing whatever
    // about the rows above it. Printing "you've solved everything on this device" eighteen pixels
    // below five unsolved rows is a lie the player can see from where they are sitting -- and it is
    // the state an active daily player reaches first, not some corner.
    if (openCount > 0) return null
    // No pack at all. The shelf's own empty state says more than this could, and there is nothing
    // for this panel to be next to.
    if (poolState === 'none') return null

    return (
      <section aria-labelledby={eyebrowId} className="flex flex-col gap-[var(--lull-s3)]">
        {eyebrow(EYEBROW)}
        <div className={CARD}>
          {/* ONE SENTENCE IN THIS BRANCH, AND IT NEVER REPORTS A REQUEST. This panel used to print a
            second sentence after a 404 -- "There was nothing for that day. Pick another day." --
            while the day panel was saying the same thing about the same press in its own words. The
            request belongs to the panel that made it; what belongs here is what is left to play.

            "On this device" is the whole claim, and it is deliberately not a claim about Lull. The
            app cannot know whether the archive is finished without GET /packs, which is undeployed
            on purpose, so it never says so. */}
          <p className={NOTE}>You’ve solved everything on this device. Lull can bring back an earlier day.</p>
          {/* THE OFFER STANDS IN EVERY STATE THIS BRANCH CAN BE IN, including after a day came back
              empty -- that is a fact about one date, and picking a different one is exactly what the
              reader should do next. Withholding the control that does it left the advice with no way
              to act on it. */}
          <div className={ACTIONS}>
            {/* The panel stops naming a puzzle and names a REQUEST instead -- and it names the offer
                rather than performing it. Month-to-day targeting already lives in the day panel,
                which onPickAnother opens, so nothing about a request is duplicated here. */}
            <Button onClick={onPickAnother} variant="primary">
              Bring back an earlier day
            </Button>
          </div>
        </div>
      </section>
    )
  }

  // A type this build has never heard of. Recommending a board the shell would refuse to mount
  // breaks the one rule this panel holds to, and reading `.label` off the undefined entry would
  // throw during render -- which ErrorBoundary answers by replacing the whole app.
  const entry = entryFor(pick.puzzle.type)
  if (entry === undefined) return null

  const card = (
    <div className={CARD}>
      {/* The puzzle's name, not a heading: the panel's heading is the eyebrow above, and a second
          one here would put the name of one puzzle into the document outline of a shelf that lists
          six others as plain rows. */}
      <p className={TITLE}>{entry.label}</p>
      {/* The same two facts in the same words the shelf row for this puzzle prints, from the same
          two functions -- a player who recognizes "Gentle · About 4 min" from the day directory has
          to find those exact words here or the two surfaces describe two different puzzles. */}
      <p className={META}>
        {difficultyLabel(pick.puzzle.difficulty)} · {lengthLabel(pick.puzzle.estimatedSeconds)}
      </p>
      {/* THE DATE, AS A SENTENCE. It is printed and never pressable, which is the difference between
          this panel and the day directory sitting above it. `now` is passed rather than defaulted so
          the year appears on the shelf's clock and not on the wall's. */}
      <p className={`mt-[var(--lull-s2)] ${NOTE}`}>
        From {dayLabel(pick.date, locale, now)}.{' '}
        {/* "There" and not "that day". The clause before this one has just printed the date, so
            "that day" points backwards at something the reader read half a second ago -- a deictic
            costs more to resolve than the word it saves. */}
        {reason === 'app' ? 'The gentlest puzzle you haven’t solved.' : 'The gentlest one you have left there.'}
      </p>
      <div className={ACTIONS}>
        {/* The one primary on this screen, and one of the three places the accent is spent in the
            whole product. It is the offer the panel exists to make. */}
        <Button onClick={() => onPlay(pick.puzzle.id)} variant="primary">
          Play {entry.label}
        </Button>
        {/* Quiet, and therefore borderless: a bordered second control reads as a second offer of
            equal weight beside the one the surface exists to present. Same call install-card makes
            on "Not now". */}
        <Button onClick={onPickAnother} size="sm" variant="quiet">
          Pick another
        </Button>
      </div>
    </div>
  )

  if (openCount > 0) {
    return (
      // A HAIRLINE STRIP AND NOT A CARD: no plate, no edge of its own, no accent anywhere in it. The
      // panel is reporting that it has nothing to say yet, and a bordered box would be saying
      // something. --lull-hair is the right token for exactly this reason -- it separates two runs of
      // content and bounds no control and no state, which is the only job colors.ts allows it.
      <section aria-labelledby={eyebrowId} className="border-t border-[var(--lull-hair)] pt-[var(--lull-s4)]">
        {eyebrow('sr-only')}
        <p className={NOTE}>{openLine(openCount)}</p>
        {/* The card is UNMOUNTED while this is shut, so aria-controls is omitted rather than left
            pointing at an element that is not there. Collapsing takes the card away and leaves this
            control exactly where it was, so the keyboard never lands on <body> and the install
            card's focus-restoring effect has no equivalent to do here. */}
        <Button
          aria-controls={isShown ? cardId : undefined}
          aria-expanded={isShown}
          className="mt-[var(--lull-s2)]"
          onClick={() => setIsShown((shown) => !shown)}
          size="sm"
          variant="quiet"
        >
          {isShown ? 'Hide it again' : 'Show it anyway'}
        </Button>
        {/* The wrapper carries `cardId`, so the disclosure's aria-controls resolves to the element
            that appears and disappears with it -- and the id exists in this branch only, which is
            the only branch that references it. */}
        {isShown && (
          <div className="mt-[var(--lull-s3)]" id={cardId}>
            {card}
          </div>
        )}
      </section>
    )
  }

  return (
    <section aria-labelledby={eyebrowId} className="flex flex-col gap-[var(--lull-s3)]">
      {eyebrow(EYEBROW)}
      {card}
    </section>
  )
}
