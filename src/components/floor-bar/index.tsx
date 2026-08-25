import React from 'react'

export interface FloorBarProps {
  children: React.ReactNode
  // The half of an announcement a SIGHTED player is already reading off the board. It is announced
  // with the message and never drawn, so the ribbon says one short thing and a screen reader hears
  // the whole of it.
  //
  // IT EXISTS BECAUSE THE CLAMP WAS DECIDING THIS BADLY. Two lines of ribbon against a per-letter
  // marking runs out inside the first word -- the guess bench's `HOT HAND. H no more of this
  // letter, O in place, T elsewhere in this word...` filled both lines with a transcript of the
  // grid and then trailed off in an ellipsis, so the one reader it was drawn for could not finish
  // it and the one reader who needs it never saw it in the first place. Splitting the string is
  // what the clamp was standing in for.
  //
  // INSIDE the live region and AFTER the visible text, so the region announces head then tail in
  // one utterance. It is not a second region and must never become one: two live regions in one
  // band race each other.
  detail?: string
  message: string
  // What the ribbon says when the bench has reported nothing. Optional, and empty is the same as
  // absent: a bench with nothing standing to say leaves the band blank rather than filling it with
  // something the board already says.
  resting?: string
  // `seam` is the constant: exactly --lull-seam tall, whatever is in it. `compact` is the one
  // exception in the product and it is stated rather than hidden -- see the writing bench, whose
  // instrument is one row (the box you type in and the control that checks it) and whose floor used
  // to reserve a keypad's worth of near-black for an on-screen keyboard it does not have.
  variant?: 'compact' | 'seam'
}

// The seam. Every bench puts a different instrument here -- a keypad, a tile tray, a lone
// control -- and the one thing that makes them read as a single product is that the instrument
// sits exactly --lull-seam up from the bottom edge, at every viewport height, in every state. A
// player stops looking at a keypad that never moves; a keypad that drifts has to be found again
// every time.
//
// The safe-area inset is ADDED to the seam rather than taken out of it, and that is load-bearing.
// With the inset living inside a fixed height, a notched iPhone spent 34 of the instrument's own
// pixels on the home indicator, so the same keypad had 34px less room on the devices most likely
// to be running this app and the bottom row was clipped away silently. --lull-seam is the
// instrument's budget; the inset is the clearance underneath it.
const HEIGHT = {
  // Ribbon 52 + instrument + safe strip 9, and the instrument is what the arithmetic is for.
  compact: 'pb-[env(safe-area-inset-bottom)]',
  seam: 'h-[calc(var(--lull-seam)+env(safe-area-inset-bottom))]',
} as const

// The box the instrument sits in, and the two variants size it differently on purpose.
//
// Under `seam` the floor has a fixed height, so this takes the remainder and scrolls it. NOT
// `overflow-hidden`: hidden does prevent the real failure -- a child that overflows a visible box
// still contributes scrollable overflow to the viewport, which would let the page scroll the
// instrument off the bottom of the screen -- but it converts an oversized instrument into
// permanently unreachable controls with no scrollbar and no signal, which is the worse of the two.
//
// Under `compact` the floor has NO height of its own, and `flex-1` is deliberately absent. A
// `flex: 1 1 0%` item in an auto-height column has a flex base size of zero, so the container's
// own height would be derived from an item that claims to want none -- which browsers do resolve
// sensibly today, and which is a subtle thing to be relying on for the only box in the layout
// whose height is pinned by nothing at all. Left alone, this box is exactly as tall as the control
// in it, which is the whole of what `compact` means.
const WELL = {
  compact: 'flex flex-col',
  seam: 'flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto',
} as const

// TWO reserved lines, and the whole of what the seam spends on saying things.
//
// It used to reserve three, measured against the longest message the product can produce, and the
// measurement was right about the text and wrong about the cost: the ribbon is empty on arrival
// and stays empty until the first keystroke, so every board opened with 77px of unbroken
// near-black standing between the phrase and the pad. On a laptop window that is most of the
// bottom third of the screen, and the band paying for it is the board.
//
// Two lines at 13px/1.35 is about 88 characters at a 320 viewport and well over 200 on a desktop
// measure, so the messages that overrun it are the two longest the cipher bench can produce: an
// assignment that also fills the board, and a steal that empties one square and frees a letter and
// then names where the caret went. Both are clamped, and the clamp is what decides WHICH half
// survives.
//
// It clamps the TAIL, and that is the point. An earlier draft let the text grow upward out of the
// band, out of flow, over the bottom of the phrase -- and on the three benches that carry a hint bar
// that bought exactly nothing: the floor's top edge is the bar's bottom edge, so a third line grows
// into the bar's 60px and every pixel of it is behind an opaque strip. What it changed was which
// half you lose. Anchored to the bottom, the line that disappears is the FIRST one -- "Every Q is Z
// now, 12 squares" -- and the positional tail survives. Clamped, the sentence keeps its head and
// loses its tail, which is the same priority `assign` already applies when it chooses between the
// full-board notice and the `Now on ...` tail. The whole string stays in the DOM either way, so the
// live region announces it entire.
const RIBBON =
  'flex h-[52px] shrink-0 items-center gap-2 border-b ' +
  'px-[var(--lull-s4)] py-[var(--lull-s2)] text-[13px] leading-[1.35] text-[var(--lull-floor-ink)]'

// The hairline under the ribbon belongs to the MESSAGE, not to the band, and that is not a detail.
// The band is reserved space and it is empty until the player's first move, so a rule drawn under
// it always turned 52px of nothing into a container -- an empty bar with a line under it, sitting
// between the board and the instrument, which on the tile bench (no hint bar above it, a tray with
// gaps below it) read as a piece of the layout that had failed to load. Drawn only alongside the
// text, the same way the accent dot is, it is a rule under a sentence.
//
// Transparent rather than absent, so the border-box height stays 52 either way and nothing below
// it moves by a pixel when a message arrives.
const RIBBON_RULE = { empty: 'border-transparent', said: 'border-[var(--lull-floor-rule)]' } as const

// The resting line, laid over the ribbon rather than beside it, and that is the whole trick: the
// live region has to be MOUNTED and EMPTY at the same time, so it cannot be the element that also
// holds this text and it cannot be swapped out for one that does. Two boxes in flow would stack to
// 104px in a band budgeted at 52, so the standing line is taken out of flow and pinned over the
// region it never enters.
//
// Quieter than a message, deliberately. --lull-floor-muted clears 4.5:1 on the floor in both themes
// (contrast.test.ts holds the pair), and it carries no accent dot and draws no hairline -- so a
// message arriving on top of a resting line is a visible event even when the two say similar
// things, which is exactly the case on the cipher bench.
const RESTING =
  'absolute inset-0 flex items-center px-[var(--lull-s4)] py-[var(--lull-s2)] text-[13px] ' +
  'leading-[1.35] text-[var(--lull-floor-muted)]'

export const FloorBar = ({
  children,
  detail = '',
  message,
  resting = '',
  variant = 'seam',
}: FloorBarProps): React.ReactNode => (
  <div
    // lull-floor is not decoration: index.css scopes the focus ring to it, because the global ring
    // is keyed to an accent chosen to read on a LIGHT ground and this band is dark in both themes.
    className={`lull-floor flex shrink-0 flex-col border-t border-[var(--lull-rule)] bg-[var(--lull-floor)] ${HEIGHT[variant]}`}
  >
    {/* The band, not the region. `relative` is what the resting line is measured against, and
        `shrink-0` is what the ribbon used to carry itself -- the 52px belongs to the band now that
        two things can occupy it. */}
    <div className="relative shrink-0">
      <p
        // role="status" carries an implicit aria-atomic="true" in ARIA 1.2, under which every new
        // message re-reads the entire region. The messages here change a word at a time while a
        // player is mid-solve, so the region is stated non-atomic.
        aria-atomic="false"
        className={`${RIBBON} ${message === '' ? RIBBON_RULE.empty : RIBBON_RULE.said}`}
        role="status"
      >
        {/* Mounted always, and empty on first render. NVDA and JAWS announce changes inside a region
            they are already watching, so a role="status" element inserted with its message already in
            it is routinely missed. That is also why the dot renders only alongside a message: it would
            make the region non-empty at mount and cost the first announcement.

            It is also why the resting line below is a SIBLING and not a child. A standing line inside
            this element would make the region non-empty at mount and cost the bench its first
            announcement -- which on a restored board is the one that matters most. */}
        {message !== '' && (
          <>
            <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-[var(--lull-floor-accent)]" />
            <span className="line-clamp-2">{message}</span>
            {/* THE SPACE IS INSIDE THE TEMPLATE, not between the two elements, and that is not
                cosmetic: textContent concatenates adjacent nodes with nothing between them, so a
                detail rendered as a bare `{detail}` would announce `HOT HAND.H no more of this
                letter` -- two sentences run together in the one place nobody can see them to catch
                it.

                Rendered only alongside a message, like the dot is, so the region is still empty at
                mount and the first announcement is not spent on standing text. */}
            {detail !== '' && <span className="sr-only">{` ${detail}`}</span>}
          </>
        )}
      </p>
      {/* Not aria-hidden. It is ordinary standing text in the floor, read in place by a screen
          reader the way the board's own instruction is, and it is outside the live region so
          leaving it there costs no announcement. */}
      {message === '' && resting !== '' && (
        <p className={RESTING}>
          {/* Clamped like a message is, and for the same reason: this band is 52px whatever is in
              it, and text allowed to grow out of it would be drawn behind the hint bar above. */}
          <span className="line-clamp-2">{resting}</span>
        </p>
      )}
    </div>
    <div className={WELL[variant]}>
      {children}
      <div
        aria-hidden="true"
        // Clears the iOS home indicator, which resolves to anything at all only because _app.tsx
        // ships viewport-fit=cover; without cover iOS insets the layout viewport itself and every
        // env(safe-area-inset-*) reads 0, putting the instrument's bottom row under the indicator
        // where the system eats the taps.
        //
        // No padding of its own -- the inset is in this bar's height, so the strip simply takes the
        // slack. flex-1 so that slack lands here rather than under the ribbon, and min-h-2 so there
        // is a hairline of floor below the instrument even on a device with no inset at all.
        className="min-h-2 flex-1"
      />
    </div>
  </div>
)
