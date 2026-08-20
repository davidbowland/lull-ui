import React, { useEffect, useRef, useState } from 'react'

import { DEFAULT_AVAILABLE, GAP, squareSize } from './layout'
import { apply, Assignment, cipherLetters, decode, encode, isSolved, Mapping } from './mapping'
import { CryptogramData, PuzzleComponentProps } from '@types'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

// Word boundaries come from proximity, not a box: 2px inside a word against 16px between them.
// Equal gaps plus a bracket is exactly what made a wrapped word read as two words.
const WORD_GAP = 16

const FULL_BOARD = 'Every square is full. Check the ones you’re least sure of.'
const INSTRUCTION = 'Tap a square, then tap a letter.'
const NOTHING_SELECTED = 'Nothing selected. Tap a square to pick one.'
const NO_SQUARE_SELECTED = 'Tap a square first, then a letter.'

// The FOURTH local tile vocabulary in this repo, and deliberately so: TILE in gofigure, REVEAL in
// the hint drawer and Missing Vowels' ACTION are three independent copies of the same idiom already,
// and unifying them is out of scope. aria-pressed variants rather than disabled ones, like all
// three, because these controls stay genuinely enabled -- a disabled element blurs on press and
// drops focus to <body>.
// A column, like the keypad keys: the guess sits above the cipher letter it stands for. leading-none
// on both spans, because two lines of text have to fit inside a square that may be only 24px tall.
const SQUARE =
  'flex flex-col items-center justify-center leading-none rounded-md border text-[var(--lull-ink)] ' +
  'border-[var(--lull-border)] cursor-pointer hover:bg-[var(--lull-accent)]/10 ' +
  'aria-pressed:border-2 aria-pressed:border-[var(--lull-accent)]'

// A spent key stays FULLY legible -- border-2, letter at full ink, annotation muted but at full
// opacity. Not opacity-40, which would dim the key table exactly when it is being read most.
const KEY =
  'flex h-11 min-w-0 flex-col items-center justify-center rounded-md border cursor-pointer ' +
  'border-[var(--lull-border)] text-[var(--lull-ink)] hover:bg-[var(--lull-accent)]/10'
const KEY_SPENT = 'border-2 border-[var(--lull-accent)]'
// Below any existing type step: the annotation has to fit under a letter inside a 44px key.
const ANNOTATION = 'text-[0.6875rem] leading-none text-[var(--lull-ink-muted)]'

interface Square {
  cipher: string
  // Position in reading order across the whole phrase, 0-based.
  index: number
  word: number
}

// Letters only, matching cipherLetters. A pack is JSON off the network, so the ciphertext is
// untrusted -- and a square keyed on an apostrophe would be one no key on the pad could ever fill,
// so the tally could never reach its total and the meta line would understate the board forever.
const squaresOf = (ciphertext: string): Square[] => {
  const words = ciphertext
    .toUpperCase()
    .split(' ')
    .map((word) => (word.match(/[A-Z]/g) ?? []).join(''))
    .filter((word) => word !== '')
  let index = 0
  return words.flatMap((word, wordIndex) =>
    word.split('').map((cipher) => ({ cipher, index: index++, word: wordIndex })),
  )
}

const wordsOf = (squares: Square[]): Square[][] =>
  squares.reduce<Square[][]>((words, square) => {
    const current = words[square.word] ?? []
    words[square.word] = [...current, square]
    return words
  }, [])

/**
 * How many squares fit on one line at this size. A word longer than this breaks across lines with
 * its continuation hanging-indented behind a marker that occupies its own square-width slot -- so a
 * continuation line holds one fewer letter than a first line.
 */
const perLine = (available: number, size: number): number => Math.max(1, Math.floor((available + GAP) / (size + GAP)))

const chunk = (letters: Square[], first: number, rest: number): Square[][] => {
  if (letters.length <= first) return [letters]

  const lines = [letters.slice(0, first)]
  for (let start = first; start < letters.length; start += rest) {
    lines.push(letters.slice(start, start + rest))
  }
  return lines
}

export const CryptogramBoard = ({ onProgress, onSolved, progress, puzzle }: PuzzleComponentProps<CryptogramData>) => {
  const { answer, category, ciphertext } = puzzle.data

  const [squares] = useState(() => squaresOf(ciphertext))
  const [letters] = useState(() => cipherLetters(ciphertext))
  // Restored once, at mount. The shell keys this component on the puzzle id, so a different puzzle
  // is a different component rather than a prop change, and re-reading would hand it its own writes.
  const [mapping, setMapping] = useState<Mapping>(() => decode(progress, ciphertext))
  // The selected CIPHER LETTER, not the selected square. Two squares can show the same cipher
  // letter, so moving between them changes the cursor and not this.
  const [selected, setSelected] = useState<string | null>(null)
  // The FOCUSED square, for the roving tabindex. Distinct from `selected` for the same reason.
  const [cursor, setCursor] = useState(0)
  const [message, setMessage] = useState('')

  // Measured, never derived from the viewport: this box sits inside the page's px-4 and its own
  // px-3, so a viewport-derived width is wrong by 56px before anything else goes wrong.
  const [available, setAvailable] = useState(DEFAULT_AVAILABLE)
  const boxRef = useRef<HTMLDivElement>(null)
  const squareRefs = useRef<(HTMLButtonElement | null)[]>([])
  const hasMoved = useRef(false)

  useEffect(() => {
    const box = boxRef.current
    if (box === null || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      // A hidden or not-yet-laid-out box reports zero, and honouring that collapses every square.
      if (width > 0) setAvailable(width)
    })
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  // Focus follows the cursor, but only once the player has moved it. Grabbing focus at mount would
  // scroll a deep-linked page to the board and skip the heading above it.
  useEffect(() => {
    if (!hasMoved.current) return
    squareRefs.current[cursor]?.focus()
  }, [cursor])

  const solved = isSolved(ciphertext, mapping, answer)

  // Initialised with the MOUNT-TIME value, so a board restored into a solved mapping does not report
  // a solve that already happened -- the shell marked it solved when the player actually won. Every
  // later transition into solved does report, because the board stays interactive and can be
  // re-solved.
  const reported = useRef(solved)
  useEffect(() => {
    if (solved && !reported.current) onSolved()
    reported.current = solved
  }, [onSolved, solved])

  const words = wordsOf(squares)
  const longest = Math.max(...words.map((word) => word.length), 1)
  const size = squareSize(available, longest)
  const fit = perLine(available, size)

  const nameOf = (square: Square): string => {
    const held = mapping[square.cipher]
    const state = held === undefined ? 'empty' : `holds ${held}`
    return `Cipher ${square.cipher}, letter ${square.index + 1} of ${squares.length}, ${state}`
  }

  const move = (next: number): void => {
    hasMoved.current = true
    setCursor(Math.min(squares.length - 1, Math.max(0, next)))
  }

  const select = (square: Square): void => {
    hasMoved.current = true
    setCursor(square.index)
    // `selected` is a cipher letter, so re-tapping ANY square showing it deselects -- which is why
    // the squares carry aria-pressed rather than a single roving selection.
    if (selected === square.cipher) {
      setSelected(null)
      setMessage(NOTHING_SELECTED)
      return
    }
    setSelected(square.cipher)
    setMessage(`${nameOf(square)}. Pick a letter.`)
  }

  // Rows 3, 5 and 6 change something the player is not looking at, so each names it. An unannounced
  // state change is lost work, and 5 and 6 are the common ones -- a player changing their mind
  // about a square that already has a letter.
  const assignmentMessage = (cipher: string, plain: string, result: Assignment): string => {
    // Row 4 of the table: the same key tapped again. The undo, and the reason there is no Take back
    // button anywhere on this board.
    if (result.cleared) return `${cipher} is empty again.`

    const count = squares.filter((square) => square.cipher === cipher).length
    const moved = `Every ${cipher} is ${plain} now — ${count} square${count === 1 ? '' : 's'}.`
    if (result.stolenFrom !== null && result.released !== null) {
      return `${moved} ${result.stolenFrom} is empty, ${result.released} is free again.`
    }
    if (result.stolenFrom !== null) return `${moved} ${result.stolenFrom} is empty again.`
    if (result.released !== null) return `${moved} ${result.released} is free again.`
    return moved
  }

  const press = (plain: string): void => {
    if (selected === null) {
      setMessage(NO_SQUARE_SELECTED)
      return
    }
    const result = apply(mapping, selected, plain)
    setMapping(result.mapping)
    onProgress(encode(result.mapping))

    // The solve REPLACES the assignment message: the answer is the complete news, and telling a
    // player to check the squares they are least sure of is simply false on a correct board.
    //
    // Upper-cased to match the board: every square shows an upper-case letter, so an answer read
    // back in the pack's own casing would look like a different string from the one just spelled.
    if (isSolved(ciphertext, result.mapping, answer)) {
      setMessage(`Solved. The answer is ${answer.toUpperCase()}.`)
      return
    }
    // A full board that is not the answer is the one state the player cannot see: every square
    // shows a letter and nothing says which of them is wrong.
    //
    // APPENDED, never substituted. Only row 2 can make a board newly full, but a player then goes
    // on rearranging a board that STAYS full -- and every one of those moves empties a square
    // somewhere off screen. Replacing the message would swallow "Z is empty again." on every steal
    // from that point on, which is exactly the lost work rows 3, 5 and 6 name their side effects to
    // prevent.
    const full = letters.every((cipher) => result.mapping[cipher] !== undefined)
    const assigned = assignmentMessage(selected, plain, result)
    setMessage(full ? `${assigned} ${FULL_BOARD}` : assigned)
  }

  const firstOfWord = (word: number): number => squares.find((square) => square.word === word)?.index ?? cursor

  // Arrows move the CURSOR and nothing else. Selecting is the button's own job -- Enter and Space
  // activate it natively and run the same `select` a tap runs -- which is what keeps `cursor` and
  // `selected` genuinely independent rather than one shadowing the other.
  const onKeyDown = (event: React.KeyboardEvent): void => {
    // A ciphertext with no letters in it leaves no squares to stand on. Only reachable from a
    // corrupt pack, and the alternative is a TypeError thrown out of an event handler, where
    // storage.ts's own comments note there is no error boundary above this.
    // A modified keypress belongs to the browser, not to the board. Without this, ⌘R, ⌃A and every
    // other shortcut is both swallowed by preventDefault below and read as a guess -- the player
    // loses the reload they asked for and a square they did not.
    if (event.altKey || event.ctrlKey || event.metaKey) return

    const here = squares[cursor]
    if (here === undefined) return
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      move(cursor + 1)
      return
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      move(cursor - 1)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      move(firstOfWord(here.word + 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      move(firstOfWord(here.word - 1))
      return
    }
    if (event.key === 'Backspace') {
      event.preventDefault()
      // The same message every other "you acted with no square selected" path emits. This was the
      // one action on the board that produced no response at all, which reads as a broken key rather
      // than as a key that needs a square first.
      if (selected === null) {
        setMessage(NO_SQUARE_SELECTED)
        return
      }
      const held = mapping[selected]
      // Routed through the same toggle, so Backspace is row 4 rather than a second way to empty a
      // square that could drift from it.
      if (held !== undefined) press(held)
      return
    }
    if (/^[A-Za-z]$/.test(event.key)) {
      event.preventDefault()
      press(event.key.toUpperCase())
    }
  }

  // Squares, not cipher letters: the count is of what is on screen, which is what the player is
  // looking at.
  const filled = squares.filter((square) => mapping[square.cipher] !== undefined).length
  const tally = solved ? 'You solved this one' : `${filled} of ${squares.length} filled in`

  // Empties the board, which un-solves it: `solved` is derived, so clearing the mapping is the whole
  // reset. The shell is told the board is empty so a puzzle left this way reopens empty.
  const playAgain = (): void => {
    setMapping({})
    setSelected(null)
    onProgress('')
    // Announced, not blanked. Emptying a role="status" announces nothing, and this wipes every
    // letter on the board -- the largest state change here and the one a player who is not looking
    // at the squares would otherwise have to infer. Says the fact and then the next move, so it
    // stands in for the instruction line it replaces.
    setMessage(`Board cleared. ${INSTRUCTION}`)
    hasMoved.current = true
    setCursor(0)
    // The pressed control is about to unmount, so focus is sent somewhere deliberate. The cursor is
    // already 0 on a board the player never moved, so this cannot ride the cursor effect.
    squareRefs.current[0]?.focus()
  }

  return (
    <section aria-label="Cryptogram" className="flex min-h-0 flex-1 flex-col gap-2">
      {/* One line, not a heading and a tally beside it. The category is a fact about the phrase,
          the same weight as the count next to it, and the board already sits under the page's h1. */}
      <p className="text-sm text-[var(--lull-ink-muted)]">
        {category === undefined ? tally : `${category} · ${tally}`}
      </p>

      {/* overflow-x is explicitly hidden and never auto, so no sideways drag can exist anywhere on
          this board. The phrase scrolls vertically and never horizontally. */}
      <div className="min-h-[96px] flex-1 overflow-x-hidden overflow-y-auto px-3" onKeyDown={onKeyDown} ref={boxRef}>
        <div className="flex flex-wrap" style={{ columnGap: `${WORD_GAP}px`, rowGap: `${GAP * 2}px` }}>
          {words.map((word, wordIndex) => (
            <div
              aria-label={`Word ${wordIndex + 1} of ${words.length}, ${word.map((square) => square.cipher).join(' ')}`}
              className="flex flex-col"
              key={wordIndex}
              role="group"
              style={{ rowGap: `${GAP}px` }}
            >
              {/* Rows are whole words, except a single word too long for one line at the 24px floor.
                  That word breaks with its continuation hanging-indented behind a marker in its own
                  square-width slot. The marker is aria-hidden and the group's label above carries
                  the whole word, so assistive tech never sees the break. */}
              {/* Floored at 1. perLine already floors the FIRST line at one square, so a box
                  measured narrower than a single square would ask for continuation lines of zero
                  letters -- a loop that never advances and freezes the tab. Unreachable at any real
                  width; an unbounded loop is not something to leave resting on that. */}
              {chunk(word, fit, Math.max(1, fit - 1)).map((line, lineIndex) => (
                <div className="flex" key={lineIndex} style={{ columnGap: `${GAP}px` }}>
                  {lineIndex > 0 && (
                    <span
                      aria-hidden="true"
                      className="flex items-center justify-center text-[var(--lull-ink-muted)]"
                      style={{ height: `${size}px`, width: `${size}px` }}
                    >
                      ↳
                    </span>
                  )}
                  {line.map((square) => (
                    <button
                      aria-label={nameOf(square)}
                      aria-pressed={selected === square.cipher}
                      className={SQUARE}
                      key={square.index}
                      onClick={() => select(square)}
                      ref={(element) => void (squareRefs.current[square.index] = element)}
                      style={{ height: `${size}px`, width: `${size}px` }}
                      tabIndex={square.index === cursor ? 0 : -1}
                      type="button"
                    >
                      {/* BOTH, always. The player's guess above, the cipher letter beneath it, the
                          same way a spent keypad key carries what it is on. Which squares repeat is
                          the whole information content of a cryptogram, so the cipher letter cannot
                          go away once a guess lands -- that is exactly when the repeats are being
                          counted. Both are aria-hidden: the button's aria-label already says
                          "Cipher V, letter 1 of 9, holds A", and letting these through would have a
                          screen reader read the square twice. */}
                      <span aria-hidden="true" style={{ fontSize: `${Math.round(size * 0.45)}px` }}>
                        {mapping[square.cipher] ?? ''}
                      </span>
                      <span aria-hidden="true" className={ANNOTATION}>
                        {square.cipher}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Play again sits in the row the status already occupies rather than adding one. All layout
          pressure on this board is absorbed by the phrase cap above; the keypad never moves.

          The status paragraph is always mounted, empty at mount, aria-atomic="false": role="status"
          carries an implicit aria-atomic="true" in ARIA 1.2, under which every message re-reads the
          whole region. */}
      <div className="flex min-h-[44px] shrink-0 items-center gap-3">
        <p aria-atomic="false" className="flex-1 text-[var(--lull-ink)]" role="status">
          {message}
        </p>
        {solved && (
          <button
            className="min-h-11 shrink-0 cursor-pointer rounded-full border border-[var(--lull-border)] px-4 text-[var(--lull-ink)]"
            onClick={playAgain}
            type="button"
          >
            Play again
          </button>
        )}
      </div>

      {/* A SIBLING of the live region, never inside it: text present at mount inside a live region
          is announced by nothing and clutters every later message. Hidden once the first message of
          any kind arrives -- not only on the first assignment, since selecting a square also
          produces one. */}
      {message === '' && <p className="text-sm text-[var(--lull-ink-muted)]">{INSTRUCTION}</p>}

      {/* Docked and never moving: not when a hint opens, not when the phrase scrolls, not when a
          message appears. A keypad whose position is constant becomes muscle memory within a puzzle
          or two and the player stops needing to look at it. All layout pressure goes to the phrase
          cap above. 7x4 at 390, 6x5 at 320 -- this app's first responsive breakpoint. */}
      <div
        aria-label="Letters, and what each one is on"
        className="grid shrink-0 grid-cols-6 gap-1.5 min-[360px]:grid-cols-7"
        role="group"
      >
        {ALPHABET.map((plain) => {
          const on = letters.find((cipher) => mapping[cipher] === plain)
          return (
            <button
              aria-label={on === undefined ? `${plain}, not used yet` : `${plain}, on cipher ${on}`}
              className={on === undefined ? KEY : `${KEY} ${KEY_SPENT}`}
              key={plain}
              onClick={() => press(plain)}
              type="button"
            >
              <span aria-hidden="true">{plain}</span>
              {on !== undefined && (
                <span aria-hidden="true" className={ANNOTATION}>
                  →{on}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
