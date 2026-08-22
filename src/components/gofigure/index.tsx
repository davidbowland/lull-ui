import React, { useMemo, useState } from 'react'

import { evaluateLeftToRight } from './evaluate'
import { Button } from '@components/button'
import { Plate, Shell } from '@components/enclosure'
import { FloorBar } from '@components/floor-bar'
import { GoFigureData, Operator, PuzzleComponentProps } from '@types'

// Named, not symbolic. A screen reader reads "×" as "times" at best and as nothing at
// all at worst, and an unnamed control is an unusable one.
const OPERATOR_NAMES: Record<Operator, string> = {
  '*': 'Multiply',
  '+': 'Add',
  '-': 'Subtract',
  '/': 'Divide',
}

// What the eye sees. The tokens themselves always carry the pack's own characters, so
// the string compared against acceptedSolutions is the string the backend wrote.
const OPERATOR_SYMBOLS: Record<Operator, string> = {
  '*': '×',
  '+': '+',
  '-': '−',
  '/': '÷',
}

const EMPTY_RAIL = 'Tap the numbers and signs to build a sum.'

// The graft, and the whole reason the tile bench spends the 94px it saves by dropping the
// sign row and the docked hint bar. Left-to-right is the one rule in Lull nobody can guess,
// and the paragraph that used to sit here ("Signs apply left to right, not by PEMDAS")
// states it without teaching it: a player who has never questioned PEMDAS reads the
// sentence, agrees with it, and then taps ×7 expecting 64.
//
// A FIXED sum, never one drawn from the player's own bank. The rule has to be shown with
// real numbers, and 2, 3 and 4 are not theirs, so nothing about this puzzle is given away.
const WORKED_EXAMPLE = [
  { marker: '1', note: 'the first sign goes first', sum: '2 + 3 = 5' },
  { marker: '2', note: 'the next sign acts on that answer', sum: '5 × 4 = 20' },
  { marker: '=', note: 'A calculator would multiply first. This board never does.', sum: '20, not 14.' },
]

const isDigit = (token: string): boolean => /^\d$/.test(token)

// The tile's ink is --lull-floor-ink, which measures 13.0:1 on the light floor and 15.4:1 on the
// dark one, and its edge is drawn with --lull-floor-rule, the floor's load-bearing 3:1 boundary.
// --lull-hair could not draw this edge at any contrast: hair is decoration, and this edge
// identifies a control.
//
// aria-disabled variants, not disabled:/enabled: -- the tiles stay genuinely enabled so
// that tapping one does not blur it, so those variants would never match and an
// unavailable tile would look identical to an available one.
//
// The unavailable state is a token COLOUR and never opacity. CSS opacity composites the
// element's whole rendering as one group -- border, background AND outline -- so it halves
// the focus ring of a control this file deliberately keeps in the tab order, against the
// 3:1 that WCAG 2.4.11 requires of something still focusable and still announced.
//
// The HEIGHT arithmetic, which is the thing this tray has to be careful about, is on TILE_DIGIT
// and TILE_OPERATOR below. min-h-11 is the floor under both of them: whatever a row does, no tile
// may come out under the 44px a touch target owes.
const TILE =
  'flex min-h-11 min-w-11 shrink cursor-pointer flex-col items-center justify-center gap-[2px] ' +
  'rounded-[var(--lull-r-md)] border border-[var(--lull-floor-rule)] px-[var(--lull-s2)] ' +
  'text-[var(--lull-floor-ink)] hover:bg-[var(--lull-floor-ink)]/10 aria-disabled:cursor-default ' +
  'aria-disabled:text-[var(--lull-floor-muted)] aria-disabled:hover:bg-transparent'

// The bank reads as the thing you spend and the signs as the thing you spend it WITH, so the digits
// get the taller cell and the sign cut, and the signs a shorter one in the working cut. Both sit on
// a fill lifted a shade off the floor, which is what stops a tray of outlines reading as a grid of
// empty boxes.
//
// basis-[60px] with min-w-11 and shrink, rather than a fixed width: five tiles at 60 plus four
// 12px gaps is 348px against the 288px a 320 viewport has, so a fixed width wraps the bank onto a
// second row and pushes the control row off the bottom of a floor that cannot grow. Allowed to
// shrink they land at 48px, still over the 44 a touch target owes.
//
// FIVE is the bound, and it is the pack's rather than this file's: `bank` is typed `number[]` with
// no length in the type, and five is what this bench's acceptance criterion names. A sixth tile
// clamps at min-w-11 and needs 6 x 44 + 5 x 12 = 324px, which wraps whatever this file does about
// it -- the row cannot be made to hold what does not fit. If the pack ever ships six, the answer is
// a second row inside a taller floor, not a narrower tile.
//
// The heights are what the floor is budgeted against, and the budget is tight by design:
//
//   ribbon    52
//   tray     179   (10 top + 54 digits + 8 + 46 signs + 8 + 44 control + 9 bottom)
//   safe       9
//   ---------------
//            240   = --lull-seam
//
// A taller digit row is not free; it comes out of the control row, and the control row is where
// "Undo the last tile and try again" points.
const TILE_DIGIT = 'h-[54px] basis-[60px] bg-[var(--lull-floor-ink)]/5 lull-sign text-[26px]'
const TILE_OPERATOR = 'h-[46px] basis-[60px] bg-[var(--lull-floor-ink)]/5 text-2xl'

// A spent tile is marked by FORM -- a dashed edge and the word "Used" -- and stays fully
// legible. Colour alone would fail WCAG 1.4.1, and dimming it would hide the bank exactly
// when the player is counting what is left of it.
const TILE_SPENT = 'border-dashed'

const USED = 'lull-work text-[9.5px] leading-none tracking-[0.08em] text-[var(--lull-floor-muted)] uppercase'

// A filled chip rather than an outlined one, because the marker's job is to hold the eye at the
// left edge of a three-line list -- and the last one, the `=`, is the answer the whole example is
// aimed at, so it takes the accent.
//
// --lull-muted for the rest, NOT --lull-rule, and the difference is 4.5:1. The chip carries type,
// so the fill and the ink on it are a TEXT pair however decorative the glyph is, and rule against
// on-accent measures 4.199 in light and 3.922 in dark -- both under the floor. muted against
// on-accent is the same pair contrast.test.ts already holds as `muted on raised` (7.143 light,
// 6.872 dark), because --lull-on-accent and --lull-raised are one value.
const MARKER =
  'flex h-[18px] w-5 shrink-0 items-center justify-center rounded-[3px] ' +
  'bg-[var(--lull-muted)] text-[9.5px] font-bold tracking-[0.08em] text-[var(--lull-on-accent)]'

const MARKER_RESULT = 'bg-[var(--lull-accent)]'

const CAPTION = 'text-[11px] font-semibold tracking-[0.14em] text-[var(--lull-muted)] uppercase'

// Centred, because the tray is a set of objects laid out on a surface rather than a list. Left
// alignment made four tiles read as the start of a row that ran out.
const ROW = 'flex flex-wrap justify-center gap-[var(--lull-s3)]'

// The worked example, boxed. It used to be a bare caption over a list, which put the one rule
// nobody can guess in the same visual weight as the running total under the rail -- so the thing
// the bench exists to teach read as a footnote about it.
const WORKED =
  'flex flex-col gap-[var(--lull-s2)] rounded-[var(--lull-r-md)] border border-[var(--lull-rule)] ' +
  'bg-[var(--lull-plate)] px-[var(--lull-s4)] py-[var(--lull-s2)]'

// The rail: a raised, ruled slot with the sum set in the sign cut, so the expression the player is
// building looks like something written down rather than like a status line.
const RAIL =
  'flex items-center overflow-x-auto rounded-[var(--lull-r-md)] border border-[var(--lull-rule)] ' +
  'bg-[var(--lull-raised)] px-[var(--lull-s4)] py-[var(--lull-s2)] ' +
  'shadow-[inset_0_1px_1px_rgba(255,255,255,0.55)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.09)]'

// The solved banner is formatted for reading -- spaces, and × rather than *. The rail
// above it shows the raw token join instead, because that is the string the player is
// building and the string the pack lists. One region cannot serve both.
const forReading = (tokens: string[]): string =>
  tokens.map((token) => (isDigit(token) ? token : OPERATOR_SYMBOLS[token as Operator])).join(' ')

// DISPLAY ONLY, like evaluate.ts itself. The total is on screen from the first tap
// because the left-to-right rule is the one thing about this game a player cannot guess:
// seeing 6+9+7 stand at 22 and then jump to 154 on ×7 teaches it in one tap, where a
// number shown only at the end teaches it after the puzzle is already lost.
//
// A trailing operator has no digit yet, so it is dropped and the total is the complete
// prefix -- 6+ stands at 6, and moves when the next tile lands.
const runningTotal = (tokens: string[]): string => {
  const operands = tokens.filter(isDigit).map(Number)
  if (operands.length === 0) return ''

  const operators = tokens.filter((token) => !isDigit(token)).slice(0, operands.length - 1) as Operator[]
  const value = evaluateLeftToRight(operands, operators)
  return value === null ? "Running total: none. That division doesn't come out even." : `Running total: ${value}`
}

// A tap, not the character it writes. Duplicates are separate tiles -- a bank of 9,3,9,9
// has three that all write "9" -- so the expression alone cannot say which tile paid for
// a digit, and the board has to remember the slot the player actually touched. Deriving
// it by finding the first unspent tile showing that digit dimmed tile 1 when tile 4 was
// tapped: the tile under the finger stayed bright and one across the row went dark.
type Move = { slot: number } | { operator: Operator }

const isSlotMove = (move: Move): move is { slot: number } => 'slot' in move

// The expression the pack is written in. Moves are this component's business; the string
// is the contract -- it is what progress stores and what acceptedSolutions is matched on.
const tokensOf = (bank: number[], moves: Move[]): string[] =>
  moves.map((move) => (isSlotMove(move) ? String(bank[move.slot]) : move.operator))

// Stored progress is not trusted. A pack can be pruned and refetched, and a regenerated
// puzzle keeps neither its bank nor its id, so an expression that the bank cannot pay
// for -- or that no sequence of taps could have produced -- is dropped rather than
// rendered as a board in a state its own buttons could not reach.
const fitsPuzzle = (data: GoFigureData, tokens: string[]): boolean => {
  const remaining = [...data.bank]
  return tokens.every((token, index) => {
    // Digits sit at even positions and operators at odd ones. Two digits in a row would
    // read as one two-digit number, which no accepted solution ever contains.
    if (isDigit(token) !== (index % 2 === 0)) return false
    if (!isDigit(token)) return data.operators.includes(token as Operator)
    const slot = remaining.indexOf(Number(token))
    if (slot < 0) return false
    remaining.splice(slot, 1)
    return true
  })
}

const restore = (data: GoFigureData, progress: string | null): Move[] => {
  const tokens = progress?.match(/\d|[+\-*/]/g) ?? []
  if (tokens.join('') !== progress || !fitsPuzzle(data, tokens)) return []

  // Restored, not tapped. A stored expression carries digits and not tiles, so a repeated
  // digit is assigned the first tile that can pay for it -- which of three identical 9s
  // was spent is not something the string ever held, and no tile is under a finger here
  // for the choice to contradict.
  const taken = data.bank.map(() => false)
  return tokens.map((token) => {
    if (!isDigit(token)) return { operator: token as Operator }
    const slot = data.bank.findIndex((digit, index) => !taken[index] && digit === Number(token))
    taken[slot] = true
    return { slot }
  })
}

export const GoFigureBoard = ({ onProgress, onSolved, progress, puzzle }: PuzzleComponentProps<GoFigureData>) => {
  const { acceptedSolutions, bank, goal, operators } = puzzle.data

  // Restored once, at mount. The shell keys this component on the puzzle id, so a
  // different puzzle is a different component rather than a prop change.
  const [moves, setMoves] = useState<Move[]>(() => restore(puzzle.data, progress))

  // A set lookup, and nothing else. The component never evaluates arithmetic to decide
  // whether an answer is right: the backend enumerated every accepted expression and
  // shipped them as data. An expression that reaches the goal by a route the pack did
  // not list is not a solution here — see evaluate.ts, which exists only so the
  // wrong-answer message can name what the tiles made.
  const accepted = useMemo(() => new Set(acceptedSolutions), [acceptedSolutions])

  const tokens = tokensOf(bank, moves)
  const expression = tokens.join('')
  const total = runningTotal(tokens)
  const isSolved = accepted.has(expression)
  const consumed = bank.map((_, index) => moves.some((move) => isSlotMove(move) && move.slot === index))
  const spent = moves.filter(isSlotMove).length
  const lastToken = tokens.at(-1)
  // Solved locks the board. A winning expression is not edited back down a tile at a
  // time -- the way in is Play again, which empties it. Stated here rather than left to
  // the arithmetic: a solved board happens to have spent its whole bank, so the tiles
  // would go quiet on their own, and a rule this load-bearing should not rest on that.
  const canTapDigit = !isSolved && (lastToken === undefined || !isDigit(lastToken))
  const canTapOperator = !isSolved && lastToken !== undefined && isDigit(lastToken) && spent < bank.length

  const commit = (next: Move[]): void => {
    setMoves(next)
    const joined = tokensOf(bank, next).join('')
    onProgress(joined)
    if (accepted.has(joined)) onSolved()
  }

  const message = (): string => {
    if (isSolved) return `Solved. ${forReading(tokens)} = ${goal}`
    // Nothing to say while tiles are still in the bank: an unfinished expression is not
    // a wrong one.
    if (spent < bank.length) return ''

    const value = evaluateLeftToRight(
      tokens.filter(isDigit).map(Number),
      tokens.filter((token) => !isDigit(token)) as Operator[],
    )
    // Division has to come out whole at every step, so there is no number to name.
    if (value === null) return "That doesn't divide evenly. Undo the last tile and try again."
    // The backend enumerates every expression reaching the goal, so this is unreachable
    // from a real pack. It is here because the alternative -- "That makes 154, not 154"
    // -- is what the ordinary branch would print if it ever did happen.
    if (value === goal) return "That isn't one of the sums for this puzzle. Undo the last tile and try again."
    return `That makes ${value}, not ${goal}. Undo the last tile and try again.`
  }

  return (
    <>
      {/* Band 4. The shell owns this band's flex, min-height and vertical overflow in index.css --
          it is the one band that flexes, and the seam depends on that -- so nothing here sets
          them. What this file does own is the ORDER OF SACRIFICE inside the band, and on this
          bench that order is not negotiable:

            THE GOAL AND THE EXPRESSION ARE NEVER BOTH OFF SCREEN, BECAUSE NEITHER IS EVER OFF
            SCREEN.

          The whole game is comparing a number you are building against a number you were given,
          and a layout that makes you scroll between the two makes the player hold one of them in
          their head -- which is the arithmetic the tiles were supposed to be doing. An earlier
          draft put the worked example between them because the design was drawn that way, and at
          a 372x608 window it pushed the expression clean off the bottom.

          So the goal and the rail are shrink-0 and the TEACHING is what scrolls. It is the only
          thing here that can: it says the same three lines on every puzzle, it is read once, and
          on a short window the sliver still shows its first line, which is the rule itself. */}
      <section aria-label="Go Figure!" className="lull-board flex flex-col overflow-x-hidden">
        <div className="flex min-h-0 flex-1 flex-col gap-[var(--lull-s2)] bg-[var(--lull-plate)] py-[var(--lull-s3)] pr-[var(--lull-gutter-right)] pl-[var(--lull-gutter-left)]">
          {/* One of exactly two double-bezels in the whole product -- the other is the date
              plate on the day directory. Bezelling every container turns the technique into
              background noise, so the one plate on this bench is the one fact the whole board
              is aimed at.

              The heading is named rather than read off its own spans: its accessible name has
              to be "Make 154" as one phrase, and a name assembled from two inline spans
              depends on how the engine spaces them. */}
          <Shell className="shrink-0">
            <Plate className="flex flex-col items-center gap-[var(--lull-s1)] px-[var(--lull-s4)] py-[var(--lull-s2)]">
              <h2 aria-label={`Make ${goal}`} className="flex flex-col items-center gap-[var(--lull-s1)]">
                <span className={CAPTION}>Make</span>
                {/* The sign cut, at the largest size anywhere in Lull -- but sized off the
                    VIEWPORT WIDTH with a smaller ceiling than it had, because this plate no
                    longer gets to be the only thing on the board. 12vw is 45px on a 372 window
                    and 47 on a 390 phone; the 4.5rem ceiling is what it still reaches on a
                    tablet, where the room is real. */}
                <span className="lull-sign text-[clamp(2.25rem,12vw,4.5rem)] leading-none text-[var(--lull-ink)]">
                  {goal}
                </span>
              </h2>
            </Plate>
          </Shell>

          {/* The raw token join, exactly as the pack writes it -- see forReading, which is the
              other half of that split. The total lives INSIDE this live region rather than
              beside it: two regions would announce twice on every tap, and the pair reads as
              one fact, "6+9, running total 15". role="status" carries an implicit
              aria-atomic="true" in ARIA 1.2, under which every tap re-reads the whole region,
              so the region is stated non-atomic.

              A <div> rather than a <p>, because the rail is a box of its own inside the region
              and the running total is a line under it -- and a <p> may not contain either. The
              region is what the two share; the rail is not the region.

              Directly under the goal, and shrink-0 with it. These two boxes are the pair the
              player is comparing, so they are the pair that never moves. */}
          <div
            aria-atomic="false"
            aria-label="Your expression"
            aria-live="polite"
            className="flex shrink-0 flex-col gap-[var(--lull-s1)]"
            role="status"
          >
            <div className={RAIL}>
              <span className="lull-sign text-[28px] leading-[1.25] tracking-[0.04em] text-[var(--lull-ink)]">
                {expression === '' ? (
                  <span className="text-[15px] tracking-normal text-[var(--lull-muted)]">{EMPTY_RAIL}</span>
                ) : (
                  expression
                )}
                {/* The caret is the promise that this rail is still taking tiles. It goes only
                    on an expression in progress: after the placeholder it would read as a text
                    field the player is meant to type into, and on a solved board there is
                    nothing left to add. */}
                {expression !== '' && !isSolved && (
                  <span
                    aria-hidden="true"
                    className="ml-[6px] inline-block h-[28px] w-[2px] translate-y-[0.16em] bg-[var(--lull-accent)]"
                  />
                )}
              </span>
            </div>
            {total === '' ? null : <p className="text-[12.5px] text-[var(--lull-muted)]">{total}</p>}
          </div>

          {/* Tile-bench furniture, not a shared margin: a teaching column every bench inherited
              would be the shared frame this redesign rejects, and the other two benches have
              nothing to teach that a hint cannot carry.

              THE ONE THING ON THIS BOARD THAT SCROLLS, in a box of its own rather than by letting
              the band scroll -- because a band that scrolls takes the goal with it. Where the
              window is tall the whole example is in view and nothing scrolls at all; where it is
              short the box shrinks to a sliver and the first line, which is the rule, is what
              stays in it.

              An ordered list, because the steps only mean anything in order. The markers are
              drawn as tokens and hidden from assistive tech -- the list already numbers itself,
              and "=" is a piece of punctuation standing in for a step rather than a step. */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className={WORKED}>
              <h3 className="text-sm leading-[1.4] font-semibold text-[var(--lull-ink)]">
                Signs apply left to right, not by PEMDAS.
              </h3>
              <ol className="flex list-none flex-col gap-[var(--lull-s2)]">
                {WORKED_EXAMPLE.map(({ marker, note, sum }) => (
                  <li className="flex items-baseline gap-[var(--lull-s2)] text-[13.5px]" key={marker}>
                    <span aria-hidden="true" className={marker === '=' ? `${MARKER} ${MARKER_RESULT}` : MARKER}>
                      {marker}
                    </span>
                    <span className="text-[var(--lull-ink)]">
                      {sum} <span className="text-[12.5px] text-[var(--lull-muted)]">{note}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* Band 6, the seam. FloorBar takes { children, message } and nothing else, so the class
          that claims the band goes on the box around it -- and that box is a landmark for the
          same reason the board is: these two elements are siblings in the screen column, not
          nested, so a single region around both cannot exist.

          The ribbon inside FloorBar is the always-mounted, initially-empty live region this
          board's wrong-answer and solved messages are announced through. */}
      <section aria-label="Tiles" className="lull-instrument">
        <FloorBar message={message()}>
          <div className="flex flex-col gap-[var(--lull-s2)] pt-[10px] pr-[var(--lull-gutter-right)] pb-[9px] pl-[var(--lull-gutter-left)]">
            {/* aria-disabled, NOT disabled, on every tile. A browser blurs an element that
                becomes disabled while focused, and every tap disables the tile just
                activated -- so `disabled` drops focus to <body> and the next Tab restarts at
                the top of the document. Playing one puzzle by keyboard meant fourteen
                traversals from the page top, and at the final tile every tile disables at
                once, so focus vanished exactly when the wrong-answer message appeared.
                aria-disabled keeps the tile focusable and announced; the guard in the click
                handler is what actually refuses the tap. */}
            <div aria-label="Numbers" className={ROW} role="group">
              {bank.map((digit, index) => {
                // Spent and unavailable are two different facts and the board now says so.
                // A tile the bank has already paid out is marked Used for good; a tile that
                // simply cannot be tapped this turn -- every digit, while an operator is
                // owed -- is announced unavailable and marked nothing, because calling it
                // used would be a lie the player can disprove one tap later.
                const isUsed = consumed[index]
                const isUnavailable = isUsed || !canTapDigit
                return (
                  <button
                    aria-disabled={isUnavailable}
                    // Position included because a duplicated bank gives two tiles the same
                    // name: "Use 7" twice tells a screen-reader user nothing about which one
                    // they just spent.
                    aria-label={`Use ${digit}, tile ${index + 1} of ${bank.length}`}
                    className={isUsed ? `${TILE} ${TILE_DIGIT} ${TILE_SPENT}` : `${TILE} ${TILE_DIGIT}`}
                    key={`${digit}-${index}`}
                    onClick={() => !isUnavailable && commit([...moves, { slot: index }])}
                    type="button"
                  >
                    {/* Hidden, both of them: the button's own name already says "Use 7, tile
                        3 of 4", and letting these through would read the tile twice. */}
                    <span aria-hidden="true">{digit}</span>
                    {isUsed && (
                      <span aria-hidden="true" className={USED}>
                        Used
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* The signs are reusable, so no sign is ever spent and none is ever marked Used. */}
            <div aria-label="Signs" className={ROW} role="group">
              {operators.map((operator) => (
                <button
                  aria-disabled={!canTapOperator}
                  aria-label={OPERATOR_NAMES[operator]}
                  className={`${TILE} ${TILE_OPERATOR}`}
                  key={operator}
                  onClick={() => canTapOperator && commit([...moves, { operator }])}
                  type="button"
                >
                  <span aria-hidden="true">{OPERATOR_SYMBOLS[operator]}</span>
                </button>
              ))}
            </div>

            {/* Two controls rather than one that changes its mind, because they do not do the
                same thing to the board -- and the swap is safe from the focus problem that
                governs the tiles: solving is always a tile tap, so this control is never the
                focused element at the moment it is replaced.

                Undo carries aria-disabled rather than disabled for the tiles' own reason. The
                empty board is reached BY pressing Undo, so the press that empties it is the
                press that would disable the pressed control, and focus would fall to <body>
                on the last tile of every keyboard playthrough. Button's own guard refuses it. */}
            {/* CENTRED, on the same axis as the two rows above it. It used to be
                `justify-between`, which is a two-child rule applied to a row that only ever holds
                one child -- Undo and Play again swap, they never stand together -- so it resolved
                to flex-start and pinned the only control on the tray to the left gutter while the
                numbers and the signs were centred over it. The tray is a set of objects laid out
                on a surface, and one of them was hanging off the edge of it. */}
            <div className={ROW}>
              {isSolved ? (
                <Button onClick={() => commit([])} variant="floorPrimary">
                  Play again
                </Button>
              ) : (
                <Button
                  aria-disabled={moves.length === 0}
                  aria-label="Undo the last tile"
                  onClick={() => commit(moves.slice(0, -1))}
                >
                  Undo
                </Button>
              )}
            </div>
          </div>
        </FloorBar>
      </section>
    </>
  )
}
