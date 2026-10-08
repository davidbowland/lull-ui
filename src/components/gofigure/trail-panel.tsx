import React, { useId } from 'react'

import { TrailFinish, TrailStep } from './trail'
import { Button } from '@components/button'
import { CloseMark } from '@components/button/close-mark'
import { Operator } from '@types'

// What the eye sees. The tokens themselves always carry the pack's own characters, so
// the string compared against acceptedSolutions is the string the backend wrote.
//
// It lives HERE, beside the panel, rather than in the board that also draws it, because the import
// can only run one way: the board mounts this panel, so a panel that imported from the board would
// be a cycle. The board imports it from here.
export const OPERATOR_SYMBOLS: Record<Operator, string> = {
  '*': '×',
  '+': '+',
  '-': '−',
  '/': '÷',
}

// A filled chip rather than an outlined one, because the marker's job is to hold the eye at the
// left edge of a short list -- the worked example's three lines and the trail's steps alike. The
// last one, the worked example's `=` and the trail's live row, is where the list is aimed, so it
// takes the accent.
//
// --lull-muted for the rest, NOT --lull-rule, and the difference is 4.5:1. The chip carries type,
// so the fill and the ink on it are a TEXT pair however decorative the glyph is, and rule against
// on-accent measures 4.199 in light and 3.922 in dark -- both under the floor. muted against
// on-accent is the same pair contrast.test.ts already holds as `muted on raised` (7.143 light,
// 6.872 dark), because --lull-on-accent and --lull-raised are one value.
//
// Shared with the board for the reason OPERATOR_SYMBOLS is: one direction of import.
export const MARKER =
  'flex h-[18px] w-5 shrink-0 items-center justify-center rounded-[3px] ' +
  'bg-[var(--lull-muted)] text-[9.5px] font-bold tracking-[0.08em] text-[var(--lull-on-accent)]'

export const MARKER_RESULT = 'bg-[var(--lull-accent)]'

// The sign as a screen reader should say it inside a sentence about arithmetic. Not OPERATOR_NAMES:
// those name the TILE ("Divide"), and "154 Divide 7" is not how anyone reads a sum aloud.
const SPOKEN_SIGNS: Record<Operator, string> = {
  '*': 'times',
  '+': 'plus',
  '-': 'minus',
  '/': 'divided by',
}

// A trail can go below zero (6 - 7), and both renderings have to survive that. The eye gets the
// typographic minus the sign tile draws, so -1 on the trail and the − on the tile read as one
// character; the ear gets the word, because a hyphen is read as "dash" or as nothing.
export const shownNumber = (value: number): string => (value < 0 ? `−${-value}` : `${value}`)
export const spokenNumber = (value: number): string => (value < 0 ? `minus ${-value}` : `${value}`)

// One step, as the ribbon says it and as the step's own row says it to a screen reader. One
// function, so the two cannot drift: "154 divided by 7 is 22."
export const stepSentence = (step: TrailStep, bank: number[]): string =>
  `${spokenNumber(step.from)} ${SPOKEN_SIGNS[step.op]} ${bank[step.tile]} is ${spokenNumber(step.to)}.`

// The finish, as far as it is written, as a screen reader says it: "2 plus 2 plus 5", with a waiting
// sign on the end -- "2 plus". One function for the board's ribbon and the panel's own row, for the
// reason `stepSentence` is one.
export const finishSpoken = (finish: TrailFinish, bank: number[]): string =>
  finish.tiles
    .flatMap((tile, at) =>
      at < finish.ops.length ? [`${bank[tile]}`, SPOKEN_SIGNS[finish.ops[at]]] : [`${bank[tile]}`],
    )
    .join(' ')

// The worked example's box, on the RAISED ground rather than the plate's, and that is the one
// difference. Restated whole rather than layered over the worked example's string, for the reason
// the squares' skins give in index.tsx: Tailwind picks between two competing `bg-` utilities by
// emission order, not by their order in the attribute, so `WORKED + bg-raised` is a coin toss.
//
// The raised ground is what says "this is yours and it is live" against the plate the worked
// example sits on, which is the fact a player switching modes needs to read at a glance.
const BOX =
  'flex flex-col gap-[var(--lull-s2)] rounded-[var(--lull-r-md)] border border-[var(--lull-rule)] ' +
  'bg-[var(--lull-raised)] py-[6px] pr-[var(--lull-s3)] pb-[10px] pl-[var(--lull-s4)]'

// 44px tall, so Close beside the heading keeps its touch target without the row growing around it.
const HEAD = 'flex min-h-11 items-center justify-between gap-[var(--lull-s2)]'

// THE HINT SHEET'S HEADING, letter for letter: small, spaced capitals in the muted ink. The trail is
// the bench's other popup, and a heading that reads like the sheet's is half of what tells a player
// this box is a mode they opened rather than more of the puzzle. The other half is the same Close.
const HEADING = 'min-w-0 text-[11px] font-semibold tracking-[0.14em] text-[var(--lull-muted)] uppercase'

const ROW = 'flex min-h-[30px] items-center gap-[var(--lull-s2)]'

// The sign cut, the squares' own face, so a step reads as something written down -- and nowrap,
// because the longest a trail can reach is the goal times 9 four times, and a sum broken across two
// lines is a sum the player has to reassemble.
const SUM = 'lull-sign text-[21px] leading-none whitespace-nowrap text-[var(--lull-ink)]'

// THE SLOTS restate the squares' skins at a smaller size: dashed and unfilled while empty, solid on
// the plate's ground once the sign is picked, and the caret's inset accent ring on whichever slot
// the next press fills. The ring is never the only carrier of that fact -- the row's own spoken text
// says "Pick a sign" or "Pick a tile" -- so it clears WCAG 1.4.1 the way the squares' ring does.
const SLOT =
  'inline-flex h-[34px] items-center justify-center rounded-[var(--lull-r-sm)] border lull-sign ' +
  'text-[20px] leading-none text-[var(--lull-ink)]'
const SLOT_SIGN = 'w-[30px]'
const SLOT_TILE = 'w-[38px]'
const SLOT_EMPTY = 'border-dashed border-[var(--lull-rule)] bg-transparent'
const SLOT_FILLED = 'border-[var(--lull-rule)] bg-[var(--lull-plate)]'
const SLOT_CARET = 'inset-ring-2 inset-ring-[var(--lull-accent)]'

// THE OTHER HALF OF THE STICKY FLOOR. The bench scrolls and the floor is pinned to its bottom edge,
// so it OVERLAYS the bottom of the scrollport -- and a browser aligning `block: 'nearest'` knows
// nothing about it and would tuck the live row underneath the tray the player is pressing. The
// margin is the seam plus the device's bottom inset, phrazle's precedent, and it is inert everywhere
// else: it moves no layout and affects only a scroll that targets this element. No top margin,
// because this bench has no sticky sign row to clear.
const SCROLL_TARGET = 'scroll-mb-[calc(var(--lull-seam)+env(safe-area-inset-bottom))]'

const NOTE = 'pl-7 text-[12.5px] leading-[1.35] text-[var(--lull-muted)]'

export interface TrailPanelProps {
  bank: number[]
  finish: TrailFinish | null
  goal: number
  id: string
  note: string
  onClose: () => void
  onStartOver: () => void
  pending: Operator | null
  // Where the board's scroll effect points: the live row. The panel owns WHICH element; the board
  // owns WHEN.
  scrollTargetRef: React.RefObject<HTMLLIElement | null>
  steps: TrailStep[]
}

// One slot of the live row, in ONE skin chosen once, for the squares' emission-order reason. Never
// read aloud: the row it sits in is hidden, and the row's own sentence says what the slots show.
const Slot = ({ caret, kind, text }: { caret: boolean; kind: 'sign' | 'tile'; text: string }): React.ReactNode => (
  <span
    className={[
      SLOT,
      kind === 'sign' ? SLOT_SIGN : SLOT_TILE,
      text === '' ? SLOT_EMPTY : SLOT_FILLED,
      caret ? SLOT_CARET : '',
    ].join(' ')}
  >
    {text}
  </span>
)

// The finish's slots: one per tile the steps have left, a sign between each pair, filled as far as
// the player has written and ringed where the next press lands. A full finish has no ring.
const finishSlots = (finish: TrailFinish | null, bank: number[], left: number): React.ReactNode[] => {
  const tiles = finish?.tiles ?? []
  const ops = finish?.ops ?? []
  const next = tiles.length + ops.length
  return Array.from({ length: left * 2 - 1 }, (_unused, at) => {
    const index = Math.floor(at / 2)
    return at % 2 === 0 ? (
      <Slot caret={at === next} key={at} kind="tile" text={index < tiles.length ? `${bank[tiles[index]]}` : ''} />
    ) : (
      <Slot caret={at === next} key={at} kind="sign" text={index < ops.length ? OPERATOR_SYMBOLS[ops[index]] : ''} />
    )
  })
}

// BACKTRACK'S PANEL. It takes data and callbacks and nothing else, the same line the six props draw
// for the board: no storage, no router, no network, and no decision. It does not know whether the
// trail is open -- the board toggles `hidden` on the box around it -- and it does not compute a
// step; every number it prints arrived in `steps`, which only `stepOf` built.
export const TrailPanel = ({
  bank,
  finish,
  goal,
  id,
  note,
  onClose,
  onStartOver,
  pending,
  scrollTargetRef,
  steps,
}: TrailPanelProps): React.ReactNode => {
  // The heading names the region. React makes this unique per instance, and the board mounts one.
  const headingId = useId()
  const current = steps.length === 0 ? goal : steps[steps.length - 1].to
  const number = steps.length + 1
  const left = bank.length - steps.length
  // THE LIVE ROW TAKES ONE OF THREE SHAPES. A step back ("9 [sign] [number]") while a sign is picked
  // or before the first step; the finish ("9 = 2 + [ ] ...") once it is started or when one number
  // is left; and BOTH, one under the other, while the next press could start either. Drawing both is
  // what tells a player a number may come first -- a rule nobody would guess from a lone step row.
  const showsStep = finish === null && left > 1
  const showsFinish = finish !== null || (pending === null && steps.length > 0)
  const finishFull = finish !== null && finish.tiles.length === left
  const wants = finish !== null && finish.ops.length === finish.tiles.length ? ' Pick a number.' : ' Pick a sign.'
  const spokenRow =
    finish === null
      ? pending === null
        ? `${spokenNumber(current)}. ${showsStep ? (showsFinish ? 'Pick a sign or a number.' : 'Pick a sign.') : `Pick a number to make ${spokenNumber(current)}.`}`
        : `${spokenNumber(current)} ${SPOKEN_SIGNS[pending]}. Pick a number.`
      : `${spokenNumber(current)} equals ${finishSpoken(finish, bank)}.${finishFull ? '' : wants}`
  // A note set by an uneven step or a finished sum wins; otherwise the line says what the row cannot
  // show by itself -- which press does what, and that the finish has to use every number left.
  const restingBeforeFinish =
    steps.length === 0
      ? 'Each step starts where the last one ended.'
      : left === 1
        ? `One number is left. Pick it to make ${shownNumber(current)}.`
        : 'Start with a sign to keep backtracking, or with a number to finish.'
  const resting =
    finish === null
      ? pending === null
        ? restingBeforeFinish
        : ''
      : `Use every number that's left to make ${shownNumber(current)}.`
  const line = note === '' ? resting : note

  return (
    // The id is the far end of the Backtrack button's `aria-controls`, and it resolves whether the
    // trail is open or shut, because this section is always mounted. tabIndex -1 because opening
    // the trail sends focus here, and a section is not focusable without it.
    <section aria-labelledby={headingId} className={BOX} id={id} tabIndex={-1}>
      <div className={HEAD}>
        <h3 className={HEADING} id={headingId}>
          Backtracking from {goal}
        </h3>
        {/* The hint sheet's own Close, mark and all, so the two popups shut the same way. Named
            "Close Backtrack": the name starts with the visible label (WCAG 2.5.3) and says which of
            the bench's two popups it shuts. */}
        <Button aria-label="Close Backtrack" className="shrink-0" onClick={onClose} size="sm" variant="default">
          <CloseMark />
          Close
        </Button>
      </div>
      {/* role="list" because Safari drops the list role from a `list-none` list, and the step count
          is what tells a VoiceOver player how far back they have come. */}
      <ol className="flex list-none flex-col gap-[var(--lull-s2)]" role="list">
        {steps.map((step, index) => (
          // Index keys are right here: a step is only ever appended or taken off the end, so a
          // position always names the same step.
          <li className={ROW} key={index}>
            <span aria-hidden="true" className={MARKER}>
              {index + 1}
            </span>
            {/* The visible sum is symbols, which a screen reader reads as "times" at best and
                  as nothing at worst, so it is hidden and the row speaks a sentence instead. */}
            <span className="sr-only">{`Step ${index + 1}: ${stepSentence(step, bank)}`}</span>
            <span aria-hidden="true" className={SUM}>
              {`${shownNumber(step.from)} ${OPERATOR_SYMBOLS[step.op]} ${bank[step.tile]} = ${shownNumber(step.to)}`}
            </span>
          </li>
        ))}
        <li className={`flex flex-col gap-[var(--lull-s2)] ${SCROLL_TARGET}`} ref={scrollTargetRef}>
          <span className="sr-only">{`Step ${number}: ${spokenRow}`}</span>
          {showsStep && (
            <span aria-hidden="true" className={ROW}>
              <span className={`${MARKER} ${MARKER_RESULT}`}>{number}</span>
              <span className={SUM}>{shownNumber(current)}</span>
              <Slot caret={pending === null} kind="sign" text={pending === null ? '' : OPERATOR_SYMBOLS[pending]} />
              <Slot caret={pending !== null} kind="tile" text="" />
            </span>
          )}
          {showsFinish && (
            // The finish sits under the marker column like every row, with "or" in the marker's
            // place while the step row above it is still on offer. Its slots sit 4px apart rather
            // than the step row's 8: a four-digit number and five slots have to fit at 320px.
            <span aria-hidden="true" className={ROW}>
              {showsStep ? (
                <span className="w-5 shrink-0 text-center text-[12.5px] text-[var(--lull-muted)]">or</span>
              ) : (
                <span className={`${MARKER} ${MARKER_RESULT}`}>{number}</span>
              )}
              <span className={SUM}>{`${shownNumber(current)} =`}</span>
              <span className="flex min-w-0 items-center gap-1">{finishSlots(finish, bank, left)}</span>
            </span>
          )}
        </li>
      </ol>
      {line !== '' && <p className={NOTE}>{line}</p>}
      {/* "CLEAR TRAIL", NOT "START OVER", and only while there is something to clear. Beside an
          empty trail "Start over" read as the puzzle's own reset, which is the one thing it never
          touches; naming the trail says whose it is, and hiding it on an empty trail removes the
          press that could only be refused. At the foot of the panel rather than in the head: at
          320px the heading, this and Close did not fit on one line. */}
      {(steps.length > 0 || pending !== null || finish !== null) && (
        <div className="flex justify-end">
          <Button onClick={onStartOver} size="sm" variant="quiet">
            Clear steps
          </Button>
        </div>
      )}
    </section>
  )
}
