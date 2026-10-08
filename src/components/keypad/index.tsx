import React, { useRef, useState } from 'react'

import { CELL, HALF, PAD, ROW, ROWS, WIDE } from './layout'

// THE PAD, and it is one component because it is one instrument. The cipher bench and the guess
// bench each hand-rolled a 7x4 grid of twenty-eight buttons over the same
// `'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')`, which read as a tolerable duplicate right up to the
// moment the letter order changed -- at which point it was two edits that had to agree, in two
// files, with nothing anywhere able to notice if they did not.
//
// WHAT IS SHARED IS THE SHAPE, and the split is worth stating because it is where every future
// change to this file has to land. This component owns the rows, the key sizes, the gridlines, the
// tab order and the fact that two utility keys stand at the ends of row three. It owns NO color, NO
// verdict, NO annotation and NO sentence: the guess bench's strike and the cipher bench's `= Z` are
// nodes their own boards build and pass in, because the two pads share a rectangle and share almost
// nothing else about what a key means.
//
// IT IS NOT A BOARD PROP AND NEVER BECOMES ONE. PuzzleComponentProps is six things and this is not
// among them: a board imports the pad the same way it imports FloorBar, which is a component in the
// app rather than a capability handed to it. Nothing here routes, stores, or fetches.

// SHAPE ONLY, and no color at all -- which is load-bearing rather than tidy. The cipher bench's old
// key string set `text-[var(--lull-floor-ink)]` and its utility string set
// `text-[var(--lull-floor-accent)]`, so the two words on the pad carried both at once and which one
// painted came down to the order Tailwind happened to emit them in. The guess bench had already
// split its own for exactly that reason. One color source per key, always, and it arrives as `tone`.
// No `min-w-0` here: CELL and WIDE each carry their own, because the reason for it is a flex basis
// and the flex basis is theirs. Setting it in both places emitted the utility twice on every key.
const KEY = 'flex cursor-pointer flex-col items-center justify-center gap-[2px] leading-none font-semibold'

// On the letter itself rather than on the key, so a utility key can set its own size without two
// arbitrary font-size utilities racing each other in the generated stylesheet.
const LETTER = 'text-[17px]'

// The two utility keys, sized so they read as words among single letters. `Delete` sets about 36px
// at 11.5px in Source Serif 4 with 0.05em of tracking, against the 46.6px a one-and-a-half-unit key
// draws at a 320 viewport -- room on both sides, and more of it than the four-row pad had.
const UTILITY = 'text-[11.5px] tracking-[0.05em]'

export interface LetterKey {
  // Drawn OVER the letter, inside the same relative box, so a rule through it is measured against
  // the glyph rather than against the whole key. The guess bench's strike; nothing on the cipher
  // bench.
  mark?: React.ReactNode
  // What a screen reader hears. The bare letter is never enough on either bench -- one says what
  // the key is on, the other says whether it is worth pressing -- so this is required rather than
  // defaulted to the letter.
  name: string
  // Drawn UNDER the letter. The cipher bench's `= Z`; nothing on the guess bench. A node rather
  // than a string, because the board owns how its own annotation is set.
  note?: React.ReactNode
  // The key's one color source: ground, ink, hover and the press state (`data-[down=true]:`, set
  // on the key a gesture will commit -- never `active:`, which stays on the key first touched). See KEY.
  tone: string
}

export interface UtilityKey {
  // The word on the key.
  label: string
  // The accessible name, when it is not the label. `Play again` does not fit a key and `Again`
  // does, and 2.5.3 Label in Name is satisfied because the visible label is contained in the name.
  // Left undefined, the label is the name.
  name?: string
  onClick: () => void
  // As LetterKey's, and the two utility keys take a different one: they are not letters and can
  // never carry a verdict.
  tone: string
}

export interface KeypadProps {
  // The group's accessible name, and it has to FOLLOW THE KEYS. The guess bench swaps `Guess` for
  // `Play again` when the board is over, and a group still promising a `Guess` button would send a
  // screen-reader user navigating by group to look for a control that is not in it.
  label: string
  // What each letter key looks like and is called, asked once per letter per render.
  letter: (plain: string) => LetterKey
  onPress: (plain: string) => void
  // EXACTLY TWO, and the tuple is the point: they stand at the two ends of row three, which is what
  // makes that row nine cells wide like the one above it. A third tool would have nowhere to stand
  // without reflowing the rectangle, so the type refuses one rather than letting it wrap.
  //
  // [LEFT, RIGHT], AND DELETE GOES LEFT ON EVERY PAD. That is a convention this component cannot
  // enforce -- both slots take the same type -- so it is written here, where both benches read it.
  //
  // Delete is the only tool BOTH pads have, so Delete is the one that has to be in a fixed place: a
  // player who learns the eraser on one bench has to find it in the same corner on the other, and
  // that is worth more than either bench's local preference for its own second key. The right-hand
  // slot then takes whatever that bench does instead -- `Guess` on the guess bench, `Undo` on the
  // cipher bench.
  //
  // IT COSTS SOMETHING ON THE GUESS BENCH AND THE TRADE IS DELIBERATE. `Guess` is irreversible by
  // design -- a committed guess is permanent, that is the game -- and the right-hand end of the
  // bottom row is where a right thumb rests, so the unrecoverable action now sits in the most
  // mis-tappable spot on the pad. Three things pay for it: Guess does nothing at all until the row
  // is full (it answers `Fill every tile first.` and spends no attempt), it is pressed at least
  // once per row against an eraser pressed on some rows and not others, and every form on the
  // device this ships to puts the confirming control on that side.
  //
  // Wordle puts Enter left and Backspace right, and this is the one place the pad departs from it.
  utility: readonly [UtilityKey, UtilityKey]
  // A TEST SEAM, and one of the two props here no board passes (`now` is the other). jsdom lays nothing out, so every rect it
  // reports is 0x0 and the geometry below -- nearest key, the 6px correction, the slide -- could not
  // be exercised at all. The keypad's own suite hands in rects it wrote by hand; a board cannot,
  // because its props are fixed, and its suite runs the no-layout path instead.
  rectOf?: (element: Element) => DOMRect
  // THE CLOCK, and the second test seam. It is read only to answer one question --
  // how long ago did the last pointer gesture end? -- and CLAUDE.md's non-determinism rule is why
  // it is a prop rather than a bare `performance.now()`: the click window below decides whether a
  // key types, so a suite has to be able to stand 500ms or 1500ms past a release without waiting
  // for either. One clock for both readings, never mixed with `event.timeStamp`, whose origin a
  // test cannot set.
  now?: () => number
}

// HOW FAR UP A FINGER IS READ, in CSS pixels. A thumb lands below the point its owner was aiming
// at -- the pad of the thumb is under the nail, and the nail is what the eye lines up -- and on
// 59px rows the miss was the key below, "100% of the time" in the words of the people who play
// this. Six is one fixed constant, not a learned one: nothing here stores where anyone touches.
// Touch and pen only. A mouse pointer is a hotspot, and its hotspot is where it is aimed.
const TOUCH_LIFT = 6

// THE PREVIEW BUBBLE: the key's own letter, drawn above the thumb that hides it, so the player
// sees what will count BEFORE it counts. Fixed rather than absolute, because the floor's well
// clips its overflow and an absolute child above the pad would be cut off at the ribbon.
//
// Tokens only, and borrowed: the floor's rule for the edge, the medium radius, and the hint
// sheet's shadow, which is this design's one word for "laid over the page". No transition: it
// appears and disappears, so there is nothing for prefers-reduced-motion to turn off.
// pointer-events-none so it can never be what a finger lands on.
const BUBBLE =
  'pointer-events-none fixed z-2 flex h-[64px] flex-col items-center justify-center gap-[2px] leading-none ' +
  'rounded-[var(--lull-r-md)] border border-[var(--lull-floor-rule)] ' +
  'shadow-[0_8px_28px_rgba(0,0,0,0.16)] dark:shadow-[0_8px_28px_rgba(0,0,0,0.55)]'
const BUBBLE_W = 60
const BUBBLE_W_UTILITY = 80
const BUBBLE_H = 64
// Between the bubble's bottom edge and the key's top edge, and between the bubble and the viewport.
const BUBBLE_GAP = 8
const BUBBLE_INSET = 6

// The two utility keys are named by POSITION, never by label, because their labels change under a
// gesture's feet: the guess bench swaps `Guess` for `Again` when the board is over.
const UTILITY_KEYS = ['utility-0', 'utility-1'] as const

// HOW LONG AFTER A POINTER GESTURE ENDS ITS CLICK IS STILL EXPECTED, in milliseconds. See
// onClickCapture. Longer than any delay iOS puts on a tap's click, which it dispatches on a
// separate path from the pointer events and which can land after the next finger is already down,
// and far shorter than a person takes to lift a thumb and come back to a key by keyboard, switch
// or screen reader.
const CLICK_WINDOW = 1000

const defaultRectOf = (element: Element): DOMRect => element.getBoundingClientRect()

const defaultNow = (): number => performance.now()

// React Aria's `isAndroid` (@react-aria/utils), narrowed to the user agent string. See the virtual
// pointer test in onPointerDown, which is the only thing that asks.
const isAndroid = (): boolean => /Android/i.test(navigator.userAgent)

const contains = (rect: DOMRect, x: number, y: number): boolean =>
  x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom

const clamp = (value: number, low: number, high: number): number => Math.min(Math.max(value, low), high)

// Squared distance from a point to a rect, 0 inside it. Squared because only the order matters.
const distance = (rect: DOMRect, x: number, y: number): number => {
  const dx = Math.max(rect.left - x, 0, x - rect.right)
  const dy = Math.max(rect.top - y, 0, y - rect.bottom)
  return dx * dx + dy * dy
}

interface Gesture {
  // The key the gesture would commit, or null when the press began on no key at all (a gridline,
  // on the no-layout path).
  key: string | null
  // False while the RAW point is outside the pad -- the cancel state. Raw, not corrected: a finger
  // that has visibly left the pad has left it, whatever 6px would say.
  inside: boolean
  pad: DOMRect
  pointerId: number
  pointerType: string
  // Every key's rect, read once at pointerdown. Null is the NO-LAYOUT PATH: see onPointerDown.
  rects: ReadonlyMap<string, DOMRect> | null
}

interface Down {
  key: string
  pointerType: string
  rect: DOMRect
}

export const Keypad = ({
  label,
  letter,
  now = defaultNow,
  onPress,
  rectOf = defaultRectOf,
  utility,
}: KeypadProps): React.ReactNode => {
  // In a ref, because pointer events arrive faster than renders and every handler has to see the
  // gesture as the previous event left it, not as the last render did.
  const gesture = useRef<Gesture | null>(null)
  // What is drawn: the down mark and the bubble. Null both with no gesture and in the cancel state.
  const [down, setDown] = useState<Down | null>(null)
  // When the last pointer gesture ended, on `now`'s clock -- committed, canceled, or ended by a
  // rollover. Minus infinity until one has, so a pad no finger has touched swallows no click. See
  // onClickCapture.
  const lastGestureEnd = useRef(-Infinity)

  const activate = (key: string): void => {
    const slot = UTILITY_KEYS.indexOf(key as (typeof UTILITY_KEYS)[number])
    if (slot >= 0) {
      utility[slot].onClick()
    } else {
      onPress(key)
    }
  }

  const show = (current: Gesture): void => {
    if (current.key === null || !current.inside) {
      setDown(null)
      return
    }
    const rect = current.rects?.get(current.key)
    setDown({ key: current.key, pointerType: current.pointerType, rect: rect ?? current.pad })
  }

  // Ends the active gesture the way its pointerup would: the down key counts only when the finger
  // was last seen inside the pad. Shared by pointerup and by a rollover, so a second finger can
  // never make the first one count where lifting it would not have. Every end of a gesture passes
  // through here, so this is the one place its time is written down.
  const finish = (commit: boolean): void => {
    const current = gesture.current
    gesture.current = null
    lastGestureEnd.current = now()
    setDown(null)
    if (commit && current !== null && current.inside && current.key !== null) {
      activate(current.key)
    }
  }

  const resolve = (current: Gesture, x: number, y: number): string | null => {
    if (current.rects === null) {
      return current.key
    }
    const lift = current.pointerType === 'mouse' ? 0 : TOUCH_LIFT
    // Clamped INTO the pad before anything is measured. This prevents nothing on its own: nearest
    // resolution below already gives every point, inside the pad or out of it, to some key, so a
    // lifted tap on the top row could never land on nothing. The clamp states that guarantee in
    // the coordinates themselves -- the point measured is always one the pad covers.
    const px = clamp(x, current.pad.left, current.pad.right)
    const py = clamp(y - lift, current.pad.top, current.pad.bottom)
    let best: string | null = null
    let bestDistance = Infinity
    // NEAREST, not containing: the half-key indents and the 1px gridlines belong to whichever key
    // is closest, so no part of the pad is a dead zone that swallows a press.
    for (const [key, rect] of current.rects) {
      const d = distance(rect, px, py)
      if (d < bestDistance) {
        best = key
        bestDistance = d
      }
    }
    return best
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    // Only the primary button presses a key, as a click only ever came from the primary button.
    if (event.button !== 0) {
      return
    }
    // A VIRTUAL POINTER: assistive technology activating a key on the player's behalf. TalkBack's
    // double-tap dispatches pointerdown and pointerup at the key's center as a 1x1 `mouse` with no
    // pressure, then a click with `detail` 0; iOS VoiceOver's virtual pointers are 0x0. Left to the
    // gesture, pointerup would type the key and the detail-0 click would sail past onClickCapture
    // and type it again. So a virtual press starts no gesture and records no time, and the click
    // that follows is its one activation, through the key's own onClick, as a keyboard's is.
    //
    // The test is React Aria's `isVirtualPointerEvent` (@react-aria/utils), copied whole as a
    // heuristic rather than imported as a dependency, and every clause in it is load-bearing:
    //
    // - 0x0 counts as virtual EXCEPT ON ANDROID, where some devices report a real finger's contact
    //   as 0x0. Read as virtual, every press on such a phone would lose the lift, the slide and the
    //   bubble -- the whole point of this component -- and TalkBack is caught by the clause below.
    // - 1x1 with no pressure counts as virtual only for a `mouse` ON ANDROID, and only with
    //   `detail` 0. Desktop Safari reports a real mouse's pressure as 0 (WebKit bug 206216) and a
    //   real press's `detail` as 1; Firefox on a Windows touch screen reports 1x1 `touch`. Each
    //   would otherwise be a real press read as a virtual one.
    const { detail, height, pointerType, pressure, width } = event
    const android = isAndroid()
    if (
      (!android && width === 0 && height === 0) ||
      (android && width === 1 && height === 1 && pressure === 0 && detail === 0 && pointerType === 'mouse')
    ) {
      return
    }
    // A ROLLOVER: a second finger down while the first is still on the glass. The first finger ends
    // here, exactly as lifting it would have ended it, so a fast two-thumb typist loses no letter
    // and gains no extra one.
    if (gesture.current !== null) {
      finish(true)
    }
    const pad = event.currentTarget
    const padRect = rectOf(pad)
    // THE GESTURE IS SET BEFORE THE POINTER IS CAPTURED, so a capture that throws still leaves a
    // press for pointerup to commit, and that pointerup still records the end its click is
    // measured from. Written plainly. A real browser without pointer capture should fail loudly, not degrade into
    // a pad whose slides stop at the first key boundary.
    begin(pad, padRect, event)
    pad.setPointerCapture(event.pointerId)
  }

  // Records the gesture a press starts, and draws its down mark and bubble.
  function begin(pad: HTMLDivElement, padRect: DOMRect, event: React.PointerEvent<HTMLDivElement>): void {
    // THE NO-LAYOUT PATH. A pad with no height -- jsdom, which lays nothing out, or a pad not laid
    // out yet -- has a 0x0 rect for every key, and "nearest" would pick the same key for every
    // press. So geometry is not consulted at all: the key is the one the event landed on, there is
    // no lift and no slide, and pointerup commits it. This is what keeps a `user.click` on a key in
    // every suite meaning "press this key".
    if (padRect.height === 0) {
      const target = event.target instanceof Element ? event.target.closest('[data-key]') : null
      const next: Gesture = {
        inside: true,
        key: target?.getAttribute('data-key') ?? null,
        pad: padRect,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        rects: null,
      }
      gesture.current = next
      setDown(
        next.key === null || target === null
          ? null
          : { key: next.key, pointerType: next.pointerType, rect: rectOf(target) },
      )
      return
    }

    const rects = new Map<string, DOMRect>()
    pad.querySelectorAll('[data-key]').forEach((key) => rects.set(key.getAttribute('data-key') ?? '', rectOf(key)))
    const next: Gesture = {
      inside: true,
      key: null,
      pad: padRect,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      rects,
    }
    next.key = resolve(next, event.clientX, event.clientY)
    gesture.current = next
    show(next)
  }

  // THE SLIDE. A finger that lands on the wrong key can roll onto the right one before lifting, and
  // the down mark and the bubble follow it; off the pad entirely is the cancel state, and back on
  // restores it. The no-layout path has nothing to slide across and ignores moves.
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const current = gesture.current
    if (current === null || current.pointerId !== event.pointerId || current.rects === null) {
      return
    }
    const key = resolve(current, event.clientX, event.clientY)
    const inside = contains(current.pad, event.clientX, event.clientY)
    if (key !== current.key || inside !== current.inside) {
      current.key = key
      current.inside = inside
      show(current)
    }
  }

  // A KEY COUNTS ON RELEASE, never on contact -- which is the whole change. On contact the player
  // has not yet seen what is under the thumb; on release they have been looking at the bubble.
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    const current = gesture.current
    if (current === null || current.pointerId !== event.pointerId) {
      return
    }
    if (current.rects !== null) {
      current.inside = contains(current.pad, event.clientX, event.clientY)
    }
    finish(true)
  }

  // The browser took the pointer back -- a system gesture, a palm, the page being hidden. Nothing
  // the player chose, so nothing counts. Also fires after every pointerup, when there is no longer a
  // gesture to end.
  //
  // `lostpointercapture` BUBBLES, so only the pad's own loss counts. A touch is implicitly captured
  // by the key it lands on, and the pad taking it over at pointerdown can make that key report a
  // loss of its own; read as the pad's, it would cancel every tap. `pointercancel` has no such
  // twin and is honored from any target.
  const onPointerAbandon = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.type === 'lostpointercapture' && event.target !== event.currentTarget) return
    if (gesture.current?.pointerId === event.pointerId) {
      finish(false)
    }
  }

  // A pointer press has ALREADY activated (or deliberately not activated) on pointerup, and the
  // browser follows it with a click. That click is swallowed here, before the key's own onClick can
  // count the letter a second time.
  //
  // `detail >= 1` is what a pointer's click carries; Enter, Space, a switch and most assistive
  // technology click with `detail` 0, and those are never swallowed -- they reach the key's onClick
  // and press it at once, because a keyboard has no pointerup to commit on.
  //
  // A pointer's click is swallowed while a gesture is in flight or within CLICK_WINDOW of the last
  // one ending. A WINDOW, NOT A COUNT OF CLICKS OWED, because the two things a count has to get
  // right are both out of the pad's hands. Whether a click comes at all: iOS sends none after a
  // slide past its tap threshold or after a multi-touch, so a count would owe clicks that never
  // arrive and eat the next real one. And WHEN it comes: iOS dispatches a tap's click on a separate
  // path from its pointer events, and it can land after the next finger's pointerdown. Tap A, then
  // B quickly, and the late click for A arrives inside B's gesture; a count reset at B's press
  // spends B's allowance on it, and B's own click then reaches the key's onClick and types a second
  // letter -- at the raw point, with no lift, so possibly the neighbor. A window has no allowance to
  // spend: every pointer click near a gesture is the gesture's, however many come and in whatever
  // order.
  //
  // The residual: an assistive technology that clicks with `detail >= 1` and no pointer events,
  // within a second of a real touch on this pad, is swallowed. A player switching from a thumb to a
  // screen reader's activation in under a second is the case given up, and it is recorded rather
  // than engineered around.
  const onClickCapture = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (event.detail >= 1 && (gesture.current !== null || now() - lastGestureEnd.current < CLICK_WINDOW)) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  // `data-down` is the press state, and it replaces `:active` in every tone string. `:active`
  // stays on the element first touched, so after a slide or the 6px lift it would light a key the
  // player is not on. Absent rather than "false" on every key but one.
  const isDown = (key: string): 'true' | undefined => (down?.key === key ? 'true' : undefined)

  const letterKey = (plain: string): React.ReactNode => {
    const { mark, name, note, tone } = letter(plain)

    return (
      <button
        aria-label={name}
        className={`${KEY} ${CELL} ${tone}`}
        data-down={isDown(plain)}
        data-key={plain}
        key={plain}
        onClick={() => onPress(plain)}
        type="button"
      >
        {/* `relative` is here rather than on the button so a mark is measured against the LETTER
            and not against a 59px key -- a line spanning the whole key reads as a divider between
            rows of the pad. */}
        <span aria-hidden="true" className={`relative ${LETTER}`}>
          {plain}
          {mark}
        </span>
        {note}
      </button>
    )
  }

  // NOT IN A MAP, and never put in one. The guess bench swaps one key's label, name and handler in
  // place when the board is over; rendered at a fixed position in the JSX below, React reconciles
  // the same DOM element and a keyboard player standing on that key keeps their focus. A pad
  // rebuilt from an array would drop focus to <body> and restart the next Tab at the top of the
  // page.
  const utilityKey = ({ label: word, name, onClick, tone }: UtilityKey, slot: 0 | 1): React.ReactNode => (
    <button
      aria-label={name}
      className={`${KEY} ${WIDE} ${UTILITY} ${tone}`}
      data-down={isDown(UTILITY_KEYS[slot])}
      data-key={UTILITY_KEYS[slot]}
      onClick={onClick}
      type="button"
    >
      {word}
    </button>
  )

  // THE BUBBLE'S CONTENT IS THE KEY'S OWN, asked of the board the same way the key is: same tone,
  // same strike, same note. A verdict that rode on the bubble's color alone would be the one place
  // on the pad where it did. Touch and pen only -- a mouse pointer does not hide the key it is on.
  const bubble = (): React.ReactNode => {
    if (down === null || down.pointerType === 'mouse') {
      return null
    }
    const slot = UTILITY_KEYS.indexOf(down.key as (typeof UTILITY_KEYS)[number])
    const width = slot >= 0 ? BUBBLE_W_UTILITY : BUBBLE_W
    const { innerHeight, innerWidth } = window
    // Centered over the key, its bottom edge BUBBLE_GAP above the key's top, and held BUBBLE_INSET
    // inside the viewport so a bubble over Q or P is never cut by the screen's edge.
    const left = clamp(
      down.rect.left + down.rect.width / 2 - width / 2,
      BUBBLE_INSET,
      innerWidth - BUBBLE_INSET - width,
    )
    const top = clamp(down.rect.top - BUBBLE_GAP - BUBBLE_H, BUBBLE_INSET, innerHeight - BUBBLE_INSET - BUBBLE_H)
    const style = { left: `${left}px`, top: `${top}px`, width: `${width}px` }

    if (slot >= 0) {
      const { label: word, tone } = utility[slot]
      return (
        <div
          aria-hidden="true"
          className={`${BUBBLE} text-[17px] font-semibold tracking-[0.05em] ${tone}`}
          style={style}
        >
          {word}
        </div>
      )
    }
    const { mark, note, tone } = letter(down.key)
    return (
      <div aria-hidden="true" className={`${BUBBLE} ${tone}`} style={style}>
        <span className="relative text-[34px] font-semibold">
          {down.key}
          {mark}
        </span>
        {note}
      </div>
    )
  }

  return (
    // THE ROWS ARE WRITTEN OUT rather than looped, because all three genuinely differ: one is ten
    // letters, one is nine between two indents, one is seven between two tools. A loop over ROWS
    // with an index test at each end would hide that behind two conditionals and read worse than
    // the thing it describes.
    //
    // The gesture lives on the GROUP, not on each key, because a slide crosses keys and a pointer
    // captured by the pad keeps reporting to it wherever the finger goes. `touch-none` so a
    // vertical slide is never taken by the browser as a scroll of the bench -- which would cancel
    // the pointer mid-press -- and `select-none` so a mouse drag across the keys selects no text.
    //
    // EXCEPT ON A SHORT WINDOW. Below 490px of height (index.css's short-bench line, every phone in
    // landscape) the pad is no longer pinned: it scrolls with the column and can cover half the
    // screen, and `touch-none` would make that half unswipeable. There the pad allows vertical
    // panning: a vertical drag scrolls the bench and the browser cancels the pointer, so nothing
    // types, while a sideways slide to the neighboring key still works. The number is index.css's
    // and has to move with it.
    <div
      aria-label={label}
      className={`${PAD} touch-none select-none [@media(max-height:489px)]:touch-pan-y`}
      onClickCapture={onClickCapture}
      onLostPointerCapture={onPointerAbandon}
      onPointerCancel={onPointerAbandon}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role="group"
    >
      <div className={ROW}>{ROWS[0].map(letterKey)}</div>
      <div className={ROW}>
        {/* Scenery, and the reason a keyboard looks like a keyboard. aria-hidden and empty, so a
            screen reader working the pad does not stop on either end of this row. */}
        <span aria-hidden="true" className={HALF} />
        {ROWS[1].map(letterKey)}
        <span aria-hidden="true" className={HALF} />
      </div>
      <div className={ROW}>
        {utilityKey(utility[0], 0)}
        {ROWS[2].map(letterKey)}
        {utilityKey(utility[1], 1)}
      </div>
      {/* Out of flow (fixed), so it takes no row of the pad and no gap; aria-hidden, because the
          key under the finger already has a name and a screen reader has no thumb to see past. */}
      {bubble()}
    </div>
  )
}
