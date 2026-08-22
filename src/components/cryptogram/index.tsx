import React, { useEffect, useRef, useState } from 'react'

import { DEFAULT_AVAILABLE, GAP, squareSize } from './layout'
import { apply, Assignment, cipherLetters, decode, encode, isSolved, Mapping } from './mapping'
import { FloorBar } from '@components/floor-bar'
import { CryptogramData, PuzzleComponentProps } from '@types'

// 26 letters plus Undo plus Delete is 28, and 28 is a complete 7x4 rectangle. That is the whole
// reason those two utilities are on the pad rather than beside it: the grid never reflows, never
// orphans a row, and every key sits in the same place on every board the player ever opens.
//
// Delete is what the twenty-eighth key spends itself on now, and the rectangle is why that swap was
// a swap rather than an addition. `Clear` emptied the whole board, and a phone player who wanted one
// letter back had nothing but that and a single-step Undo -- so the pad's missing eraser was the one
// gap this bench recorded as unmitigated, and the key sitting in its place was the one control on
// the board that could lose nine squares to a stray tap.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

// How many moves Undo can walk back. A cap rather than an unbounded list because the history is
// snapshots of a mapping and the board is open for as long as the player leaves the tab open --
// but the number is generous rather than defensive: 50 moves is longer than any cryptogram in this
// product takes to solve, so in practice the cap is never the thing that stops an undo. What stops
// it is arriving back at the board you started with.
//
// The oldest entry is dropped, never the newest: the whole value of a history is that the recent
// end of it is intact.
const UNDO_DEPTH = 50

// px, between letters INSIDE a word, against the gap between words. Word boundaries come from
// proximity rather than from a box, and the ratio is what carries them: equal gaps plus a bracket
// is exactly what made a wrapped word read as two words in the first place.
const LETTER_GAP = 4
const WORD_GAP = 14
// Between rows of words. Generous, because each cell is a square with a caption under it and rows
// any tighter let one row's cipher letters read as the next row's squares.
const LINE_GAP = 18
// Between a square and the cipher letter captioned beneath it. Tight enough that the two read as
// one cell rather than as two rows of marks.
const CAPTION_GAP = 4

// The bench's square, and a ceiling rather than a size: a phrase whose longest word will not fit
// one line at 26 gets smaller squares, down to layout.ts's 24px target-size floor.
const SQUARE_WIDTH = 26
// The square is a PORTRAIT cell, not a box. A letter set in a square box reads as a tile in a
// board game; the same letter in a cell a third taller reads as a slot on a form, which is what
// this is -- and the extra height is where the sign cut's ascenders and descenders go without
// crowding the rule under them.
const SQUARE_ASPECT = 1.3

const FULL_BOARD = 'Every square is full. Check the ones you’re least sure of.'
// Says the mechanic, not just the gesture. "Tap a square, then tap letters" describes the taps and
// leaves the player to discover from the result that a cryptogram is one substitution across the
// whole phrase -- which is the one rule of this bench and the only thing nobody can guess. It stands
// on the board for the whole session rather than disappearing at the first message: it is a
// SIBLING of the live region, never inside it, so a permanent line costs no announcement.
//
// It now says the second unguessable thing too: the caret moves on its own. "You move on", never
// "the square moves right" -- squares do not move, and on a board whose whole premise is that fixed
// squares reveal repeats, telling the player one moves is the wrong model.
//
// "Past them", not "to the next square". The advance steps over the run the keystroke just filled,
// so on `G R R Q` a press on the first R lands the caret TWO squares along, and "the next square is
// picked for you" was false in exactly the case the whole rule exists for. What holds on every press
// is the weaker claim: the caret never stops on a square that press just filled -- short of the end
// of the phrase, where the run has nowhere to go and the caret parks on the last square of it
// instead. No standing line can say otherwise, and the ribbon names that square when it happens.
// This is the one sentence on the bench that never scrolls away, so it is the one that has to hold
// everywhere.
const INSTRUCTION =
  'Tap a square, then tap letters. Every square holding that cipher letter fills at the same time, ' +
  'and you move on past them.'
const NOTHING_TO_UNDO = 'Nothing to undo.'
// Says what happened rather than nothing. A keystroke that changes no square is not a broken key --
// it is the player retyping a letter that is already down, which the advance makes routine: the
// caret skips the run it just filled, so a player spelling the word out loud arrives on a square
// their own last keystroke already answered.
//
// One sentence, and no offer of a way to empty the square. Nothing on the BOARD empties anything any
// more -- the eraser and Undo do, and both are keys rather than gestures on a square -- so a clause
// here teaching a two-tap gesture would be teaching a gesture that does not exist.
const ALREADY = (cipher: string, plain: string): string => `Cipher ${cipher} is already ${plain}.`
const NO_SQUARE_SELECTED = 'Tap a square first, then a letter.'
// The tail on `select`'s sentence, on every square the player lands on. Filled or empty, the next
// thing to do there is the same thing: activating a square picks where the next letter goes and
// never takes one off, so there is no second gesture to offer on the filled half.
const PICK = 'Pick a letter.'
// Appended to a repeated message so a live region has something to announce. `setMessage` with an
// identical string is an Object.is bail-out: the DOM text never changes, and role="status" is
// keyed to a change rather than to a write. The messages most likely to repeat are exactly the
// ones that answer a key which did nothing -- `Nothing to undo.`, `Nothing to clear — you’re on
// the first square.` -- so the second press of a dead key was silent, which is the broken-key
// reading this bench keeps removing. A zero-width space is the cheapest string that differs:
// it draws nothing, wraps nothing, and screen readers skip it. Alternated on the low bit of a
// counter rather than accumulated, so the mark stays one character however long the session runs.
const REPEAT_MARK = '\u200b'
// The eraser stepped back onto a square that is also empty. On the keyboard, focus lands on that
// square and the square announces its own name, so the ribbon owes exactly the one fact focus
// cannot carry: the key took nothing off. This used to repeat `select`'s sentence word for word,
// which said where the caret is twice and whether anything was cleared not at all.
//
// On the pad, focus stays on the key and nothing announces the landing, so this sentence takes the
// same `Now on ...` tail every other pad press takes. The two halves are the same split the advance
// already lives under: say the fact focus cannot carry, and add the position only where focus is
// not carrying it.
const NOTHING_TO_CLEAR_THERE = 'Nothing to clear there.'
// The eraser on the first square with nothing on it. This was the one input on the board that
// answered nothing at all, which reads as a broken key rather than as a key with nothing to do.
//
// It names the SQUARE, never the board. This branch fires on the first square alone, and the rest
// of the phrase may be full -- so a bare "Nothing to clear." is flatly false to a player looking at
// eight squares with letters in them, and says nothing about why the key declined.
const NOTHING_TO_CLEAR_FIRST = 'Nothing to clear — you’re on the first square.'
// An arrow at a boundary: ArrowLeft on the first square, ArrowRight on the last, ArrowUp in the
// first word, ArrowDown in the last. `move` clamps to the index the caret is already on, and
// setCursor with the same value is a state bail-out -- the [cursor] effect never runs, so focus does
// not move and the square does not re-announce. That left the arrows as the last inputs on this
// board that answered nothing at all, which is the broken-key reading every other message here
// exists to remove.
//
// Two sentences rather than one, because the arrows mean two different things. Left and right step
// one square; up and down step one WORD, and "no square that way" is false where the caret is
// mid-word with five squares behind it.
const NO_SQUARE_THAT_WAY = 'No square that way.'
const NO_WORD_THAT_WAY = 'No word that way.'

// aria-pressed variants rather than disabled ones, because these controls stay genuinely enabled --
// a disabled element blurs on press and drops focus to <body>.
//
// The square holds the PLAYER'S LETTER and nothing else, and the cipher letter is captioned beneath
// it, outside the control. Both marks used to be stacked inside the box, which is what made a 30px
// square carry two lines of type: the guess came out at 15px, the cipher at 10, and neither was the
// size it wanted to be. Split, the guess gets the whole square and the cipher letter gets a line of
// its own -- and the caption row is what makes the phrase scannable, because the ciphertext now
// reads straight across as a line of text rather than as a footnote inside each box.
const SQUARE =
  'flex cursor-pointer items-center justify-center rounded-[var(--lull-r-sm)] ' +
  'border border-[var(--lull-rule)] bg-[var(--lull-raised)] leading-none text-[var(--lull-ink)] ' +
  'shadow-[inset_0_1px_1px_rgba(255,255,255,0.55)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.09)] ' +
  'hover:border-[var(--lull-accent)] aria-pressed:border-2 aria-pressed:border-[var(--lull-accent)]'

// The caret, marked APART from the run rather than with it. Every square of the run presses
// together, but only the one the caret stands on is where the next letter lands -- so on a run of
// three squares that all look identical, one of them is the typing position and the other two are
// merely evidence. The advance makes the distinction routine rather than rare, because it lands the
// caret on squares the player never chose, sometimes without changing a single mark on the board.
//
// WEIGHT, not offset, and drawn INSIDE the square. A detached ring was the first answer and it was
// too quiet by half: the same hue at the same 2px, two pixels off a border of the same hue, against
// a sibling of the same run that draws the border alone. Its weakest case is the routine one -- the
// caret standing on one square of a filled run while its siblings draw every other mark it does, so
// the ring is the whole difference. An inset ring inside the pressed border reads as a 4px edge
// against a sibling's 2px and an unrelated square's 1px: three weights, told apart at a glance
// rather than by measuring a gap.
//
// Inside is load-bearing twice over. The old ring stood 4px proud of a box with 6px between letters
// and 3px above the caption the layout calls load-bearing, so it grazed the cipher letter it is not
// about. And it was an `outline`, which is the property index.css's global focus ring sets -- an
// unlayered rule that outranks any Tailwind utility, so the caret's own mark vanished under the
// focus ring on every square the player typed into. A ring is a box-shadow: the two marks now
// coexist, and the caret is still stated in aria-current so the distinction never rides on colour.
//
// --lull-accent on --lull-raised is a pair contrast.test.ts already holds to 4.5:1, well over the
// 3:1 a boundary owes 1.4.11, so this introduces no pair that needs registering there.
const SQUARE_CARET = 'inset-ring-2 inset-ring-[var(--lull-accent)]'

// Never --lull-hair: that token is decorative and may not draw the boundary that identifies a
// control. The selected border is --lull-accent and is stated in aria-pressed as well, so the
// selection is never carried by colour alone -- and the caption follows the border into the accent
// for the same reason a spent key annotates itself: the mark and its label move together.
const CIPHER = 'leading-none tracking-[0.09em] text-[var(--lull-muted)]'
const CIPHER_SELECTED = 'leading-none tracking-[0.09em] font-semibold text-[var(--lull-accent)]'

// The panel the phrase is worked on. Flat --lull-plate rather than an Enclosure bezel: the nested
// double-bezel is reserved for the plates that carry weight (the date plate, the goal plate), and a
// bezel here would put a second frame inside the bench's own. It fills the band edge to edge, so
// the working surface IS the page rather than a card laid on it.
//
// flex-1 and NO min-h-0, which is the whole difference between a surface and a stripe. With
// min-h-0 the plate shrinks below its own content on a short viewport and the squares below the cut
// render on the bare ground with the plate's background stopping behind them. Left at the automatic
// minimum size, the plate is never shorter than what is on it, and the OVERFLOW goes where
// index.css already sends it: the board band scrolls, plate and all.
const PLATE =
  'flex flex-1 flex-col bg-[var(--lull-plate)] pt-[var(--lull-s5)] pr-[var(--lull-gutter-right)] ' +
  'pb-[var(--lull-s4)] pl-[var(--lull-gutter-left)]'

// The sign over the working surface. `.lull-signrow` (index.css) is the whole band -- height,
// ground, hairlines and gutter -- because the writing bench draws the same one and a band that
// two benches share is the grammar rather than a string copied twice.
//
// Sticky, so the two facts it holds do not scroll away with the phrase. The board is the one band
// that flexes and therefore the one that scrolls, and on a short window a three-line phrase
// scrolls -- taking "10 of 22 squares filled" off the top of the screen with it, which is the
// number a player checks most and the only place it is written.
const SIGN_ROW = 'lull-signrow sticky top-0'

// Drawn on the floor, where the ink and the rule are the floor's own tokens: the global palette is
// chosen to read on a light ground and every one of these keys sits on a band that is dark in both
// themes.
//
// A spent key stays FULLY legible -- full ink, its annotation at full opacity in the floor accent.
// Not opacity-40, which would dim the key table exactly when it is being read most.
const KEY =
  'flex min-h-11 min-w-0 cursor-pointer flex-col items-center justify-center gap-[2px] ' +
  'bg-[var(--lull-floor)] leading-none font-semibold text-[var(--lull-floor-ink)] ' +
  'hover:text-[var(--lull-floor-accent)] active:bg-[var(--lull-floor-ink)] active:text-[var(--lull-floor)]'

// On the letter itself rather than on the key, so the two utility keys can set their own size
// without the two arbitrary font-size utilities racing each other in the generated stylesheet.
const KEY_LETTER = 'text-[17px]'
// The two utility keys, accented so the rectangle reads as 26 letters and two tools rather than as
// 28 undifferentiated keys. Their words say which is which; the accent only groups them.
//
// WORDS, both of them, and that is why `Delete` was measured rather than shortened by reflex. The
// tools read as tools because they are words among single letters, and there is no universal undo
// glyph -- so a glyph beside a word would be worse than either consistent choice, and an icon pair
// would throw away the one cue that separates the tools from the alphabet. At 11.5px in Source
// Serif 4 with 0.05em of tracking, `Delete` sets about 36px against the 44.86px key the pad draws
// at a 320 viewport (320 less six 1px gridlines, over seven columns), so it fits with room on both
// sides; every fallback in the body stack is narrower still, so the shipped face is the worst case.
// `Erase` was the shorter real word held in reserve and was not needed.
const KEY_UTILITY = 'text-[11.5px] tracking-[0.05em] text-[var(--lull-floor-accent)]'
const KEY_NOTE = 'text-[9.5px] leading-none font-normal tracking-[0.07em] text-[var(--lull-floor-accent)]'

interface Square {
  cipher: string
  // Position in reading order across the whole phrase, 0-based.
  index: number
  word: number
}

// One entry of the history: the board as it stood BEFORE a move, and where the caret was standing
// when the player made it.
//
// A SNAPSHOT of the whole mapping rather than the letter that was assigned, because restoring
// covers clears, steals and overwrites with one rule where re-clearing the assigned letter could
// only walk back an assignment -- a run emptied by the eraser was gone for good. A mapping is at
// most 26 short strings, and the cap is 50, so the whole history is smaller than the phrase it
// belongs to.
//
// The caret comes with it because undoing a move and being left somewhere else is not undoing the
// move. Type four letters, notice the second was wrong, and four presses of Undo should put both
// the board and the cursor back where the mistake was, ready to retype.
interface Move {
  caret: number | null
  mapping: Mapping
}

// Letters only, matching cipherLetters. A pack is JSON off the network, so the ciphertext is
// untrusted -- and a square keyed on an apostrophe would be one no key on the pad could ever fill,
// so the tally could never reach its total and the status line would understate the board forever.
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

export const CryptogramBoard = ({ onProgress, onSolved, progress, puzzle }: PuzzleComponentProps<CryptogramData>) => {
  const { answer, category, ciphertext } = puzzle.data

  const [squares] = useState(() => squaresOf(ciphertext))
  const [letters] = useState(() => cipherLetters(ciphertext))
  // Restored once, at mount. The shell keys this component on the puzzle id, so a different puzzle
  // is a different component rather than a prop change, and re-reading would hand it its own writes.
  const [mapping, setMapping] = useState<Mapping>(() => decode(progress, ciphertext))
  // The one pointer. A caret, not a selection: `null` means nothing has been picked yet, and with
  // the whole-board clear gone that is reachable AT MOUNT AND NOWHERE ELSE -- no input on this board
  // puts the pointer back. Two independent pointers cannot survive a typing flow, because there is
  // exactly one place the player is typing.
  const [cursor, setCursor] = useState<number | null>(null)
  // The ribbon's text, plus a counter that changes on every write. See REPEAT_MARK: without the
  // counter, saying the same sentence twice is a state bail-out and the second press is silent.
  const [message, setMessage] = useState({ nonce: 0, text: '' })
  // Every move this session made, oldest first, capped at UNDO_DEPTH. Undo pops the newest.
  //
  // It used to be one snapshot deep, which made Undo a correction key rather than a history: a
  // player who typed three letters and then thought better of the whole word could take back one of
  // them and no more, and the second press answered "Nothing to undo." about moves it could plainly
  // see on the board.
  //
  // A board restored from storage starts empty: the shell hands over a mapping, not a history, and
  // offering to undo a move this session never saw would be a guess at which letter went down last.
  const [history, setHistory] = useState<Move[]>([])

  // Measured, never derived from the viewport: this box sits inside the page's own horizontal
  // padding and its own, so a viewport-derived width is wrong before anything else goes wrong.
  const [available, setAvailable] = useState(DEFAULT_AVAILABLE)
  const boardRef = useRef<HTMLDivElement>(null)
  // The floor, so the window-level key handler can tell a keystroke aimed at this bench from one
  // aimed at the rest of the page. Only the arrows need the distinction -- see `onKeyDown`.
  const instrumentRef = useRef<HTMLDivElement>(null)
  const squareRefs = useRef<(HTMLButtonElement | null)[]>([])
  const hasMoved = useRef(false)
  // Armed for one cursor move, and only for a move that will actually happen. The focus effect's
  // dep array is [cursor], so it does not run when the cursor does not change -- a flag armed on a
  // no-op move would strand and then eat the NEXT legitimate focus move, leaving the roving
  // tabIndex on a square that never receives focus and killing arrow navigation silently.
  const skipFocus = useRef(false)

  useEffect(() => {
    const board = boardRef.current
    if (board === null || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      // A hidden or not-yet-laid-out box reports zero, and honouring that collapses every square.
      if (width > 0) setAvailable(width)
    })
    observer.observe(board)
    return () => observer.disconnect()
  }, [])

  // Focus follows the cursor, but only once the player has moved it -- grabbing focus at mount would
  // scroll a deep-linked page past its own heading.
  //
  // Both guards now name the same moment. Nothing drops the pointer any more, so `cursor === null`
  // is the mount state alone, and `hasMoved` is false there too. They are kept apart because they
  // guard different things: the null check is what the cursor's own type demands before it can index
  // a ref array, and `hasMoved` is the rule that focus is never seized before the player has asked
  // for it. Collapsing them would make the rule depend on the type.
  //
  // And it stands down entirely for one move when a pad key asked it to. `skipFocus` is CAPTURED
  // before it is reset: resetting first makes the flag always false where it is read, which makes
  // the whole gate a no-op. Resetting before the early returns is what keeps it from stranding.
  useEffect(() => {
    const skip = skipFocus.current
    skipFocus.current = false
    if (cursor === null || !hasMoved.current || skip) return
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
  // squareSize does its arithmetic with layout.ts's 2px GAP, and the bench draws 4px between the
  // letters of a word, so the extra is taken off the width before the question is asked. The
  // alternative was editing layout.ts, which is shared logic and not this bench's to retune.
  const size = Math.min(SQUARE_WIDTH, squareSize(available - (LETTER_GAP - GAP) * (longest - 1), longest))

  // The cipher letter under the pointer. Every square showing it presses together -- that is the
  // mirror this bench is built on, and it is why the squares carry aria-pressed rather than one
  // roving selection.
  const selectedCipher = cursor === null ? null : (squares[cursor]?.cipher ?? null)

  // Every write to the ribbon goes through here, so no caller has to remember that saying the same
  // thing twice is a different job from saying it once. The counter is what the DOM sees change.
  const say = (text: string): void => setMessage((previous) => ({ nonce: previous.nonce + 1, text }))

  // `source` exists so a square can be named against a mapping the STATE has not caught up to yet:
  // setMapping is async, so inside the handler that assigned, only the returned mapping is current.
  const nameOf = (square: Square, source: Mapping = mapping): string => {
    const held = source[square.cipher]
    const state = held === undefined ? 'empty' : `holds ${held}`
    return `Cipher ${square.cipher}, letter ${square.index + 1} of ${squares.length}, ${state}`
  }

  // The caret goes somewhere the player pointed at without activating anything: an arrow, the
  // eraser stepping back, or entering the board from nothing picked.
  //
  // `blocked` is what to say when the clamp puts the caret back on the square it is already on. The
  // default is the left/right sentence, and neither caller that takes the default can reach it: the
  // eraser steps back only past its `cursor === 0` return, so its target is strictly left of the
  // caret, and entering the board is a move from `null`, which no index equals.
  const move = (next: number, blocked: string = NO_SQUARE_THAT_WAY): void => {
    hasMoved.current = true
    const target = Math.min(squares.length - 1, Math.max(0, next))
    // setCursor(same) is a bail-out, so nothing downstream of it happens: the [cursor] effect does
    // not run, focus does not move, and the square does not re-announce. The sentence is the only
    // thing the player gets, so it has to be said here rather than left to an effect that will not
    // run.
    if (target === cursor) {
      say(blocked)
      return
    }
    setCursor(target)
  }

  // Rows 3, 5 and 6 change something the player is not looking at, so each names it. An unannounced
  // state change is lost work, and 5 and 6 are the common ones -- a player changing their mind
  // about a square that already has a letter.
  const assignmentMessage = (cipher: string, plain: string, result: Assignment): string => {
    // Row 4 of the table: the square emptied, which only the eraser now reaches -- Backspace and the
    // pad's Delete key, both of which are the one `erase` function. Undo restores a snapshot rather
    // than running an assignment, so it does not come through here at all.
    //
    // It names the letter that came off, which the row-4 branch of `apply` does not report -- it
    // returns `released: null` there, because the letter released IS the letter passed in. Emptying
    // a three-square run puts a letter back on the pad, which is the same size of off-screen change
    // as spending one, and rows 5 and 6 have always named it.
    if (result.cleared) return `${cipher} is empty again — ${plain} is free.`

    const count = squares.filter((square) => square.cipher === cipher).length
    const moved = `Every ${cipher} is ${plain} now — ${count} square${count === 1 ? '' : 's'}.`
    if (result.stolenFrom !== null && result.released !== null) {
      return `${moved} ${result.stolenFrom} is empty, ${result.released} is free again.`
    }
    if (result.stolenFrom !== null) return `${moved} ${result.stolenFrom} is empty again.`
    if (result.released !== null) return `${moved} ${result.released} is free again.`
    return moved
  }

  // Upper-cased to match the board: every square shows an upper-case letter, so an answer read back
  // in the pack's own casing would look like a different string from the one just spelled. Shared,
  // because a board can also arrive back at the answer by Undo restoring the mapping that spelled
  // it, and the two paths must not read differently.
  const solvedMessage = (): string => `Solved. The answer is ${answer.toUpperCase()}.`

  // The one path that ASSIGNS, so a tapped key, a typed letter and an erase cannot drift apart: all
  // of them arrive here and all of them are the same six-row table. Undo is the exception and is one
  // deliberately -- it restores the snapshot this function takes, rather than running a move of its
  // own that would have to be kept in step with the table forever.
  // Returns what it did, so `press` can ask whether that assignment solved the board without
  // re-running the check against a `mapping` state this handler has not seen update yet.
  //
  // `landed` is the square the caret is about to stand on, and it owns the tail because the tail is
  // the last rung of this message ladder. Rebuilding the ladder in the callers instead would let a
  // tapped key and a typed one drift apart, which is the thing this function exists to forbid. Only
  // the PAD path passes one, on either key: the keyboard moves focus onto the landed square and the
  // square announces itself, so a tail there would say the same fact twice.
  const assign = (cipher: string, plain: string, landed: Square | null): Assignment => {
    const result = apply(mapping, cipher, plain)
    setMapping(result.mapping)
    onProgress(encode(result.mapping))
    // The board as it stood a moment ago, and where the player was standing when they changed it.
    // Pushed here rather than in each caller so a clear, a steal and an overwrite are all undoable
    // by the one mechanism -- an earlier version dropped the move on a clear, which made emptying a
    // run unrecoverable by the key whose whole job is recovering from a move.
    //
    // The cap drops the OLDEST entry. slice(-(UNDO_DEPTH - 1)) rather than shift-when-full because
    // this is a state update, not a mutation: the array has to be rebuilt anyway, and one
    // expression that is correct whatever length it starts at cannot drift out of step with the cap
    // the way a length check beside a push can.
    setHistory((previous) => [...previous.slice(-(UNDO_DEPTH - 1)), { caret: cursor, mapping }])

    // The solve REPLACES the assignment message: the answer is the complete news, and telling a
    // player to check the squares they are least sure of is simply false on a correct board.
    if (isSolved(ciphertext, result.mapping, answer)) {
      say(solvedMessage())
      return result
    }
    // A full board that is not the answer is the one state the player cannot see: every square
    // shows a letter and nothing says which of them is wrong.
    //
    // APPENDED, never substituted. Only a fresh assignment can make a board newly full, but a
    // player then goes on rearranging a board that STAYS full -- and every one of those moves
    // empties a square somewhere off screen. Replacing the message would swallow "Z is empty
    // again." on every steal from that point on, which is exactly the lost work rows 3, 5 and 6
    // name their side effects to prevent.
    //
    // Asked of BOTH mappings, because "the board is full" and "the board just became full" are
    // different facts and only the second is worth a sentence. Read off the result alone it is true
    // on every press for the rest of the game, and since the notice and the tail cannot both fit it
    // would suppress the tail for the whole endgame -- the phase of careful single-square
    // corrections, where every square already holds a letter and the next pad tap overwrites
    // whichever one the caret silently moved to. Fullness is stale news on the fifth consecutive
    // full-board move; where the caret is standing is fresh news every time.
    const wasFull = letters.every((letter) => mapping[letter] !== undefined)
    const full = letters.every((letter) => result.mapping[letter] !== undefined)
    const assigned = assignmentMessage(cipher, plain, result)
    // Either the full-board notice or the tail, never both, and that stays true now that the ribbon
    // can grow. FULL_BOARD plus an assignment message plus a tail is three clauses about three
    // different things arriving in one breath -- and a ribbon that answers a single keystroke by
    // covering four lines of the phrase it is about is worse than one that says the two things that
    // matter. The tail is the cheaper of the two at 41 characters against 57.
    if (full && !wasFull) {
      say(`${assigned} ${FULL_BOARD}`)
      return result
    }
    // Named against result.mapping, never against the mapping STATE, which has not updated inside
    // this handler. It matters most on a steal, where the landed square's cipher may have just been
    // emptied by the very assignment being announced.
    say(landed === null ? assigned : `${assigned} Now on ${nameOf(landed, result.mapping)}.`)
    return result
  }

  // A RUN is a maximal block of adjacent squares sharing one cipher letter, and these two are the
  // ONLY place on this board where adjacency is reasoned about. Every caret move is expressed
  // against their boundaries:
  //
  //   forward   go to the end of the caret's run, then one past it -- or stay on the end if there
  //             is nothing past it
  //   backward  step to the square before the caret, then to the start of THAT square's run
  //
  // A run of one is n = 1, not an edge case: `runEnd(cursor) + 1` on a single-square run simply IS
  // `cursor + 1`. That is the whole reason this pair replaced a pair of predicate searches -- "first
  // index whose cipher differs" and "leftmost index of this cipher" computed the same answers and
  // hid the concept behind the predicate, so the run that reaches the end of the phrase read as an
  // edge case needing its own fallback clause bolted on at the call site rather than as one of three
  // ordinary positions a run's end can be in.
  //
  // Derived from `squares[index].cipher` rather than taking a cipher argument. The run a square
  // belongs to is a fact ABOUT that square, and a signature that let a caller pass some other letter
  // would let it ask for a run that does not exist. Both callers hold a square they have already
  // checked, so the index is always in range.
  //
  // Index adjacency, read off the flat `squares` array, so a run that spans a word gap is one run in
  // BOTH directions -- the caret leaps 20px of WORD_GAP in a single move, over squares no player
  // reads as a run. That follows from the rule rather than escaping it: one keystroke fills every
  // square of the run, so none of them is a square to stop on. And it is the RUN, never every square
  // of that cipher: a repeat further along the phrase (`X L B X`) is a separate square in a separate
  // position, and the player still spells their way to it.
  const runStart = (index: number): number => {
    const { cipher } = squares[index]
    return squares.findLastIndex((square, at) => at < index && square.cipher !== cipher) + 1
  }

  // findIndex's -1 means nothing to the right differs, which is exactly a run that reaches the end
  // of the phrase -- so the run ends on the last square. findLastIndex's -1 in `runStart` is the
  // mirror: nothing to the left differs, so the run starts at 0, which is what the `+ 1` says.
  const runEnd = (index: number): number => {
    const { cipher } = squares[index]
    const differs = squares.findIndex((square, at) => at > index && square.cipher !== cipher)
    return differs === -1 ? squares.length - 1 : differs - 1
  }

  // `keepFocus` is the PAD, however it was activated -- click, Enter or Space. The partition is not
  // device: a screen-reader user pressing Enter on a pad key is on the keyboard and still must keep
  // focus on that key or be stranded mid-run. It is also why the pad path gets a tail and the
  // board's own key handler does not -- only one of the two announces the landed square by moving
  // focus onto it, and the other would then say the same fact twice.
  const press = (plain: string, keepFocus: boolean): void => {
    if (cursor === null) {
      say(NO_SQUARE_SELECTED)
      return
    }
    const here = squares[cursor]
    if (here === undefined) return
    // Computed BEFORE anything moves. The focus gate is armed only when the caret will actually
    // change, because a flag armed on a move that never happens would eat the next real one.
    //
    // The run is the caret's own, on both paths through this function. On the assigning path it is
    // the run the keystroke just filled; on the free keystroke it is the run that already held the
    // letter -- the same squares either way, and the same caret either way, which is why one
    // expression covers both.
    //
    // Three positions the end of that run can be in, and not one of them is a special case.
    //
    // The run ends short of the phrase, so the target is one past its end -- which on a run of one
    // is simply the next square, because a run of one is n = 1 rather than an exception.
    //
    // The run reaches the end of the phrase and the caret is behind it, so the target is the last
    // square. The keystroke filled through to the end, and the end of what a keystroke did is where
    // the caret belongs -- not the middle of a run the player has finished with. Parking is a real
    // move, so it also gets the caret out of the board's quietest state: the tail names the square
    // and focus follows it exactly as on any other advance, where "no tail" said neither where the
    // caret was nor whether it had moved.
    //
    // The caret is already on the last square, so there is nowhere to go and the target is NULL
    // rather than the square it is already on. setCursor(same) is a React bail-out: the [cursor]
    // effect does not run, so a flag armed for that move would strand and eat the next legitimate
    // focus move, leaving the roving tabIndex on a square that never receives focus.
    //
    // No wrap anywhere in it: the last square is the end of the phrase, not a lap.
    const last = squares.length - 1
    const end = runEnd(cursor)
    const target = end < last ? end + 1 : cursor < end ? end : null
    const landed = target === null ? null : squares[target]

    const advance = (): void => {
      if (target === null) return
      if (keepFocus) skipFocus.current = true
      setCursor(target)
    }

    // A redundant keystroke is FREE. The advance skips the run it filled, so this is not the way
    // SEEK gets spelled any more -- it is the player who says the word out loud as they type it, or
    // who taps the pad key labelled `= V` to check what V is on. Under apply's row 4 the letter a
    // square already shows is the one that ERASES it, so without this intercept both of those
    // gestures would empty a run the player was only reading. Nothing is assigned and the caret
    // moves on. Ordered after the null guard because it has to read squares[cursor] to ask its
    // question.
    if (mapping[here.cipher] === plain) {
      const already = ALREADY(here.cipher, plain)
      // No assignment ran, so the mapping STATE is already current and is the right source here.
      say(keepFocus && landed !== null ? `${already} Now on ${nameOf(landed)}.` : already)
      advance()
      return
    }

    const result = assign(here.cipher, plain, keepFocus ? landed : null)
    // A solve ends the board, and moving the cursor off the answer would be a loss. SOLVED, not
    // merely full: a wrong letter in the last empty square still advances.
    if (isSolved(ciphertext, result.mapping, answer)) return
    advance()
  }

  // Activating a square puts the caret on it and says so. That is the WHOLE of it: one branch, no
  // state, and nothing it can do to the letters on the board.
  //
  // It does not deselect, because arrows move the cursor and Enter fires the button natively, so a
  // deselect-on-re-tap rule would make {ArrowRight}{Enter} -- the only keyboard selection gesture
  // here -- a throw-away-my-position key. No text field lets you tap the caret to un-place it.
  //
  // And it no longer CLEARS on a second activation. That gesture existed to give a phone player some
  // way to empty one square off a pad with no Backspace on it, and it cost more than it bought: the
  // advance lands the caret on squares nobody chose, so "tap the square you want to work on" and
  // "tap the square you want to empty" were the same gesture on a board where the player had not
  // put the caret. It took a ref, five disarm sites and a second sentence in the ribbon to make that
  // survivable, and every one of them was load-bearing. The eraser and Undo empty things now -- both
  // keys, both unambiguous, neither reachable by a reflex tap on a square, and the eraser is on the
  // pad, so the phone player this gesture was invented for is no longer the reason to keep it.
  const select = (square: Square): void => {
    hasMoved.current = true
    // A no-op when the caret is already here, and deliberately not special-cased: React bails out on
    // an unchanged value, so the [cursor] effect does not run and focus is not seized. Re-activating
    // the square the caret is on is therefore a re-announcement and nothing else, which is the only
    // honest answer to "I tapped the place I am already standing".
    setCursor(square.index)
    say(`${nameOf(square)}. ${PICK}`)
  }

  // What the snapshot restored, in the same vocabulary an assignment uses. Read off a DIFF rather
  // than off a remembered move, because the snapshot is the whole history this board keeps -- and
  // one assignment touches at most two cipher letters, the one it wrote and the one it stole from,
  // so this is at most two clauses.
  const undoMessage = (restored: Mapping): string => {
    const changed = letters.filter((letter) => restored[letter] !== mapping[letter])
    const parts = changed.map((letter) =>
      restored[letter] === undefined ? `${letter} is empty again.` : `Every ${letter} is ${restored[letter]} again.`,
    )
    return `Move taken back. ${parts.join(' ')}`
  }

  // Puts the board back the way it was before the most recent move, and the caret back where that
  // move was made. One rule for every kind of move: a letter placed comes off, a run emptied comes
  // back, a stolen letter goes home. Pressed again it takes back the move before that, down to an
  // empty history -- which on an untouched board, or a board restored from storage, is where it
  // starts.
  //
  // The caret restore is a PAD press like any other on this bench, so it arms `skipFocus`: focus
  // belongs on the key the player is holding down, not on the square the board just rewound to.
  // Which is also why the sentence takes the `Now on ...` tail every other pad press takes -- with
  // focus staying put, nothing else says where the caret went.
  const undo = (): void => {
    const previous = history.at(-1)
    if (previous === undefined) {
      say(NOTHING_TO_UNDO)
      return
    }
    setMapping(previous.mapping)
    onProgress(encode(previous.mapping))
    setHistory((entries) => entries.slice(0, -1))

    // The tail rides on the caret actually MOVING, exactly as it does on the free keystroke: if the
    // player never left the square they made the move on, "Now on" is a sentence about nothing.
    const landed = previous.caret === null || previous.caret === cursor ? null : squares[previous.caret]
    if (landed !== null) {
      skipFocus.current = true
      hasMoved.current = true
      setCursor(landed.index)
    }

    // A restore can put the answer back on the board -- empty a run on a solved board, then Undo --
    // and the solve is the complete news there exactly as it is on the assignment path.
    if (isSolved(ciphertext, previous.mapping, answer)) {
      say(solvedMessage())
      return
    }
    const restored = undoMessage(previous.mapping)
    // Named against the RESTORED mapping, never against the mapping state, which has not updated
    // inside this handler -- the square the caret is going back to may be one this very undo just
    // emptied.
    say(landed === null ? restored : `${restored} Now on ${nameOf(landed, previous.mapping)}.`)
  }

  // The board's whole eraser, and the one place its branch table lives. Two inputs reach it -- the
  // keyboard's Backspace and the pad's Delete key -- and there is no in-place-only delete beside
  // them, because on this board the caret stands ON a square rather than in a gap between two, so
  // the Delete/Backspace distinction a text field draws has nothing here to attach to. One rule
  // covers both inputs:
  //
  //   REMOVE THE NEAREST LETTER AT OR BEFORE THE CARET.
  //
  // Standing on a letter, that is the one you mean; standing on an empty square, the one you mean is
  // behind you. The five branches below are that rule made ordered, disjoint and exhaustive over
  // (cursor null, this square holds, cursor > 0, predecessor holds) -- they are not five rules.
  //
  // Every branch that empties something goes straight to `assign`, never through `press` and never
  // to `apply`. Not `press`, because `press` advances, and an eraser that moved the caret FORWARD is
  // the opposite of what both inputs mean -- and its free-keystroke intercept would fire on every
  // press, since the letter being taken off is by definition the letter the square already shows.
  // Not `apply`, because `apply` is pure: reaching it directly would skip setMapping, onProgress,
  // the undo snapshot and the solve check.
  //
  // `keepFocus` is the same parameter `press` takes, splitting on the same fact and for the same
  // reason: the PAD is one input, however activated, and focus must stay on the key or a
  // screen-reader user is stranded mid-word; the board's own key handler is the other, and focus
  // follows the caret there. It is also why only the pad path gets a tail -- on the keyboard path
  // the landed square announces its own name, and a tail would say that fact twice.
  const erase = (keepFocus: boolean): void => {
    // Branch 1: nothing picked. The key acts on a square and there is none; guessing one and then
    // writing to it is worse than asking.
    if (cursor === null) {
      say(NO_SQUARE_SELECTED)
      return
    }
    // A ciphertext with no letters in it leaves no squares to stand on. Only reachable from a
    // corrupt pack, and the alternative is a TypeError thrown out of an event handler.
    const here = squares[cursor]
    if (here === undefined) return
    const held = mapping[here.cipher]
    // Branch 2: clear in place. The correction case -- you are standing on the letter you want gone,
    // so nothing moves and nothing is armed. With re-activation no longer destructive, this and Undo
    // are the only ways a letter comes off the board at all.
    if (held !== undefined) {
      assign(here.cipher, held, null)
      return
    }
    // Branch 4: nowhere to step back to.
    if (cursor === 0) {
      say(NOTHING_TO_CLEAR_FIRST)
      return
    }
    // Guaranteed to exist: `cursor` is only ever set from a square's own index or clamped into
    // range, and this line is past the `cursor === 0` return -- so cursor - 1 is a square.
    const previous = squares[cursor - 1]
    const previousHeld = mapping[previous.cipher]
    // Both step-back branches land strictly left of the caret, so the move always happens and
    // `move`'s own bail-out is unreachable from here. That is what makes arming the focus gate safe
    // on this path: a flag armed for a move that never happened would strand and eat the next
    // legitimate focus move, and there is no such move below.
    //
    // Branch 3a: step back onto a letter and take it off. The clear empties the WHOLE run that
    // square belongs to, so the caret parks at the head of it rather than one square back --
    // anywhere inside the run is a square this very press just emptied, and pressing again there
    // could only answer that there is nothing to clear. Stepping to the run's head instead makes the
    // next press the branch-3a that clears the letter before it, so erasing a word costs one press
    // per distinct cipher letter exactly as typing it costs one keystroke.
    if (previousHeld !== undefined) {
      const landed = squares[runStart(previous.index)]
      if (keepFocus) skipFocus.current = true
      move(landed.index)
      assign(previous.cipher, previousHeld, keepFocus ? landed : null)
      return
    }
    // Branch 3b, the case that used to be silent, and still reachable: the predecessor is empty for
    // a reason other than a run this key just emptied -- an arrow into the middle of an unstarted
    // phrase, or a square picked with nothing behind it. The ribbon says the one thing the landing
    // itself cannot, which is that the key took nothing off. Naming the square here unconditionally
    // would emit `select`'s sentence byte for byte on the keyboard path, saying the same fact twice
    // and leaving "the eraser did nothing" and "I picked a square" indistinguishable.
    const landed = squares[cursor - 1]
    if (keepFocus) skipFocus.current = true
    move(landed.index)
    // No assignment ran, so the mapping STATE is already current and is the right source for the
    // tail -- the same arm the free keystroke takes for the same reason.
    say(keepFocus ? `${NOTHING_TO_CLEAR_THERE} Now on ${nameOf(landed)}.` : NOTHING_TO_CLEAR_THERE)
  }

  // The fallback cannot be null: a word off either end of the phrase leaves the cursor where it is,
  // and a null there would send `move` through Math.max(0, null) and land it on square 1.
  const firstOfWord = (word: number): number => squares.find((square) => square.word === word)?.index ?? cursor ?? 0

  // Arrows move the pointer, which is now also where the next letter lands. Enter is the button's
  // own job -- it activates the focused square natively and runs the same `select` a tap runs -- so
  // a keyboard player and a touch player get one board rather than two. Space is the exception, and
  // it is taken away below rather than left to the browser.
  const onKeyDown = (event: KeyboardEvent): void => {
    // A modified keypress belongs to the browser, not to the board. Without this, ⌘R, ⌃A and every
    // other shortcut is both swallowed by preventDefault below and read as a guess -- the player
    // loses the reload they asked for and a square they did not.
    if (event.altKey || event.ctrlKey || event.metaKey) return

    const target = event.target as HTMLElement | null
    // Somewhere the player is composing text owns its own keystrokes. There is no such field on
    // this bench today, so this guards a future one rather than a present bug -- but the listener
    // is on the WINDOW, and a listener with that reach has to say what it declines to touch.
    if (target !== null && (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName))) return

    const onBoard = boardRef.current?.contains(target) === true
    // The bench, as against the rest of the page. `document.body` is where a keystroke lands when
    // nothing has focus, which is the state this board deliberately arrives in -- it never seizes
    // focus at mount -- so it counts as "on the bench" for the keys that are allowed to reach in
    // from nowhere.
    const onBench = onBoard || instrumentRef.current?.contains(target) === true || target === document.body

    // A space in a cryptogram means "next word", never "activate the thing under my finger" -- and
    // on the board, left to the browser, it does the second: a square is a button, so Space fires
    // its click and re-reads the square the caret is already standing on, burying whatever the
    // ribbon was last saying about the word just spelled. The squares are the phrase, and there is
    // no space between them to move to.
    //
    // Scoped to the board, and that scope arrived with the window listener. Every key of the pad is
    // a button too, and Space is half of how a button is pressed from the keyboard: swallowing it
    // everywhere would leave a screen-reader user unable to press Undo or Delete at all.
    if (event.key === ' ') {
      if (onBoard) event.preventDefault()
      return
    }

    // ARROWS ARE SCOPED, AND LETTERS ARE NOT, and that asymmetry is the whole of what a
    // window-level listener has to get right.
    //
    // A letter or a Backspace typed at a page with no text field on it means one thing here, so the
    // board may take it from anywhere: that is the point of moving this listener to the window, and
    // it is what makes the bench playable after a pad key has quietly kept focus.
    //
    // An arrow does not. It scrolls whatever is under it and it drives whatever widget has focus,
    // and this bench puts three such things on screen at once: the hint sheet is `tabIndex={0}`
    // precisely so a keyboard user can scroll it, the board band scrolls, and below 504px so does
    // the bench column. Unscoped, every one of those was dead -- the arrow was swallowed, the caret
    // moved on a board the sheet was covering, and `move` set `hasMoved`, so the focus effect then
    // pulled focus out of whatever the player was using and into the phrase.
    if (event.key.startsWith('Arrow') && !onBench) return

    if (cursor === null) {
      // Entering the board. Any ARROW picks the first square rather than applying its delta --
      // `null + 1` is 1, which would land ArrowRight on the second square and skip the first
      // entirely. Visible, because square 0 goes from unpressed to pressed.
      if (event.key.startsWith('Arrow')) {
        event.preventDefault()
        move(0)
        return
      }
      // The other two keys act on a square, and there is none. Neither guesses one: picking a square
      // the player did not choose and then writing to it is worse than asking. Backspace routes to
      // `erase`, whose branch 1 is this refusal, rather than repeating it -- the pad's Delete key
      // has to reach the same branch, and one sentence written twice is one sentence that can drift.
      if (event.key === 'Backspace') {
        event.preventDefault()
        erase(false)
        return
      }
      if (/^[A-Za-z]$/.test(event.key)) {
        event.preventDefault()
        // Said here rather than routed through `press` for its null guard to say it. Both reach the
        // same sentence; only one of them reads like the Backspace branch three lines above, which
        // is the same refusal for the same reason.
        say(NO_SQUARE_SELECTED)
      }
      return
    }

    // A ciphertext with no letters in it leaves no squares to stand on. Only reachable from a
    // corrupt pack, and the alternative is a TypeError thrown out of an event handler, where
    // storage.ts's own comments note there is no error boundary above this.
    const here = squares[cursor]
    if (here === undefined) return
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      move(cursor + 1, NO_SQUARE_THAT_WAY)
      return
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      move(cursor - 1, NO_SQUARE_THAT_WAY)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      move(firstOfWord(here.word + 1), NO_WORD_THAT_WAY)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      move(firstOfWord(here.word - 1), NO_WORD_THAT_WAY)
      return
    }
    // The text-field convention, and the same five branches the pad's Delete key runs -- one
    // function, so the two inputs cannot answer the same board differently. `false` is the whole of
    // what this path knows that the pad path does not: focus is on the board and follows the caret,
    // so the landed square announces itself and the ribbon owes no tail.
    if (event.key === 'Backspace') {
      event.preventDefault()
      erase(false)
      return
    }
    if (/^[A-Za-z]$/.test(event.key)) {
      event.preventDefault()
      press(event.key.toUpperCase(), false)
    }
  }

  // ON THE WINDOW, not on the board, and that is the whole of what makes this bench playable from a
  // hardware keyboard.
  //
  // The handler used to hang off the board's own <section>, which meant a keystroke only reached it
  // while focus was inside the phrase. That held right up until the pad grew tools: every pad key
  // deliberately KEEPS focus when it is pressed, so the first tap on Undo, Delete or any letter
  // moved focus out of the board for good, and from then on typing did nothing at all. Nothing
  // announced it, because nothing had gone wrong -- the keystrokes were simply landing on <body>.
  //
  // A window listener also answers the plainer case it never handled: arriving on a laptop and
  // typing, with focus wherever the page left it. On this bench that is what a player expects, and
  // it is why the guards above are written as "what this declines to touch" rather than "what it
  // reaches" -- a listener at this range has to be explicit about the keys it hands back.
  //
  // No dependency array on purpose. The handler closes over `cursor`, `mapping` and `history`, all
  // of which change on nearly every press, so any array short of "everything" would leave a stale
  // closure typing into a board that has moved on. Re-subscribing on each render is one
  // removeEventListener and one addEventListener against a keystroke, which is not a cost worth a
  // correctness risk.
  useEffect(() => {
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  // Squares, not cipher letters: the count is of what is on screen, which is what the player is
  // looking at.
  const filled = squares.filter((square) => mapping[square.cipher] !== undefined).length
  const tally = solved ? 'You solved this one' : `${filled} of ${squares.length} squares filled`

  // The ribbon's string, carrying the repeat mark on every other message. Empty stays exactly empty
  // -- FloorBar renders nothing at all for '', which is what keeps the live region unoccupied at
  // mount, and a mark in there would make it non-empty and cost the first announcement.
  const announced = message.text === '' ? '' : `${message.text}${REPEAT_MARK.repeat(message.nonce % 2)}`

  // What the ribbon says when it has nothing to report, and the reason it needed one at all.
  //
  // This bench's ribbon is computed from a TRANSIENT -- `message`, set by a move -- where the other
  // two benches derive theirs from board state. A restored board has made no move, so the band came
  // back blank; and on a SOLVED board it stays blank for the whole visit, because nothing is left to
  // move. That is 52px of near-black standing between the phrase and the pad on the one screen where
  // the floor has something worth saying: the answer.
  //
  // Solved only. An unsolved board at rest has nothing here that the board is not already saying --
  // the standing instruction is a line above the squares and the tally is on the sign row -- and the
  // blank lasts exactly one keystroke.
  //
  // It cannot go through `announced`, and that is the whole reason FloorBar takes it separately: a
  // live region that mounts with text in it is a region NVDA and JAWS were never watching, so
  // putting this in the ribbon proper would cost a re-solve its announcement.
  const resting = solved ? solvedMessage() : ''

  return (
    // Exactly two elements, and they are siblings: the frame wraps them in `display: contents` and
    // index.css orders one into the board band and the other into the floor. Neither knows the
    // other is there, and the shell's hint bar is ordered between them without either noticing.
    <>
      {/* The geometry of this band belongs to index.css -- it is the ONE band that flexes, and the
          seam depends on that -- so nothing here sets flex, height or vertical scrolling.
          overflow-x is the exception, and it has to be stated: a box with `overflow-y: auto` and no
          overflow-x of its own computes overflow-x to `auto` as well, which is a sideways drag
          across the phrase. Hidden, never auto, so no such drag can exist anywhere on this board.

          A <section> with a name is a landmark, which is what lets the shell and the page find the
          board without either reaching into it. */}
      <section
        aria-label="Cryptogram"
        // A flex column so the plate below can fill the band. This sets no flex, height or
        // vertical scrolling of its own -- all three belong to index.css, because this is the ONE
        // band that flexes and the seam depends on it. Laying out its own children is not the same
        // decision as sizing itself.
        className="lull-board flex flex-col overflow-x-hidden"
      >
        {/* The sign over the working surface, read the way a wayfinding sign is read: what this is
            on the left, where you stand on the right. Both are facts about the phrase and neither
            is a heading -- the board already sits under the page's h1, and a lone <h2> above it
            would buy a heading level for a word. */}
        <p className={SIGN_ROW}>
          {category !== undefined && (
            <span className="truncate text-[11.5px] font-semibold tracking-[0.11em] uppercase">{category}</span>
          )}
          {/* Last, and pushed right by justify-between whether or not a category stands opposite
              it: a hidden category leaves the tally where it was rather than sliding it left. */}
          <span className="ms-auto shrink-0">{tally}</span>
        </p>

        {/* The measured box is the PLATE, not the section: the squares are laid out inside this
            element's padding, so the section's width would overstate the room by a gutter a side
            and size every square too large. */}
        <div className={PLATE} ref={boardRef}>
          {/* A SIBLING of the live region and in another band entirely, never inside it: text
              present at mount inside a live region is announced by nothing and clutters every
              later message. It stays for the whole session -- the ribbon says what just happened,
              this says what the bench does, and those are different jobs. */}
          {/* 12.5px, the size every quiet annotation on this design is set at, and not the body
              size it used to be. The board is the one band that flexes, so every pixel this
              standing line spends is a pixel of phrase -- and at 14px with 24px under it, on a
              laptop window rather than a phone, it took four lines and pushed the last row of
              squares below the fold on a board that had not been typed into yet. */}
          <p className="mb-[var(--lull-s4)] text-[12.5px] leading-[1.45] text-[var(--lull-muted)]">{INSTRUCTION}</p>

          <div className="flex flex-wrap" style={{ columnGap: `${WORD_GAP}px`, rowGap: `${LINE_GAP}px` }}>
            {words.map((word, wordIndex) => (
              <div
                aria-label={`Word ${wordIndex + 1} of ${words.length}, ${word.map((square) => square.cipher).join(' ')}`}
                // Words never break: word shape is the primary solving cue in a cryptogram, so a
                // wrapped word reads as two words. The squares are sized so the longest word of the
                // phrase fits one line, and the phrase wraps BETWEEN words instead.
                //
                // This row may still wrap, and that is a last resort rather than a layout: a single
                // word too long for the line even at the 24px floor would otherwise be clipped by
                // the overflow rule above and its squares would be unreachable by touch. The
                // group's label above carries the whole word, so assistive tech never sees the
                // break.
                className="flex flex-wrap"
                key={wordIndex}
                role="group"
                style={{ gap: `${LETTER_GAP}px` }}
              >
                {word.map((square) => (
                  // The CELL: the control and its caption. The caption sits outside the button on
                  // purpose -- it is a label for the square, not a second thing to press, and
                  // inside the button it would have been read as part of the target and would have
                  // taken the accent border around itself when the square was selected.
                  <div
                    className="flex flex-col items-center"
                    key={square.index}
                    style={{ gap: `${CAPTION_GAP}px`, width: `${size}px` }}
                  >
                    <button
                      // Absent on every other square, never "false": aria-current has no
                      // there-is-no-caret-here state to say, and saying it on eight squares would
                      // put the word in a screen reader's mouth eight times for the one square it
                      // is not about.
                      aria-current={cursor === square.index ? 'true' : undefined}
                      aria-label={nameOf(square)}
                      aria-pressed={selectedCipher === square.cipher}
                      className={cursor === square.index ? `${SQUARE} ${SQUARE_CARET}` : SQUARE}
                      onClick={() => select(square)}
                      ref={(element) => void (squareRefs.current[square.index] = element)}
                      style={{ height: `${Math.round(size * SQUARE_ASPECT)}px`, width: `${size}px` }}
                      // `?? 0` is load-bearing: with a literal null the board would have NO tabbable
                      // square and could not be reached by keyboard at all. The focus effect gets the
                      // opposite treatment, and the asymmetry is the point -- tabbability must always
                      // name a square, focus must not be seized when the pointer is dropped.
                      tabIndex={(cursor ?? 0) === square.index ? 0 : -1}
                      type="button"
                    >
                      {/* aria-hidden: the button's aria-label already says "Cipher V, letter 1 of
                          9, holds A", and letting this through would have a screen reader read the
                          square twice. The size is a fraction of the square rather than a step on
                          the type scale, because the square itself is a fraction of the measure --
                          a fixed size would look set on a 390 phone and lost on a 320 one. */}
                      <span
                        aria-hidden="true"
                        className="lull-sign"
                        style={{ fontSize: `${Math.round(size * 0.77)}px` }}
                      >
                        {mapping[square.cipher] ?? ''}
                      </span>
                    </button>
                    {/* Which squares repeat is the entire information content of a cryptogram, so
                        the cipher letter never goes away once a guess lands -- that is exactly when
                        the repeats are being counted. Also aria-hidden, for the same reason as the
                        span above: the square's own name carries it. */}
                    <span
                      aria-hidden="true"
                      className={selectedCipher === square.cipher ? CIPHER_SELECTED : CIPHER}
                      style={{ fontSize: `${Math.max(9, Math.round(size * 0.38))}px` }}
                    >
                      {square.cipher}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FloorBar takes no className, and CSS cannot move a box into another parent -- so the band
          class goes on a wrapper around it rather than on the bar itself. The wrapper adds no
          geometry of its own: the bar inside it is a fixed --lull-seam tall, so the flex item this
          becomes is exactly as tall as the seam it stands for. */}
      <div className="lull-instrument" ref={instrumentRef}>
        <FloorBar message={announced} resting={resting}>
          {/* 7x4, full bleed, no horizontal padding: at 320 the keys are 44.86 wide and 44 tall,
              which is 2.5.5's target size on the control this board is tapped on most. The 1px
              gaps are the gridlines -- the keys are opaque floor and the grid behind them is the
              floor rule, so the rectangle reads as one ruled pad rather than 28 loose buttons.
              4 rows of 44 and 3 gaps of 1 is 179, which is the instrument's whole budget. */}
          <div
            aria-label="Letters, and what each one is on"
            className="grid shrink-0 grid-cols-7 gap-px bg-[var(--lull-floor-rule)]"
            role="group"
          >
            {ALPHABET.map((plain) => {
              const on = letters.find((cipher) => mapping[cipher] === plain)
              return (
                <button
                  aria-label={on === undefined ? `${plain}, not used yet` : `${plain}, on cipher ${on}`}
                  className={KEY}
                  key={plain}
                  onClick={() => press(plain, true)}
                  type="button"
                >
                  {/* The mirror, and the reason there is no map strip, no meter and no legend
                      anywhere on this bench: the square carries the cipher letter under the
                      player's guess, and the key carries the cipher letter it is spoken for under
                      the letter itself. Two stacks, drawn the same way, read the same way. */}
                  <span aria-hidden="true" className={KEY_LETTER}>
                    {plain}
                  </span>
                  {/* "= Z", not a bare "Z". The key reads as a statement -- this letter IS that
                      cipher -- where the lone letter read as a second, smaller key sitting under
                      the first one. The equals sign is scenery, like the pip on the spine: the
                      key's own name already says "A, on cipher Z". */}
                  {on !== undefined && (
                    <span aria-hidden="true" className={KEY_NOTE}>
                      {`= ${on}`}
                    </span>
                  )}
                </button>
              )
            })}
            {/* Undo, never "Take back": one word, the word every other application on the device
                uses for this, and the word the player is already looking for. */}
            <button className={`${KEY} ${KEY_UTILITY}`} onClick={undo} type="button">
              Undo
            </button>
            {/* Delete, and it IS Backspace -- the same `erase`, the same five branches, reached by
                a key on the pad instead of a key on a hardware keyboard. There is no separate
                in-place delete for it to be told apart from, because the caret stands ON a square
                rather than between two of them, so the distinction a text field draws has nothing
                here to attach to. `true` keeps focus on the key, exactly as every other pad key
                does.

                It replaces `Clear`, which emptied the whole board. A player who wants one letter
                back was the reason the pad needed an eraser, and a key that takes nine squares off
                on a single tap was never the answer to that -- it was the largest destructive action
                on the bench sitting one thumb-width from the letters, with a single-step Undo behind
                it. */}
            <button className={`${KEY} ${KEY_UTILITY}`} onClick={() => erase(true)} type="button">
              Delete
            </button>
          </div>
        </FloorBar>
      </div>
    </>
  )
}
