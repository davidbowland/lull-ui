import React, { useEffect, useId, useMemo, useRef, useState } from 'react'

import { DayRow } from './row'
import { Button } from '@components/button'
import { PackDate } from '@types'
import { crumbLabel, dayLabel, monthLabel } from '@utils/date-labels'
import { DaySummary } from '@utils/day-summary'
import { allPackDates, FIRST_PACK_DATE, monthsOf, packDateOf } from '@utils/pack-dates'

// The four answers GET /packs/{date} can produce, named for what the PLAYER sees rather than for the
// status code. `empty` is a 404 and is permanent -- the date was valid and nothing could be built
// for it -- while `failed` is a timeout or a dropped connection and is transient. They take
// different words and different controls, because two failures that look alike but need opposite
// next actions is how a player learns to distrust a button.
export interface DayRequest {
  date: PackDate
  state: 'pending' | 'landed' | 'empty' | 'failed'
}

export interface DayPanelProps {
  // The days ON THE DEVICE, newest first. Never the calendar: every row here is openable offline,
  // which is the promise this half of the panel makes.
  //
  // EMPTY IS A SCREEN, not an edge case. With nothing on the device there is no date plate for a
  // disclosure control to live on, so the shelf renders this panel in the open and the panel becomes
  // the page (spec 6.5). Every difference that screen needs is derived from `days.length === 0`
  // below rather than announced by a prop, because two of the four pieces -- the heading and the
  // line under the month field -- are INSIDE this layout, and a wrapper supplying them would leave a
  // panel headed "Choose a day" sitting under a second heading reading "Bring a day back".
  days: DaySummary[]
  isOnline: boolean
  locale: string
  // INJECTED, and passed explicitly to every label below. crumbLabel adds a year only when the day's
  // year differs from the current one, so a bare call reads the wall clock -- which this repo's
  // non-determinism rule forbids and which no test can pin. The default exists so the parameter is
  // injectable rather than so a caller may forget it: Shelf freezes one clock at mount and hands the
  // same one to the plate and to this panel, because two clocks in one render disagree across
  // midnight.
  now?: () => number
  onDismiss: () => void
  onRequestDay: (date: PackDate) => void
  onSelectDay: (date: PackDate) => void
  // Supplied by the caller rather than generated here, because the caller is what points
  // aria-controls at this panel and the two ends have to be one value. See the note in Shelf.
  //
  // THE CALLER MUST HAND IT A useId() VALUE. Every id in this component is built from it, so two
  // panels handed the same literal produce two elements with one id, and an aria-controls or
  // aria-labelledby then resolves to whichever the browser found first. That this repo cannot
  // currently produce a duplicate id rests entirely on this parameter being generated -- see the
  // duplicate-id note in CLAUDE.md.
  panelId: string
  request: DayRequest | null
  // The solved ids, for the month list ONLY. The seven `days` above arrive as summaries because the
  // shelf has their packs; a month's other twenty-four days have no pack anywhere, and a solved
  // count is the one thing still knowable about them -- ids outlive the packs they name.
  solved: ReadonlySet<string>
  todayDate: PackDate
}

// Spelled out to nine, then numeric. The panel holds seven at most today, so the numeric branch is
// unreachable from the shelf -- it exists because RETENTION_WINDOW is a constant somebody may raise,
// and "10 days are on this device" is better than a crash or a missing word.
//
// THIS ARRAY AND up-next's ARE IDENTICAL, character for character, and they stay apart anyway --
// and neither recorded reason for that survives reading them side by side.
//
// The first note said converging the three copies "would force one casing on three different
// sentences". Disprovable in ten seconds: shelf's is lower case because it sits mid-sentence after
// "All", and the other two are capitalized because the number opens the sentence. Two casings, not
// three.
//
// The second said the FUNCTIONS differ, so one shared array would leave three wrappers behind it.
// The functions do differ -- this one indexes and falls through to `${count}`, up-next's
// range-checks 2..9 -- but they differ in ROBUSTNESS, not in behavior: on every input either can
// actually be handed they return the same word. What separates them is which inputs they survive,
// and this one survives zero only because `deviceLine` is called inside the `!isEmptyDevice` branch
// below, a guard in a different function. Take that guard away and this returns '' for a count of
// zero and prints " days are on this device." So the honest reading is that the more careful of the
// three is the one worth sharing, and three call sites needing three SENTENCES is not the same
// thing as three number-to-word wrappers. These are still three copies because nobody has converged
// them, not because they cannot be.
const COUNT_WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']

const countWord = (count: number): string => COUNT_WORDS[count] ?? `${count}`

// "Seven days are on this device." was hardcoded before the copy review and lied on any device
// holding fewer packs -- the one number in this feature that can go wrong.
//
// ZERO SAYS NOTHING AT ALL. The copy table has a plural form and a singular one and no zero form,
// and the one screen that reaches zero -- the empty device, where the panel becomes the page -- is
// already headed by the shipping "No puzzles on this device". A second sentence saying it again is
// noise, and "no days are on this device" starts a sentence in lower case.
const deviceLine = (count: number): string =>
  count === 1 ? 'One day is on this device.' : `${countWord(count)} days are on this device.`

// A day the device has never held, whose solved count is therefore zero, gets NO COUNT AT ALL.
//
// On the seven-day list "0 solved" is a fact about the player: this day is here and you have not
// touched it. In the month list, on a day with no pack anywhere, it is a fact about nothing -- and
// on a month never played it is the only thing thirty-one rows say, which reads as a scorecard of
// failure rather than a list of days you can fetch. The empty string is safe because DayRow draws
// its count cell whether or not there is a count in it; see the geometry note there.
const hasNoCount = (summary: DaySummary): boolean => summary.status === 'notHere' && summary.solvedCount === 0

// 'All solved' is the same series as '3 solved' and reports a WIN. It replaced 'Nothing to play',
// which is a synonym of the 404 row's 'No puzzles' and reported the player's best outcome as a loss.
//
// Module-private, along with accessibleNameFor below. Both were exported so a later task could reuse
// them; that task turned out to be this same file, and an export with no consumer outside the module
// is a contract nobody signed.
const countLabelFor = (summary: DaySummary): string =>
  hasNoCount(summary) ? '' : summary.status === 'allSolved' ? 'All solved' : `${summary.solvedCount} solved`

// A day is openable exactly when something in it is unsolved. Read through this in both lists rather
// than inlined twice: the same day appears in the seven above and in its own month below, and a row
// that is a control in one list and dead in the other teaches nothing.
const isOpenable = (summary: DaySummary | undefined): boolean => summary?.status === 'hasUnsolved'

// The spoken half of the tag DayRow draws, and it is a function of its own because BOTH name
// builders below need it. Today wins when a day is both, and DayRow's visible tag makes the same
// choice in another file with nothing tying the two together. If they ever disagree the visible word
// stops being in the name and 2.5.3 breaks in silence, which is why both sides carry a test for it.
const tagFor = (isToday: boolean, isHere: boolean): string => (isToday ? ', today' : isHere ? ', here' : '')

// Built from the exact visible strings so speaking what is on screen matches the row (WCAG 2.5.3).
const accessibleNameFor = (summary: DaySummary, label: string, isToday: boolean, isHere = false): string => {
  const tag = tagFor(isToday, isHere)

  // A DAY NOT ON THE DEVICE IS NAMED BY WHAT PRESSING IT DOES, not by a number. The row that costs a
  // thirty-second round trip was the one row in the panel saying nothing about what it costs, while
  // the row that opens instantly explained itself ("Already on this device.") -- the asymmetry ran
  // exactly the wrong way. The count stays in the name when there is one, because a day you solved
  // two puzzles on in March is a different offer from one you never opened.
  if (summary.status === 'notHere')
    return hasNoCount(summary)
      ? `${label}${tag} — bring this day back.`
      : `${label}${tag} — ${summary.solvedCount} solved. Bring this day back.`

  const count = summary.status === 'allSolved' ? 'all solved' : `${summary.solvedCount} solved`
  const provenance = isHere && !isToday ? ' Already on this device.' : ''
  return `${label}${tag} — ${count}.${provenance}`
}

const EYEBROW = 'text-[11.5px] font-semibold tracking-[0.11em] text-[var(--lull-muted)] uppercase'

const NOTE = 'mt-[var(--lull-s2)] text-[12.5px] text-[var(--lull-muted)]'

// --lull-hair, not --lull-rule: this separates two sections and bounds no control. On the empty
// device there is no first section to be separated from, so the rule would be an edge under nothing.
const OLDER_DAYS = 'mt-[var(--lull-s4)] border-t border-[var(--lull-hair)] pt-[var(--lull-s4)]'

/**
 * The override region: the days already here, and a way to name an older one.
 *
 * IT OWNS NO FETCHING AND NO ROUTING. It is handed summaries and hands back a date, which is what
 * keeps the shell the only thing that talks to the network -- the same line every puzzle component
 * sits on.
 */
export const DayPanel = ({
  days,
  isOnline,
  locale,
  now = Date.now,
  onDismiss,
  onRequestDay,
  onSelectDay,
  panelId,
  request,
  solved,
  todayDate,
}: DayPanelProps): React.ReactNode => {
  const [month, setMonth] = useState('')

  // useId, so two panels could never collide. Both ends of every IDREF built from these are asserted
  // in this component's test -- aria-describedby contributes no accessible name, so it can rot in
  // total silence while every role query keeps passing.
  const generatedId = useId()
  const monthFieldId = `${generatedId}-month-field`
  const offlineNoteId = `${generatedId}-offline`

  const statusRef = useRef<HTMLParagraphElement>(null)
  const monthFaceRef = useRef<HTMLButtonElement>(null)
  const previousState = useRef(request?.state)
  const previousOnline = useRef(isOnline)

  // FOCUS SURVIVES A REQUEST ENDING. This is the other half of keeping a day that is being fetched
  // pressable: a press must never unmount the thing it was pressed on, and where one genuinely has
  // to go, something must catch the keyboard.
  //
  // Leaving `pending` is the only transition that can take a control off the screen -- a 404 turns
  // its row into a plain <div>, and on the empty device a failure replaces the standing "Bring back
  // today" offer with the retry. Without this the <button> holding focus is replaced by a <div>,
  // focus falls to <body>, and the next Tab restarts at the top of the document: WCAG 2.4.3, and the
  // same failure components/install-card moves focus to avoid.
  //
  // THE GUARD IS THAT FOCUS ACTUALLY FELL. A browser puts focus on <body> when the focused element
  // is removed, so `activeElement === body` right after a commit is the observable form of "the
  // control the keyboard was on is gone". It is not a perfect reading -- a reader who never focused
  // anything is also on <body>, and would be moved to a sentence that has just changed under them --
  // and that trade is taken deliberately: the alternative is losing the keyboard entirely on the
  // press this panel exists to offer.
  //
  // The status paragraph is the destination rather than the month <select>, because it is the
  // sentence that says what happened, it sits directly under the field (see the layout note below),
  // and the next Tab from it goes FORWARD into the month list -- which is where "Choose another day"
  // is sending the reader anyway.
  //
  // LOSING THE CONNECTION IS THE SECOND TRANSITION THAT TAKES A CONTROL AWAY, and it takes two of
  // them: the <select> is replaced by the button face, and the whole month <ul> is unmounted (see
  // the `month !== '' && isOnline` branch below). A reader who had tabbed to the field, or to a row
  // in an open month, lost the keyboard to <body> with nothing to catch it -- WCAG 2.4.3, and the
  // same failure as the 404 above, reached without pressing anything at all. Signal drops are not a
  // corner case on the one surface in this product that says so out loud.
  //
  // The destination is the month FACE, because it is what the field became: the reader was operating
  // the field, and the field is still there wearing another shape. It is both branches' answer --
  // the row list is inside the field's own section, so the face is where its reader was headed back
  // to anyway.
  //
  // BOTH LIVE IN ONE EFFECT because they share the guard, and the guard is the whole subtlety: focus
  // moves only where it was actually lost. `activeElement === body` right after a commit is the
  // observable form of "the control the keyboard was on is gone", so a reader doing something else
  // when the signal drops is left alone.
  useEffect(() => {
    const wasOnline = previousOnline.current
    previousOnline.current = isOnline
    const previous = previousState.current
    previousState.current = request?.state

    if (document.activeElement !== document.body) return

    if (wasOnline && !isOnline) {
      monthFaceRef.current?.focus()
      return
    }

    if (previous !== 'pending' || request?.state === 'pending') return
    statusRef.current?.focus()
  }, [isOnline, request])

  // MEMOIZED BECAUSE allPackDates RETURNS A FRESH ARRAY EVERY CALL. Hand the result straight to a
  // prop or a dependency array and every memo below re-renders and every effect holding it fires, on
  // every render, forever.
  //
  // IT THEREFORE NEVER RECOMPUTES ACROSS MIDNIGHT, and that is recorded rather than fixed. `now` is
  // the shelf's clock, frozen at mount, so the calendar's last day is the date this screen opened
  // on. Everywhere the panel is a disclosure it is remounted often enough not to matter; the one
  // screen it can persist on is the empty device, where the panel IS the page and nothing unmounts
  // it. A player sitting on that screen through midnight finds the calendar one day short -- they
  // can still ask for every day up to yesterday, and the standing "Bring back today" primary reads
  // its date off the same frozen clock, so the two agree with each other and disagree with the wall.
  // Refreshing it means a second clock reading on this surface, which is the thing the injected
  // clock exists to prevent, for a case that ends the moment anything at all is fetched.
  const calendar = useMemo(() => allPackDates(now), [now])
  const months = useMemo(() => monthsOf(calendar), [calendar])
  const monthDates = useMemo(() => calendar.filter((date) => date.startsWith(month)), [calendar, month])
  const onDevice = useMemo(() => new Map(days.map((day) => [day.date, day])), [days])

  // ONE PASS OVER `solved`, SHARED BY EVERY ROW, and that is a measured requirement rather than a
  // tidiness preference. summarizeDay spreads the solved set and runs a regex per id, so calling it
  // per row is O(solved x rows): measured at 31 rows against 11,000 solved ids (about five years of
  // daily play, and lull:meta.solved is never pruned) it costs ~50ms on a desktop and plausibly
  // 150-300ms on a mid-range phone, on every render. The seven-day list alone would have been fine;
  // the month list is what makes this necessary.
  //
  // A day not on the device still has a count -- solved ids outlive their packs, which is the whole
  // reason summarizeDay takes a nullable pack -- so a missing key means zero, not unknown.
  const solvedByDate = useMemo(() => {
    const counts = new Map<PackDate, number>()
    solved.forEach((puzzleId) => {
      const date = packDateOf(puzzleId)
      if (date !== null) counts.set(date, (counts.get(date) ?? 0) + 1)
    })
    return counts
  }, [solved])

  // The empty device, derived rather than declared. See the note on `days`.
  const isEmptyDevice = days.length === 0

  // What the requested day's own row says instead of a count, and instead of its usual name. Only
  // the one row the request names is affected; every other row in the month is untouched.
  const requestCountFor = (date: PackDate): string | undefined =>
    request?.date === date
      ? { empty: 'No puzzles', failed: 'Didn’t arrive', landed: 'Here now', pending: 'On its way' }[request.state]
      : undefined

  // THE LANDED NAME DROPS THE COUNT the copy table gives it ("{Sat, 14 Mar} — {2} solved. Here
  // now."), deliberately. A day that has just come back has been solved zero times by definition, so
  // the table's string reads "Sat 14 Mar — 0 solved. Here now." on every day it can actually
  // describe -- the same zero this panel now strips from every other row that has never been here.
  // "Here now" is the whole of what changed and the whole reason to press it.
  //
  // IT CARRIES THE TAG, and that is not decoration. A request name replaces the ordinary one
  // outright, so a row wearing a visible "Today" whose name never says the word breaks 2.5.3 and
  // takes speech input's handle on the row with it. It is reachable on an ordinary morning east of
  // UTC: today's pack has not been generated yet, so today is not among `days`, so today's row in
  // the month list ASKS rather than opens -- and spends the whole wait tagged Today under a name
  // with no such word in it. Same string, from the same tagFor, as the name this one is standing in
  // for.
  const requestNameFor = (date: PackDate, label: string, tag: string): string | undefined =>
    request?.date === date
      ? {
          empty: `${label}${tag} — no puzzles.`,
          failed: `${label}${tag} — didn’t arrive. Try again.`,
          landed: `${label}${tag} — here now.`,
          pending: `${label}${tag} — on its way.`,
        }[request.state]
      : undefined

  const monthRowSelect = (date: PackDate, here: DaySummary | undefined): (() => void) | undefined => {
    // A day that came back empty is not a control: it permanently has nothing behind it.
    //
    // A DAY BEING FETCHED IS STILL A CONTROL, and that is the fix rather than an oversight. The spec
    // asks only for the 404 row to stop being pressable; taking the press away during the wait
    // unmounts the <button> the keyboard is sitting on at the moment of the press, which drops focus
    // to <body> for the whole thirty seconds. A second press just asks again, which is what the
    // retry does anyway.
    if (request?.date === date && request.state === 'empty') return undefined
    // A DAY THAT HAS LANDED OPENS. `days` is the shelf's retention window, so a March day that has
    // just arrived is not in it and `here` is undefined -- without this branch the row reading "Here
    // now" would fall through and ask for the day a second time.
    if (request?.date === date && request.state === 'landed') return () => onSelectDay(date)
    // Anything not on the device is ASKED FOR; a day already here OPENS rather than being asked for
    // twice. And when nothing is left to open in it, it stops being a control, exactly as it does in
    // the seven-day list above -- the same day appears in both lists and has to press the same way
    // in each.
    if (here === undefined) return () => onRequestDay(date)
    return isOpenable(here) ? () => onSelectDay(date) : undefined
  }

  const requestAnnouncement =
    request === null
      ? ''
      : {
          empty: `There are no puzzles for ${dayLabel(request.date, locale, now)}.`,
          failed: `${dayLabel(request.date, locale, now)} didn’t arrive.`,
          landed: `${dayLabel(request.date, locale, now)} is here.`,
          pending: `Bringing back ${dayLabel(request.date, locale, now)}…`,
        }[request.state]

  // "Choose another day above" LOST ITS DIRECTION WORD. The copy table wrote it while this block sat
  // at the foot of the panel, below the month list it was pointing at; it now sits above that list,
  // so "above" would point at the seven days already on the device -- the one set of days the
  // sentence does not mean. The spec made the same correction to Up Next's "above" for the same
  // reason: a component that does not own its position cannot make a claim about it.
  const requestAside =
    request === null
      ? ''
      : {
          empty: 'Trying again won’t help. Choose another day.',
          failed: 'The connection dropped before the day came back.',
          landed: '',
          pending: 'This can take up to half a minute. The days already on this device still open right away.',
        }[request.state]

  return (
    // The install-card notice grammar -- an r-lg plate with a rule edge -- and NOT a third
    // Shell+Plate. The date plate is already on screen directly above this, so a second double bezel
    // would make the technique background noise on the one screen that has both.
    //
    // The heading's id is BUILT here from panelId, and it is the region's accessible name: break it
    // and the role query in this component's test stops finding a named region.
    <section
      aria-labelledby={`${panelId}-heading`}
      className="rounded-[var(--lull-r-lg)] border border-[var(--lull-rule)] bg-[var(--lull-plate)] p-[var(--lull-s4)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.55)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.09)]"
      id={panelId}
    >
      {/* The eyebrow moves ABOVE the heading on the empty device and only there, because that screen
          collapses the panel's two sections into one: with no day rows between them, an uppercase
          category label printed under the heading it belongs to reads as a second, smaller heading. */}
      {isEmptyDevice && <p className={EYEBROW}>Any day</p>}
      <h2 className="lull-sign text-xl text-[var(--lull-ink)]" id={`${panelId}-heading`}>
        {isEmptyDevice ? 'Bring a day back' : 'Choose a day'}
      </h2>

      {/* Not an empty <ul>. A list with no items is still a list to a screen reader -- "list, 0
          items" -- and the empty device is the one screen where it would be announced. */}
      {!isEmptyDevice && (
        <>
          <ul className="mt-[var(--lull-s3)] flex flex-col gap-[var(--lull-s2)]">
            {days.map((day) => {
              const label = crumbLabel(day.date, locale, now)
              const isToday = day.date === todayDate
              return (
                <DayRow
                  accessibleName={accessibleNameFor(day, label, isToday)}
                  countLabel={countLabelFor(day)}
                  isToday={isToday}
                  key={day.date}
                  label={label}
                  // A day with nothing left to open is not a control. Passing undefined is how that
                  // is said -- see DayRow, where the branch lives.
                  onSelect={isOpenable(day) ? () => onSelectDay(day.date) : undefined}
                />
              )
            })}
          </ul>
          <p className="mt-[var(--lull-s3)] text-[12.5px] text-[var(--lull-muted)]">{deviceLine(days.length)}</p>
        </>
      )}

      <div className={isEmptyDevice ? 'mt-[var(--lull-s3)]' : OLDER_DAYS}>
        {!isEmptyDevice && <p className={EYEBROW}>Older days</p>}
        <p className={NOTE}>
          {isEmptyDevice
            ? 'You don’t have to wait. Name a day and Lull brings the whole day back.'
            : 'Name a day and Lull brings the whole day back.'}
        </p>

        {/* THE PANEL'S ONE PRIMARY WHEN THERE IS NOTHING ON THE DEVICE, and it is the same offer the
            month field makes, aimed at the one day the reader certainly wants. Every value it needs
            is already a prop, so this costs no widening of the contract.

            It is withheld while a request has FAILED, because the retry below is a primary too and
            two filled controls on one surface means neither is the offer (spec 10). It is withheld
            offline for the reason the month select is: a control that cannot do the thing it names
            is worse than no control.

            It stays mounted through `pending` on purpose -- see the focus effect above. */}
        {isEmptyDevice && isOnline && request?.state !== 'failed' && (
          <Button
            aria-label={`Bring back today, ${dayLabel(todayDate, locale, now)}.`}
            className="mt-[var(--lull-s3)]"
            onClick={() => onRequestDay(todayDate)}
            size="sm"
            variant="primary"
          >
            Bring back today
          </Button>
        )}

        {/* THE CAPTION IS OUTSIDE THE BRANCH, and that is the whole point of hoisting it: the field
            keeps the same name in both states. Online it is a <label> and is the combobox's
            accessible name; offline the face carries its own name ("Choose a month", which satisfies
            2.5.3 by being the visible text), and this word is the caption over it rather than an
            IDREF -- pointing aria-describedby at it would have the reader hear "Choose a month,
            Month" and learn nothing. Without this, the control went from "Month" to "Choose a
            month" with no caption at all when the connection dropped, which reads as two different
            controls -- the exact confusion the button-face substitution exists to avoid. */}
        {isOnline ? (
          <>
            <label className="mt-[var(--lull-s3)] block text-[12.5px] text-[var(--lull-muted)]" htmlFor={monthFieldId}>
              Month
            </label>
            <select
              className="mt-[var(--lull-s1)] min-h-11 w-full rounded-[var(--lull-r-md)] border border-[var(--lull-rule)] bg-[var(--lull-raised)] px-[var(--lull-s3)] text-[13.5px] text-[var(--lull-ink)]"
              id={monthFieldId}
              onChange={(event) => setMonth(event.target.value)}
              value={month}
            >
              <option value="">Choose a month</option>
              {months.map((key) => (
                <option key={key} value={key}>
                  {monthLabel(key, locale)}
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            <p className="mt-[var(--lull-s3)] text-[12.5px] text-[var(--lull-muted)]">Month</p>
            {/* NOT a disabled <select>. A native select ignores aria-disabled, so a screen-reader
                user would be walked through a month list to a day the app cannot go and get. A
                button face refuses the press and explains itself in the same breath. */}
            <Button
              aria-describedby={offlineNoteId}
              aria-disabled
              className="mt-[var(--lull-s1)] w-full"
              ref={monthFaceRef}
              size="sm"
            >
              Choose a month
            </Button>
            <p className={NOTE} id={offlineNoteId}>
              Older days need a connection. Try again while you’re online.
            </p>
          </>
        )}

        {isEmptyDevice && <p className={NOTE}>Any day back to 1 January 2026.</p>}

        {/* EVERYTHING THAT REPORTS ON THE FIELD SITS DIRECTLY UNDER THE FIELD, above the month list
            rather than below it. This is a deliberate deviation from the spec's layout, recorded
            there, and it serves what that layout was for: an open month adds up to 31 rows -- about
            1600px on a 390px-wide phone -- between the field and anything commenting on it. A player
            who pressed a row near the top of the list saw it change to "On its way" and never saw
            "This can take up to half a minute", which is the one sentence that stops them pressing
            again; on a dropped connection the "Try again" primary was an entire screen below the row
            that failed.

            ONE region, mounted empty before any press and never hidden. empty:h-0 rather than
            empty:hidden: `hidden` is display:none, which takes the element out of the accessibility
            tree entirely, so the region a screen reader was supposed to be already watching would
            not exist until the moment it gained text -- exactly the case this is written to avoid.
            All four messages write into this same node, and the test holds a reference across a
            re-render to prove it, because a region that remounts never announces.

            tabIndex={-1} is not a tab stop. It is what lets the focus effect above put the keyboard
            here when a 404 takes a row out from under it. */}
        <p
          className="mt-[var(--lull-s3)] text-[12.5px] text-[var(--lull-muted)] empty:mt-0 empty:h-0 empty:overflow-hidden"
          ref={statusRef}
          role="status"
          tabIndex={-1}
        >
          {requestAnnouncement}
        </p>

        {/* Outside the region on purpose, so it is not re-announced with every state change. */}
        {requestAside !== '' && <p className={NOTE}>{requestAside}</p>}

        {/* THE PANEL'S ONE PRIMARY once a request has landed badly -- when choosing is over and there
            is a single thing left to do. A dropped connection is transient, so a retry is the right
            offer; a 404 is permanent and gets no button at all.

            AND IT IS WITHHELD OFFLINE, on the same rule the month face and the standing offer are
            already withheld on: a control that cannot do the thing it names is worse than no
            control. With no connection this button round-trips through `pending` back to the
            identical failure in milliseconds -- it names a retry and delivers the same refusal,
            which is precisely how a player learns to distrust a button. It was the one control this
            file still offered offline that could not keep its promise, exempted with no argument
            recorded. The note under the month face -- "Older days need a connection. Try again while
            you're online." -- is on screen in exactly this state and says what the button would have
            failed to do, so nothing is lost with it gone. */}
        {request?.state === 'failed' && isOnline && (
          <Button
            aria-label={`Try again — ${dayLabel(request.date, locale, now)}.`}
            className="mt-[var(--lull-s3)]"
            onClick={() => onRequestDay(request.date)}
            size="sm"
            variant="primary"
          >
            Try again
          </Button>
        )}

        {month !== '' && isOnline && (
          <>
            <h3 className="lull-sign mt-[var(--lull-s4)] text-lg text-[var(--lull-ink)]" id={`${panelId}-month`}>
              {monthLabel(month, locale)}
            </h3>
            {/* The month heading's id is BUILT here from panelId, and it names this list.

                aria-busy RIDES THIS LIST, and the live region is not inside it. aria-busy on an
                ancestor of a live region tells assistive technology to hold announcements from
                inside it until the flag clears -- so a busy flag wrapping the status node would
                suppress "Bringing back ..." for exactly as long as it is the thing worth saying.
                The list is what is actually being updated: one of its rows is mid-fetch and about to
                change what it says and whether it can be pressed. */}
            <ul
              aria-busy={request?.state === 'pending'}
              aria-labelledby={`${panelId}-month`}
              className="mt-[var(--lull-s2)] flex flex-col gap-[var(--lull-s2)]"
            >
              {monthDates.map((date) => {
                const label = crumbLabel(date, locale, now)
                const here = onDevice.get(date)
                const isToday = date === todayDate
                const summary = here ?? { date, solvedCount: solvedByDate.get(date) ?? 0, status: 'notHere' as const }
                return (
                  <DayRow
                    accessibleName={
                      requestNameFor(date, label, tagFor(isToday, here !== undefined)) ??
                      accessibleNameFor(summary, label, isToday, here !== undefined)
                    }
                    countLabel={requestCountFor(date) ?? countLabelFor(summary)}
                    isHere={here !== undefined}
                    isToday={isToday}
                    key={date}
                    label={label}
                    onSelect={monthRowSelect(date, here)}
                  />
                )
              })}
            </ul>
            {month === FIRST_PACK_DATE.slice(0, 7) && (
              <p className={NOTE}>Lull began on 1 January 2026. There is nothing before it.</p>
            )}
          </>
        )}
      </div>

      {/* THERE IS NOTHING TO DISMISS ON THE EMPTY DEVICE, so the footer is withheld there -- the
          same `days.length === 0` every other difference on that screen is derived from.

          On that screen this panel IS the page: there is no date plate above it, nothing hidden
          behind it, and no control it was disclosed from. Pressing "Never mind" flipped a flag in
          the shelf that nothing on that branch reads and moved focus to a ref that is null, so the
          press did nothing at all -- and this file says twice that a control which cannot do the
          thing it names is worse than no control. It is the same argument the offline month face
          and the standing offer are already withheld on. */}
      {!isEmptyDevice && (
        <div className="mt-[var(--lull-s4)] flex justify-end">
          <Button onClick={onDismiss} size="sm" variant="quiet">
            Never mind
          </Button>
        </div>
      )}
    </section>
  )
}
