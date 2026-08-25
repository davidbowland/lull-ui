import React from 'react'

export interface DayRowProps {
  // Built by the parent from the same visible strings below, so speaking what is on screen matches
  // the row (WCAG 2.5.3). The copy review caught exactly this failure on the "Here" tag: the visible
  // word was paraphrased in the name, so speech input had nothing to match.
  //
  // WHICH IS WHY THE NAME KEEPS THE CLIPPED SYLLABLES. A reader hears "Wed" and "Aug" rather than
  // "Wednesday" and "August", and that is forced, not an oversight: the visible label is the short
  // `toLocaleDateString` cut, and 2.5.3 requires the visible text to be CONTAINED IN the accessible
  // name. Spelling the words out would break the containment and take speech input's only handle on
  // the row with it. Do not "improve" this by expanding the name.
  accessibleName: string
  // '6 solved' | 'All solved' | 'No puzzles' | 'On its way' | 'Here now' | 'Didn't arrive'.
  // The parent owns every one of these, because which applies depends on facts a row cannot see.
  countLabel: string
  isHere?: boolean
  isToday?: boolean
  label: string
  // ABSENT MEANS THIS IS NOT A CONTROL. Not a disabled button, not a link with no href -- nothing
  // pressable at all.
  onSelect?: () => void
}

// THE GEOMETRY, and the comment here used to claim a shared track between rows. It was never true:
// every row is its own grid container, so no track is shared with the row above or below it. What
// actually lines the rows up is that the cells are RIGHT-PACKED against a right-hand width that is
// the same on every row -- which is only the case if every row draws all four cells, which is why
// the tag and the chevron are rendered as empty spans rather than omitted. Drop either one on the
// rows that do not need it and grid auto-placement slides the count left into the vacated column:
// 28px of travel between two adjacent rows in a list of near-identical rows, and the worst case was
// today's own row on the day it gets finished.
//
// Four tracks, and `minmax(0,1fr)` for the label is the load-bearing half. A bare `1fr` is
// `minmax(auto,1fr)`, whose automatic minimum is the item's own content -- and the label carries
// `white-space: nowrap` from `truncate`, so its content is the full width of the string. The track
// then refuses to shrink, `truncate` never gets to ellipsize, and a long date in German or
// Portuguese pushes the row into a horizontal overflow at 320px instead.
//
// --lull-rule, NOT --lull-hair, for the reason components/shelf spells out on CARD: the edge is what
// makes a row read as a target, so it is identifying a user interface component and 1.4.11 holds it
// to 3:1 -- which hair cannot reach on any surface and is forbidden from trying by its own contract
// in colors.ts. rule on raised measures 4.199 light and 3.296 dark and is already registered.
//
// --lull-raised and not --lull-plate: the panel this row lands in is itself a plate, and a row that
// shares its container's fill has no figure/ground separation from it at all.
const ROW =
  'grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-[var(--lull-s3)] ' +
  'rounded-[var(--lull-r-md)] border bg-[var(--lull-raised)] ' +
  'px-[var(--lull-s3)] py-[var(--lull-s2)] text-left'

// THE LIFT, THE RULE EDGE AND THE INSET HIGHLIGHT ALL LIVE ONLY ON THE PRESSABLE BRANCH.
//
// The lift is the same split ROW_LINK makes in components/shelf: a row that rises under the pointer
// advertises that pressing it does something, and on a row that does nothing that is a promise
// broken on every pointer device.
//
// The edge and the highlight are the same argument carried to touch, where there IS no hover to
// correct a wrong first read. Shelf's CARD says outright that the card edge is what makes a row read
// as a target; give the dead row the identical edge and identical lit top and it reads as pressable
// until a finger proves otherwise. This panel is where that bites and the shelf is not: here the two
// kinds of row sit next to each other in one list, up to 31 of them in the month view, so the
// comparison a player needs is available on screen.
//
// Nothing in this suite can catch any of the three -- style assertions are forbidden here and jsdom
// lays nothing out -- so the split is stated here and the reason it cannot be pinned is stated with
// it.
const ROW_PRESSABLE =
  `${ROW} cursor-pointer border-[var(--lull-rule)] ` +
  'shadow-[inset_0_1px_1px_rgba(255,255,255,0.55)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.09)] ' +
  'transition-transform duration-[420ms] ease-[cubic-bezier(0.22,0.68,0.12,1)] hover:-translate-y-[2px]'

// THE ONE PLACE IN THIS PRODUCT WHERE --lull-hair MAY DRAW A ROW'S EDGE, and it is worth saying why
// the contract in colors.ts is not being bent. Hair is forbidden from bounding "a control or its
// state". A row with no `onSelect` is not a control -- that is the entire point of the branch -- so
// there is no component for this edge to identify and 1.4.11 has nothing to hold it to. On the
// pressable branch the same edge WOULD be identifying a control, and hair there would be the exact
// drift colors.ts describes.
//
// The state itself is never read from this edge either: which day it is and what is left in it are
// carried by the words in the row.
const ROW_DEAD = `${ROW} border-[var(--lull-hair)]`

const TAG = 'shrink-0 text-[11px] font-semibold tracking-[0.09em] uppercase text-[var(--lull-muted)]'
const COUNT = 'shrink-0 text-[12px] text-[var(--lull-muted)] tabular-nums'

// THE PRODUCT'S CHEVRON, not a new one. This is the same 6x10 path the spine draws between crumbs
// and the install card puts in its nub -- drawn pointing right already rather than drawn downward
// and rotated -- so "forward" keeps meaning the same thing on every surface.
const CHEVRON = (
  <svg
    aria-hidden="true"
    className="ml-[var(--lull-s1)] shrink-0 text-[var(--lull-muted)]"
    fill="none"
    height="10"
    viewBox="0 0 6 10"
    width="6"
  >
    <path d="m1 1 4 4-4 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
  </svg>
)

// The chevron's cell WITHOUT the glyph, so a row that does not open still reserves the column and
// the count beside it lands where it lands on every other row. The width is the glyph's, taken from
// the svg above; keep the two in step. It draws nothing, so there is no promise of a press here.
const CHEVRON_SLOT = <span aria-hidden="true" className="ml-[var(--lull-s1)] w-[6px] shrink-0" />

export const DayRow = ({
  accessibleName,
  countLabel,
  isHere,
  isToday,
  label,
  onSelect,
}: DayRowProps): React.ReactNode => {
  // Today wins when a day is both. In the seven-day list today is never also "here", but in the
  // month list it routinely is -- the parent passes isHere for any day whose pack is on the device,
  // and today's is. Two tags would say the same thing twice and the less useful one second.
  //
  // THE PARENT'S accessibleNameFor MAKES THE SAME CHOICE, in another file, with nothing tying the
  // two together. If they ever disagree the visible word stops being in the name and 2.5.3 breaks
  // silently, which is why both sides carry a test for this case rather than only the one that
  // renders it.
  const tag = isToday === true ? 'Today' : isHere === true ? 'Here' : ''

  // Everything visible is aria-hidden and the name is spoken once, from one string, so the two can
  // never drift into disagreement.
  const contents = (
    <>
      <span aria-hidden="true" className="truncate text-[13.5px] text-[var(--lull-ink)]">
        {label}
      </span>
      {/* Rendered even when empty. See ROW: the cells are what hold the count at one x. */}
      <span aria-hidden="true" className={TAG}>
        {tag}
      </span>
      <span aria-hidden="true" className={COUNT}>
        {countLabel}
      </span>
    </>
  )

  // A day with nothing to open is not a control at all -- not a disabled button, not a link without
  // an href. Same rule ShelfRow follows for a puzzle the shell would refuse to mount: a link to a
  // dead end is a trap the player was invited into, so there is nothing to press and therefore
  // nothing to keep in the tab order.
  if (onSelect === undefined) {
    return (
      // aria-current RIDES THE <li> ON THIS BRANCH, and on the <button> on the other. Both are the
      // row; the difference is that the button has a role every screen reader maps, while the row
      // element here is a plain <div> whose generic role makes exposure of any ARIA state on it a
      // coin flip. The <li> has listitem. This matters most on precisely the state that lands here:
      // today, once today is finished, is a dead row.
      <li aria-current={isToday === true ? 'date' : undefined}>
        <div className={ROW_DEAD}>
          {/* THE ROW'S ONE PIECE OF REAL TEXT, and it is not decoration for the aria-label this used
              to carry. A `role="group"` with an aria-label and nothing but aria-hidden descendants
              has a name and zero accessible children, and a container with no accessible children is
              not a stop in swipe navigation: iOS VoiceOver and Android TalkBack swipe straight past
              it in silence. On an installed PWA whose primary surface is a phone, that silently lost
              a finished day -- up to 31 of them in the month list.

              The comment that shipped here claimed this followed ShelfRow. It did not: shelf's
              undrawable row leaves its text UNHIDDEN and lets it read in place, which is what makes
              "a screen reader reads it in place while working down the list" true there. sr-only
              text is the same thing for a row whose visible cells are hidden, and it is how
              crypticclue, themedanagrams and missingvowels each say something a reader needs and a
              player does not. The <li> supplies the listitem role; nothing here needs a role of its
              own. */}
          <span className="sr-only">{accessibleName}</span>
          {contents}
          {CHEVRON_SLOT}
        </div>
      </li>
    )
  }

  return (
    <li>
      {/* A BUTTON AND NOT A LINK, decided rather than defaulted. Selecting a day pushes `?d=…`, and a
          <Link> would keep middle-click, cmd-click and "Copy link address" the way ShelfRow does.
          What settles it is the month list, where this same row type calls onRequestDay -- a fetch,
          not a navigation, with nothing to copy the address of. One row type cannot be both, and a
          row that is a link on one surface and a button on another is worse than either. */}
      <button
        // "date", not "true". aria-current takes a token naming WHAT the element is the current one
        // of, and the shelf's Spine spends "page" on the same you-are-here job for a different kind
        // of thing.
        aria-current={isToday === true ? 'date' : undefined}
        aria-label={accessibleName}
        className={ROW_PRESSABLE}
        // Wrapped, not passed. `onClick={onSelect}` hands the parent's `() => void` React's synthetic
        // mouse event as its first argument, which typechecks and then quietly arrives somewhere
        // that never asked for it. Button (components/button) closes the same gap the same way.
        onClick={() => onSelect()}
        type="button"
      >
        {contents}
        {CHEVRON}
      </button>
    </li>
  )
}
