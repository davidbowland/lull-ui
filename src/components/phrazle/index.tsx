import { everyWordInDictionary, isValidGuess, splitPhrase } from '@rules/is-valid-guess'
import { markGuess, TileState } from '@rules/mark-guess'
import React, { useEffect, useRef, useState } from 'react'

import { DEFAULT_WIDTH, LETTER_GAP, ROW_GAP, tileSize, WORD_GAP } from './layout'
import { decode, encode } from './progress'
import { FloorBar } from '@components/floor-bar'
import { PhrazleData, PuzzleComponentProps } from '@types'

// 26 letters plus Guess plus Delete is 28, and 28 is a complete 7x4 rectangle -- the cipher bench's
// arithmetic verbatim, at the same key sizes (54.9 x 44 at 390, 44.86 x 44 at 320) inside the same
// 179px budget. Nothing about the instrument is reinvented, which is the point of naming a bench
// after its input.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

// The floor a board handed no dictionary stands on. everyWordInDictionary is documented and TESTED
// to reject every word against an empty set, so such a board refuses every guess rather than
// throwing or silently accepting garbage. It is the SECOND line of defense: the first is that
// PuzzleFrame is the only thing that mounts a board and will not mount this one without a word list.
const EMPTY: ReadonlySet<string> = new Set()

// THIS BOARD CANNOT BE LOST AND DRAWS NO ROW IT DOES NOT NEED. There is no MAX_ROWS and no
// `maxGuesses`: the limit came off the wire entirely, because a player guesses until the phrase
// falls. The grid holds the guesses already made plus the one being composed, so it grows by exactly
// one row per commit and never stands taller than the game actually is.
//
// GRID_ALLOWANCE went with it. It was the height the band spent above the grid -- the sign row plus
// the standing instruction and key -- and it existed only to be subtracted from a height budget the
// tiles were sized against. Nothing measures the band's height any more; see layout.ts.

// THE FOUR STATES ARE ASSIGNMENT OUTCOMES, NOT MEMBERSHIP TESTS, and this table is where that rule
// is kept. `no copy left`, never `not in the phrase`: markGuess's own fixture ships a gray H on a
// phrase that CONTAINS an H, because the phrase's one H was already spent by a green, so a
// membership claim there is a lie the player can disprove by looking.
//
// The same four phrases serve the tile names and the ribbon, so the board says one thing in one
// voice, and the vendored TileState literals are the keys -- no second vocabulary, no translation
// layer that can drift from the rule.
const PHRASE: Record<TileState, string> = {
  gray: 'no copy left',
  green: 'in place',
  purple: 'in another word',
  yellow: 'elsewhere in this word',
}

// SEGMENTS COUNT DISTANCE FROM HOME. One unbroken bar: the letter is home. Two: it belongs in this
// word, somewhere else. Three: it belongs in another word. None: no unspent copy is left anywhere.
// A mnemonic with a direction rather than four arbitrary shapes, learnable in one guess.
//
// A corner pip was the first answer and was rejected on measurement: at 320 a tile can be 18px and a
// pip sized to fit is 4px, at which a filled disc, an open ring and a bar are the same mark.
const SEGMENTS: Record<TileState, number> = { gray: 0, green: 1, purple: 3, yellow: 2 }

// The gray tile takes NO new token at all -- plate ground, muted ink, and a `rule` border, because a
// plate-on-plate tile has no boundary and `hair` is forbidden from drawing one: hair is decorative
// and this boundary carries state. The other three are the palette's only chromatic values besides
// the accent, and the letter on all three is `onAccent` in both themes, which is why colors.ts gained
// three keys and not six.
const FILL: Record<TileState, string> = {
  gray: 'border border-[var(--lull-rule)] bg-[var(--lull-plate)] text-[var(--lull-muted)]',
  green: 'bg-[var(--lull-tile-green)] text-[var(--lull-on-accent)]',
  purple: 'bg-[var(--lull-tile-purple)] text-[var(--lull-on-accent)]',
  yellow: 'bg-[var(--lull-tile-yellow)] text-[var(--lull-on-accent)]',
}

// A TILE NOBODY HAS MARKED YET IS NOT A GRAY TILE, and giving it FILL.gray would make the row the
// player is typing look exactly like a row of `no copy left` verdicts. The composing tile takes the
// RAISED surface with a `rule` border and full ink -- the same three tokens the cipher bench's
// square takes, all three of which contrast.test.ts already holds -- so the live row reads as the
// nearest thing on the board and the future rows stay flat plate behind it.
const COMPOSING = 'border border-[var(--lull-rule)] bg-[var(--lull-raised)] text-[var(--lull-ink)]'

const INSTRUCTION = 'Each word must be a real word of that length. Press Guess to have it marked.'
// Drawn with the ACTUAL bar segments the tiles use, so the key is the mark rather than a description
// of it. Ordered home, this word, another word, nowhere -- the order the states run in, which is the
// order the segment count counts in.
//
// SENTENCE CASE ON ALL FOUR, including the last. It read `no bar, no copy left` beside three
// capitalized siblings, which is the spec's wording quoted verbatim into a list that did not exist
// when the spec was written. `no copy left` survives unchanged as the WORDING -- it is the phrase
// every gray tile's accessible name uses and the reason it is not `not in the phrase` -- and only
// the leading capital is added, because a list of four items reading three one way and one another
// is a typo to every reader who is not holding the spec.
const LEGEND: [TileState, string][] = [
  ['green', 'In place'],
  ['yellow', 'Elsewhere in this word'],
  ['purple', 'In another word'],
  ['gray', 'No bar, no copy left'],
]

const ROW_FULL = 'Row full. Press Guess.'
const FILL_FIRST = 'Fill every tile first.'
const NOT_IN_LIST = (word: string): string => `${word} isn’t in the word list. Change it and press Guess.`
const FINISHED = 'This board is finished. Press Again to start over.'
// goFigure's sentence verbatim, because it is the same refusal for the same reason on another
// bench: a sheet is lying over the board and the keyboard is writing underneath it. A player who
// learns what it means on one bench meets the same words on this one.
const HIDE_TO_TYPE = 'Hide the hints to type.'
// Refuses to invent a maxGuesses or an answer, and refuses to crash. Only reachable from a corrupt
// pack, because isValidPuzzle deliberately leaves `data` opaque.
const INCOMPLETE = 'This puzzle didn’t arrive complete. Reload while you’re online.'

// Appended to a repeated message so a live region has something to announce: setMessage with an
// identical string is an Object.is bail-out, and role="status" is keyed to a change rather than to a
// write. A zero-width space draws nothing, wraps nothing, and screen readers skip it. Alternated on
// the low bit of a counter rather than accumulated, so the mark stays one character however long the
// session runs.
const REPEAT_MARK = '\u200b'

const PLATE =
  'flex flex-1 flex-col bg-[var(--lull-plate)] pt-[var(--lull-s5)] pr-[var(--lull-gutter-right)] ' +
  'pb-[var(--lull-s4)] pl-[var(--lull-gutter-left)]'
const SIGN_ROW = 'lull-signrow sticky top-0'
const KEY =
  'flex min-h-11 min-w-0 cursor-pointer flex-col items-center justify-center gap-[2px] ' +
  'bg-[var(--lull-floor)] leading-none font-semibold text-[var(--lull-floor-ink)] ' +
  'hover:text-[var(--lull-floor-accent)] active:bg-[var(--lull-floor-ink)] active:text-[var(--lull-floor)]'
const KEY_LETTER = 'text-[17px]'
const KEY_UTILITY = 'text-[11.5px] tracking-[0.05em] text-[var(--lull-floor-accent)]'
const TILE =
  'flex shrink-0 flex-col items-center justify-center gap-[2px] rounded-[var(--lull-r-sm)] ' + 'leading-none lull-sign'

// TWO DIFFERENT QUESTIONS, and a `??` would collapse them into one. `state === undefined` asks
// whether this tile has been marked; `shown === ''` asks whether the player has typed into it yet. A
// composing tile with no letter in it must read `Empty` rather than the empty string, and an empty
// accessible name would leave the tile unnamed for a screen reader working the row.
//
// Lifted out of the JSX rather than nested inline, because a two-level ternary inside an attribute
// is where the two questions get conflated in the first place.
const tileName = (shown: string, state: TileState | undefined): string => {
  if (state !== undefined) return `${shown}, ${PHRASE[state]}`
  return shown === '' ? 'Empty' : shown
}

// N SIBLING ELEMENTS INSIDE ONE aria-hidden WRAPPER, and that is a design constraint rather than a
// rendering detail. The obvious implementations -- a CSS gradient, a repeating background, a
// pseudo-element with a border -- put the segment count in a stylesheet, where NOTHING IN THIS REPO
// CAN ASSERT IT: style assertions are forbidden and jsdom lays nothing out. This bar is the
// load-bearing visual channel for WCAG 1.4.1 on this bench, because green and yellow sit at 6.499
// and 5.752 against the same ink and a deuteranope sees two similar dark fills -- so a channel no
// test can see is a promise this repo does not keep. Drawn as siblings, the count is DOM.
//
// The wrapper is aria-hidden because the tile's own accessible name already says the state in words
// and a screen reader must not hear it twice.
//
// THE LEGEND DRAWS THESE TOO, on purpose (the key is the mark rather than a description of it), so
// every assertion about a tile's segment count must be scoped to that tile.
//
// THE FILL IS `currentColor`, NOT A TOKEN, and that is the one thing about this component that a
// reader must not tidy. The segments were painted `--lull-on-accent`, which is the letter's color
// inside a marked tile and is therefore right on all three chromatic fills -- and the legend draws
// the same bars ON THE PLATE, where onAccent sits at 1.095:1 in light and 1.076:1 in dark. The key
// that teaches the whole mnemonic rendered four rows of blank gap and a label. `bg-current` resolves
// to --lull-on-accent inside a tile, because all three FILL values set the text color to it, so
// every marked tile is byte-identical to what it drew before; in the legend it resolves to the
// parent paragraph's --lull-muted, which is 6.525:1 light and 6.385:1 dark on plate.
//
// NOTHING UNDER JSDOM CAN SEE THIS. Computed style does not exist here and style assertions are
// forbidden, so what defends it is contrast.test.ts holding muted against plate and this paragraph.
const Bar = ({ state, width }: { state: TileState; width: number }): React.ReactNode => (
  <span aria-hidden="true" className="flex h-[2px] shrink-0 gap-[2px]" style={{ width: `${width}px` }}>
    {/* SEGMENTS.gray is 0, so this maps over nothing on a gray tile and the wrapper renders empty --
        which is exactly the zero the suite asserts. No `state === 'gray'` arm here: it would be a
        branch nothing can ever evaluate, because the loop it sits inside does not run. */}
    {Array.from({ length: SEGMENTS[state] }, (_unused, index) => (
      <span className="h-full flex-1 rounded-[1px] bg-current" data-seg="" key={index} />
    ))}
  </span>
)

// THE PROPS ARE ANNOTATED ON THE PARAMETER, not on the const, and the difference is a lint rule
// rather than a preference: `react/prop-types` cannot read a destructured parameter's shape off a
// `PuzzleComponent<PhrazleData>` annotation on the binding and reports every prop as unvalidated.
// The five boards that predate this one all take PuzzleComponentProps<T> on the parameter, and the
// registry casts the result exactly as it casts theirs. A caller's props are checked either way,
// which is what makes the test's `dictionary={phrazleDictionary}` a real compile-time exercise of
// the sixth prop.
export const PhrazleBoard = ({
  dictionary,
  onProgress,
  onReset,
  onSolved,
  progress,
  puzzle,
}: PuzzleComponentProps<PhrazleData>): React.ReactNode => {
  const { answer } = puzzle.data

  // THE ONE VALUE STILL READ OFF THE PACK, and it is guarded here because the worst case latches:
  // the shell persists progress before this renders, so a throw during render throws at mount
  // forever afterwards and nothing self-heals, because the pack is valid and no code validates a
  // progress string. Nothing is invented either -- no rule is authored to paper over missing data.
  // The board simply draws no rows and says so (§8.10).
  //
  // ONE CLAUSE WHERE THERE WERE TWO. The second read `maxGuesses` and asked whether it was an
  // integer in [1, 12]; the field is gone, so the answer is the whole of what can be missing. A
  // board with no answer has nothing to draw and nothing to mark against, which §8.10 calls
  // "Grid: nothing".
  const answerWords = splitPhrase(typeof answer === 'string' ? answer : '')
  const drawable = answerWords.length > 0

  // The canonical phrase, re-joined from the SAME splitter the guess goes through, so the copy can
  // never show a stray double space the pack happened to ship.
  const phrase = answerWords.join(' ')
  const lengths = answerWords.map((word) => word.length)
  const total = lengths.reduce((sum, length) => sum + length, 0)
  // Where each word starts in the phrase's letters, so a typed run can be cut into words and a
  // caret position can be named as a word and a letter without a loop that mutates as it goes.
  const offsets = lengths.map((_unused, index) => lengths.slice(0, index).reduce((sum, length) => sum + length, 0))
  const wordList = dictionary ?? EMPTY

  const [guesses, setGuesses] = useState<string[]>(() => decode(progress, phrase).guesses)
  const [typed, setTyped] = useState('')
  const [message, setMessage] = useState({ nonce: 0, text: '' })
  // A WIDTH, not a box. The height went with the guess limit: a grid that grows cannot be sized to
  // fit a band, so it scrolls instead and the tiles hold their size.
  const [width, setWidth] = useState(DEFAULT_WIDTH)

  const plateRef = useRef<HTMLDivElement>(null)
  const composingRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const plate = plateRef.current
    if (plate === null || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => {
      // THE PLATE, AND ONLY THE PLATE. This used to observe the board section too, for a height the
      // tiles were sized against; that measurement is gone, and with it the reason the two boxes had
      // to be told apart. What is left is the simple half: the plate is the box the tiles are
      // actually laid out inside, and the section would overstate the room by a gutter a side.
      //
      // MEASURING THE PLATE'S HEIGHT WAS NEVER AN OPTION and still is not, which is worth keeping
      // said: the plate's height grows with the grid inside it, so sizing tiles off it is circular
      // -- bigger tiles, taller plate, bigger tiles, to the ceiling on every board. Width has no
      // such loop, which is why width is the one that survived.
      const measured = plate.clientWidth
      // A hidden or not-yet-laid-out box reports zero, and honoring that collapses every tile.
      if (measured > 0) setWidth(measured)
    })
    observer.observe(plate)
    return () => observer.disconnect()
  }, [])

  // DERIVED ON EVERY RENDER AND NEVER STORED. markGuess is pure and runs in microseconds over at
  // most 6 x 21 tiles, so caching buys nothing measurable and costs the one thing that matters: a
  // corrected marking rule RECOLORS every saved board instead of contradicting it. src/rules/ has no
  // cross-repo check and the rule is near-certain to be corrected at least once.
  //
  // decode is what makes this safe: markGuess THROWS by contract on a shape mismatch, and progress
  // comes out of localStorage.
  const marked = guesses.map((guess) => markGuess(splitPhrase(guess), answerWords))
  const solved = marked.some((words) => words.every((word) => word.every((tile) => tile === 'green')))
  // SOLVED IS THE ONLY WAY THIS BOARD ENDS. The second arm was `guesses.length >= rows`, the loss,
  // and it is gone rather than made unreachable -- there is no row count to reach. `over` and
  // `solved` are now the same fact under two names, and both names stay: `solved` is what the shell
  // is told, and `over` is what every keyboard path asks before refusing input. Collapsing them into
  // one identifier would make the day this board grows a second ending a rename of every call site.
  const over = drawable && solved
  // THE GRID'S HEIGHT, AND IT IS DERIVED RATHER THAN FIXED. Every guess made, plus the one being
  // composed -- so committing a guess adds exactly one row, and a fresh board draws exactly one. A
  // solved board draws no composing row, because there is nothing left to compose into it.
  //
  // An undrawable pack draws nothing at all, which is §8.10's "Grid: nothing" -- and it is `0`
  // rather than `1` deliberately: a lone composing row of no tiles is a board inviting a guess it
  // has no answer to mark.
  const rows = drawable ? guesses.length + (over ? 0 : 1) : 0

  // Initialized with the MOUNT-TIME value, so a board restored into a win does not report a solve
  // the shell already recorded. Every later transition does report, because Again makes the board
  // playable again.
  const reported = useRef(solved)
  useEffect(() => {
    if (solved && !reported.current) onSolved()
    reported.current = solved
  }, [onSolved, solved])

  // KEYED TO guesses.length, NOT TO typed. Scrolling on every keystroke would fight a player who has
  // scrolled up to re-read row 1 while typing row 4, which is exactly the thing this bench asks
  // people to do. Once at mount and once per commit is the whole of it.
  //
  // `nearest` rather than `center`, so on a viewport where everything fits it does nothing at all.
  // This is the guess bench's version of goFigure's non-negotiable: the two rows a player is
  // comparing are the one being typed and the one just marked, and they are adjacent, so keeping the
  // bottom of the grid in view keeps both.
  //
  // THE REF IS OPTIONAL AND THE METHOD IS NOT. `composingRef.current` is null on a finished board
  // and on an undrawable pack -- both draw no composing row, so there is nothing to keep in view --
  // and both arms are exercised by the suite. The call itself is written plainly: a `?.()` there
  // would make a real browser losing this method silent, and the honest failure is a loud one.
  //
  // jsdom implements no scrolling at all, so `Element.prototype.scrollIntoView` does not exist and
  // this board's suite installs it in a beforeAll and removes it in an afterAll. It is the only
  // suite that mounts this component: puzzle-frame's mocks `entryFor` and mounts a recorder.
  useEffect(() => {
    composingRef.current?.scrollIntoView({ block: 'nearest' })
  }, [guesses.length])

  const say = (text: string): void => setMessage((previous) => ({ nonce: previous.nonce + 1, text }))
  // Clears the band WITHOUT announcing. FloorBar renders nothing at all for '', so the live region
  // goes back to empty and the next message is an announcement rather than a re-read. The nonce is
  // carried rather than bumped, because nothing was said.
  const hush = (): void => setMessage((previous) => ({ nonce: previous.nonce, text: '' }))

  const wordsOf = (letters: string): string[] =>
    lengths.map((length, index) => letters.slice(offsets[index], offsets[index] + length))

  // The state a letter key reports, and the only per-keystroke feedback a screen reader gets.
  // Nothing is drawn under the letter -- there is no per-key annotation to draw, unlike the cipher
  // bench's `= V` -- so the pad stays one row of type at 320 and the position lives in the name.
  //
  // An undrawable pack yields '', so the key is named by its letter alone. That is deliberate rather
  // than a fourth sentence: `the row is full` is true of a board with no row and says the wrong
  // thing, and inventing a fourth form would put copy on the bench that §7.4 does not have.
  const noteForKey = (): string => {
    if (!drawable) return ''
    if (over) return 'this board is finished'
    if (typed.length >= total) return 'the row is full'
    const word = lengths.findIndex((length, index) => typed.length < offsets[index] + length)
    return `fills word ${word + 1} letter ${typed.length - offsets[word] + 1}`
  }

  const press = (letter: string): void => {
    if (!drawable) {
      say(INCOMPLETE)
      return
    }
    if (over) {
      say(FINISHED)
      return
    }
    // A full row answers nothing, and it owes nothing: the key names already say `the row is full`
    // and the ribbon said it once at the threshold. Saying it again on every further keystroke is a
    // live region firing for a key that changed nothing.
    if (typed.length >= total) return

    const next = `${typed}${letter}`
    setTyped(next)
    // THE ONE THRESHOLD THAT BREAKS THE SILENCE, because it changes what Guess will do.
    if (next.length === total) {
      say(ROW_FULL)
      return
    }
    hush()
  }

  const erase = (): void => {
    if (!drawable) {
      say(INCOMPLETE)
      return
    }
    if (over) {
      say(FINISHED)
      return
    }
    setTyped(typed.slice(0, -1))
    // Emptying a full row says nothing: the pad key names go back to naming a position, which is the
    // same information without an announcement.
    hush()
  }

  const commit = (): void => {
    if (!drawable) {
      say(INCOMPLETE)
      return
    }
    if (over) {
      say(FINISHED)
      return
    }
    if (typed.length < total) {
      // No attempt spent, and nothing claims one was: onProgress is not called and the sign row's
      // count does not move.
      say(FILL_FIRST)
      return
    }

    const words = wordsOf(typed)
    // isValidGuess is THE GATE and returns a boolean, so the offenders are found with the same
    // exported function rather than with a second rule the board wrote. On a full row every other
    // clause holds by construction -- the count and the per-word lengths are the grid's own, and
    // every character came off a pad key or the A-Z branch below -- so the dictionary clause is the
    // only one that can fail and `offenders` is never empty here.
    const offenders = words.filter((word) => !everyWordInDictionary([word], wordList))
    if (!isValidGuess(words, lengths, wordList)) {
      // The FIRST offender, never all of them: a player is going to fix one word and press again,
      // and a list read into a live region is a list read for nothing.
      say(NOT_IN_LIST(offenders[0]))
      return
    }

    const next = [...guesses, words.join(' ')]
    setGuesses(next)
    setTyped('')
    onProgress(encode(next))

    const tiles = markGuess(words, answerWords)
    if (tiles.every((word) => word.every((tile) => tile === 'green'))) {
      say(`Solved. The answer is ${phrase}.`)
      return
    }
    // NO LOSS BRANCH, because there is no loss. This is where `Out of guesses. The answer is X.`
    // was said, and the product's only ending is now the one above it.

    // HEAD-FIRST, because the ribbon clamps to two lines and keeps its head: what survives visually
    // is the guess itself, and what is clamped away is the per-letter tail a sighted player is
    // reading off the grid. The whole string stays in the DOM, so the live region announces it
    // entire. Word groups are separated by a full stop so a screen reader pauses at the word
    // boundary -- which is the boundary the purple state is about.
    //
    // THE HEAD USED TO CARRY A COUNT -- `4 guesses left` -- and it is gone rather than reworded.
    // There is no number to put there: `guess 7` is the sign row's job and saying it twice makes the
    // ribbon a counter, and every phrasing of "unlimited" is a sentence announcing a rule instead of
    // a result. What a player needs after a guess is the marking, and that is what is left.
    const tail = tiles
      .map((word, index) => `${word.map((tile, at) => `${words[index][at]} ${PHRASE[tile]}`).join(', ')}.`)
      .join(' ')
    say(`${words.join(' ')}. ${tail}`)
  }

  const again = (): void => {
    setGuesses([])
    setTyped('')
    hush()
    // A LIFECYCLE SIGNAL, not game state: onReset says "the player started this puzzle over" and
    // takes no argument and names no destination, so deleting lull:hints:<puzzleId> and resetting
    // the hint bar stay entirely the shell's business. It is needed because an empty progress string
    // cannot carry that meaning on its own.
    onProgress('')
    onReset?.()
  }

  // THE SHEET IS THE SHELL'S AND IT LIES OVER THIS BOARD, which is why a board that renders no hint
  // bar still has to ask whether one is open. PuzzleFrame draws HintBar between the two elements
  // this component returns and the sheet is drawn over the grid, so a keyboard player who opens a
  // hint to check a row and Tabs once is standing on a `<section aria-label="Open hints">` that
  // carries tabIndex={0} precisely so it can be scrolled -- and every keystroke made there still
  // reached this handler. Enter spent one of six attempts on a row the player could not see, and
  // THIS BENCH HAS NO UNDO BY DESIGN: a committed guess is permanent, that is the game, so the loss
  // was irreversible. Letters and Backspace edited the hidden row the same way.
  //
  // IT FOLLOWS `aria-controls` TO THE SHEET, exactly as gofigure/index.tsx does, and reads the
  // answer off the DOM rather than through a prop or a mirrored boolean. What HintBar PUBLISHES --
  // the control's `aria-controls`, and the `hidden` attribute on the element it names -- is the same
  // fact a screen reader is told, so a bench that reads it can never disagree with what the player
  // is hearing, and it cannot go stale on a path that shuts the sheet without saying so (Escape and
  // the sheet's own Hide are both such paths).
  //
  // THE ONE DEPARTURE FROM goFigure'S IS THE ROOT: that bench draws the bar inside its own
  // instrument and scopes the lookup to it, and this board draws no bar at all, so there is nothing
  // narrower to ask than the document. The board's own markup cannot answer it -- this component
  // builds no id and no IDREF, which its suite asserts -- and the hint sheet's is the only
  // `aria-controls` in the app.
  const sheetIsOpen = (): boolean => {
    const id = document.querySelector('[aria-expanded][aria-controls]')?.getAttribute('aria-controls')
    // `hidden` is what HintBar toggles, so its ABSENCE is the sheet being up. Written this way round
    // rather than as `!hasAttribute` so that a missing element -- an id pointing nowhere, which is a
    // broken bar rather than an open sheet -- reads as shut and leaves the board playable.
    const sheet = id === undefined || id === null ? null : document.getElementById(id)
    return sheet !== null && !sheet.hasAttribute('hidden')
  }

  // ON THE WINDOW, not on the board, and that is what makes this bench playable from a hardware
  // keyboard: every pad key deliberately KEEPS focus when pressed, so a listener on the board's own
  // section would stop receiving keystrokes the moment the player tapped a key.
  //
  // No dependency array on purpose. The handler closes over `typed` and `guesses`, both of which
  // change on nearly every press, so any array short of "everything" would leave a stale closure
  // typing into a board that has moved on.
  const onKeyDown = (event: KeyboardEvent): void => {
    // A modified keypress belongs to the browser. Without this, Cmd-R and every other shortcut is
    // both swallowed by preventDefault below and read as a letter.
    if (event.altKey || event.ctrlKey || event.metaKey) return

    const target = event.target as HTMLElement | null
    // Somewhere the player is composing text owns its own keystrokes. There is no such field on this
    // bench, so this guards a future one -- but the listener is on the WINDOW, and a listener with
    // that reach has to say what it declines to touch.
    if (target !== null && (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName))) return

    // RULE 3, AND IT IS NOT A FOOTNOTE ON THIS BENCH. A <button> acts on Enter natively, and the
    // hint sheet's `Hide` and all 28 pad keys are in reach. Without this, pressing `Hide` with the
    // keyboard would both close the sheet and spend a guess.
    //
    // IT COVERS ELEMENTS THAT ACT ON ENTER THEMSELVES, and nothing else. This comment used to list
    // the sheet itself among them, which was a claim about coverage the tag test does not have: the
    // sheet is a <section>, it acts on nothing, and it holds focus precisely so it can be scrolled
    // -- so Enter pressed there fell straight through to `commit` and spent a guess on a row the
    // sheet was covering. What answers for the sheet is the guard below, which asks whether it is
    // OPEN rather than what the focused element is called.
    //
    // The consequence is that a focused pad key does what it says on its face: pressing Enter after
    // tapping T, O, E types a fourth letter rather than committing. That is correct and stays --
    // native activation is what a <button> owes the keyboard -- so the promise is stated exactly:
    // ENTER COMMITS FROM <body>, and a focused pad key activates itself.
    //
    // Space is NOT in this guard, and its absence is deliberate rather than an omission: this bench
    // takes no Space action at all, so there is nothing for a Space clause to decline and an
    // unreachable arm of a condition is worse than no arm.
    if (event.key === 'Enter' && target !== null && /^(A|BUTTON)$/.test(target.tagName)) return

    // AND IT IS ASKED AFTER RULE 3, never before: with the sheet up and focus on its Hide control,
    // Enter is the player closing the sheet, and answering that press with a sentence telling them
    // to close the sheet would refuse the exit while they are taking it.
    //
    // ONE CLAUSE RATHER THAN THREE, because every key this bench takes is a writing key: Enter,
    // Backspace and a letter all change a row the sheet is covering. goFigure splits its version
    // because half of its keys are arrows, which the sheet needs for scrolling and which it
    // therefore declines in SILENCE. This bench takes no arrow and no Space at all, so there is
    // nothing here to hand the sheet and nothing to decline without saying why.
    if ((event.key === 'Enter' || event.key === 'Backspace' || /^[A-Za-z]$/.test(event.key)) && sheetIsOpen()) {
      event.preventDefault()
      say(HIDE_TO_TYPE)
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      commit()
      return
    }
    // The text-field convention, and the same function the pad's Delete key runs -- one handler, so
    // the two inputs cannot answer the same board differently.
    if (event.key === 'Backspace') {
      event.preventDefault()
      erase()
      return
    }
    if (/^[A-Za-z]$/.test(event.key)) {
      event.preventDefault()
      press(event.key.toUpperCase())
    }
  }

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const tile = tileSize(width, lengths)
  const letter = Math.round(tile * 0.58)
  const bar = Math.round(tile * 0.6)

  // The row the player is looking at: the one being composed, or -- once the board is solved -- the
  // last one spent. The finished branch is what stops a solved board advancing to a row that will
  // never be composed.
  //
  // IT IS `rows` ITSELF, which is the same arithmetic the grid is built from rather than a second
  // copy of it. A count that could disagree with the number of rows on screen is the one thing this
  // number must not be, and the previous version -- `over ? guesses.length : guesses.length + 1` --
  // was exactly that copy, written out again a few lines below where the grid derived it.
  const spent = rows

  // What the band says at rest, outside the live region, so a RESTORED board says it without an
  // announcement it never earned.
  //
  // TWO ARMS WHERE THERE WERE THREE. The `Out of guesses` arm is gone: a board that has not been
  // solved is a board still being played, whatever its row count, so there is nothing to say at rest
  // and the band stays empty.
  const restingLine = (): string => {
    if (!drawable) return INCOMPLETE
    if (solved) return `Solved. The answer is ${phrase}.`
    return ''
  }

  const composed = wordsOf(typed).join(' ')
  const announced = message.text === '' ? '' : `${message.text}${REPEAT_MARK.repeat(message.nonce % 2)}`

  return (
    // Exactly two elements, and they are siblings: the frame wraps them in `display: contents` and
    // index.css orders one into the board band and the other into the floor, with the shell's hint
    // bar between them. Neither knows the other is there.
    <>
      {/* A <section> with a name is a landmark, which is what lets the shell and the page find the
          board without either reaching into it. The name is the TYPE, because a reader moving by
          landmark is choosing a band and not reading content.

          This band's geometry belongs to index.css -- it is the ONE band that flexes and the seam
          depends on that -- so nothing here sets flex, height or vertical scrolling. It does not set
          overflow-x either, and that is a change from the cipher bench rather than an oversight: a
          board may not restyle the shell's geometry, and clamping the container from inside would
          hide a wide grid rather than remove it. The guarantee instead is that nothing is ever wider
          than the container -- the word groups below are a flex-wrap row, so the widest phrase the
          corpus can produce wraps rather than extending.

          tabIndex={0} SO A KEYBOARD PLAYER CAN SCROLL IT, which is HintBar's sheet verbatim and for
          the identical reason. Nothing inside this band is focusable -- a tile is role="img" with no
          handler, deliberately, because 126 buttons is 126 tab stops for elements nothing can do
          anything with -- and the pad lives in the floor, in the other element this component
          returns. A scrollable region with no focusable content inside it and no tabIndex of its own
          cannot be scrolled from a keyboard at all.

          IT BECAME NECESSARY WHEN THE GRID STARTED GROWING. This band could always scroll in
          principle (§8.11's three-by-seven phrase at 320 floors its tiles and overflows), but that
          was one dense phrase at one width; a board with no guess limit scrolls in every long game.
          The composing row is kept in view by the effect above, so a player can always see what they
          are typing -- what they could not otherwise do is scroll BACK to re-read guess 1 while
          typing guess 12, which is the exact thing that effect's own comment says this bench asks
          people to do.

          ONE TAB STOP, and it lands here first because this element is first. It is named already,
          so a screen reader announces the landmark rather than an unlabeled box. */}
      <section aria-label="Phrazle" className="lull-board flex flex-col" tabIndex={0}>
        {/* Sticky, because the count is the one number a player checks constantly and the grid is
            the one band that scrolls. Phrazle ships no category, ever, so the left slot is genuinely
            empty and `ms-auto` handles it -- the same code path the cipher bench's hidden-category
            difficulties take. */}
        {/* `Guess 7`, never `Guess 7 of N`. There is no N: the board grows a row whenever the
            player needs one, so an "of" would have to name either a limit that does not exist or the
            row count the player can already see, which counts nothing. What is left is the one
            number that still means something -- how many attempts this phrase has taken. */}
        <p className={SIGN_ROW}>{drawable && <span className="ms-auto shrink-0">{`Guess ${spent}`}</span>}</p>

        <div className={PLATE} ref={plateRef}>
          {/* SIBLINGS of the live region and in another band entirely, never inside it: text present
              at mount inside a live region is announced by nothing and clutters every later message.
              Both stay for the whole session, because the two things nobody can guess about this
              bench are that every word must be a real word of exactly that length and that a letter
              can be marked for ANOTHER word. */}
          <p className="text-[12.5px] leading-[1.45] text-[var(--lull-muted)]">{INSTRUCTION}</p>
          <p className="mt-[var(--lull-s2)] mb-[var(--lull-s4)] flex flex-wrap items-center gap-x-[var(--lull-s3)] gap-y-[var(--lull-s1)] text-[12.5px] leading-[1.45] text-[var(--lull-muted)]">
            {LEGEND.map(([state, label]) => (
              <span className="inline-flex items-center gap-[6px]" key={state}>
                <Bar state={state} width={18} />
                {label}
              </span>
            ))}
          </p>

          {/* EVERY ROW HERE IS EITHER SPENT OR BEING TYPED INTO, and that is what changed when the
              grid started growing. It used to draw `maxGuesses` rows from the first paint, so most
              of a fresh board was FUTURE rows -- named `not yet made`, filled with tiles drawn and
              then hidden from the accessibility tree so a screen reader was not read thirty-five
              stops called `Empty`. There are no future rows to hide now: `rows` is the guesses made
              plus the one being composed, so all three of those branches were unreachable and are
              gone rather than left to be reasoned about. */}
          <div aria-label="Guesses" className="flex flex-col" role="group" style={{ gap: `${ROW_GAP}px` }}>
            {Array.from({ length: rows }, (_unused, index) => index).map((index) => {
              const done = index < guesses.length
              const isComposing = !over && index === guesses.length
              const letters = done ? guesses[index].replace(/ /g, '') : typed

              return (
                <div
                  // Absent on every other row, never "false": there is no
                  // this-is-not-the-current-row state worth saying on every row above.
                  aria-current={isComposing ? 'true' : undefined}
                  // `Guess 3`, matching the sign row, for the same reason: there is no total to be
                  // three of.
                  aria-label={isComposing ? `Your guess, ${composed}` : `Guess ${index + 1}, ${guesses[index]}`}
                  className="flex flex-wrap"
                  key={index}
                  // The one row worth keeping in view, so the effect above has something to point
                  // at. Undefined on every other row: React would otherwise call a cleanup callback
                  // with null for every spent row on every render and leave the ref holding whichever
                  // row rendered last.
                  ref={isComposing ? composingRef : undefined}
                  role="group"
                  style={{ columnGap: `${WORD_GAP}px`, rowGap: `${ROW_GAP}px` }}
                >
                  {/* WORDS NEVER BREAK: word shape is a solving cue and a broken word reads as two
                      words. The row wraps BETWEEN words instead, identically on every row because
                      every row has identical word lengths, and the grid gets taller and scrolls. */}
                  {wordsOf(letters).map((word, wordIndex) => (
                    <div className="flex" key={wordIndex} style={{ gap: `${LETTER_GAP}px` }}>
                      {Array.from({ length: lengths[wordIndex] }, (_unused, at) => at).map((at) => {
                        const state = done ? marked[index][wordIndex][at] : undefined
                        const shown = word[at] ?? ''

                        // role="img" WITH A NAME. A tile is not a control and must not be a button --
                        // that would put 126 stops in the tab order for elements nothing can do
                        // anything with. It is not plain text either: the visible letter alone would
                        // announce `H` and lose the mark, and the mark IS the information. `img` with
                        // a name is the standard way to say "this graphic means this sentence", and
                        // it makes the tile one stop for a screen reader working the row rather than
                        // two.
                        return (
                          <span
                            aria-label={tileName(shown, state)}
                            className={`${TILE} ${state === undefined ? COMPOSING : FILL[state]}`}
                            key={at}
                            role="img"
                            style={{ height: `${tile}px`, width: `${tile}px` }}
                          >
                            <span aria-hidden="true" style={{ fontSize: `${letter}px` }}>
                              {shown}
                            </span>
                            {state !== undefined && <Bar state={state} width={bar} />}
                          </span>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* FloorBar takes no className, and CSS cannot move a box into another parent -- so the band
          class goes on a wrapper around it rather than on the bar itself. */}
      <div className="lull-instrument">
        <FloorBar message={announced} resting={restingLine()}>
          {/* 7x4, full bleed, no horizontal padding: at 320 the keys are 44.86 wide and 44 tall,
              which is 2.5.5's target size on the control this board is tapped on most. The 1px gaps
              are the gridlines. 4 rows of 44 and 3 gaps of 1 is 179, the instrument's whole budget. */}
          {/* THE NAME FOLLOWS THE KEY. One key is swapped in place when the board is over, so a
              group still promising a `Guess` button would send a screen-reader user navigating by
              group to look for a control that is not in it -- the group holds `Play again` by then.
              The two names use the keys' own accessible names, not their visible labels, so the
              group and the button it names cannot come apart. */}
          <div
            aria-label={over ? 'Letters, Play again and Delete' : 'Letters, Guess and Delete'}
            className="grid shrink-0 grid-cols-7 gap-px bg-[var(--lull-floor-rule)]"
            role="group"
          >
            {ALPHABET.map((plain) => (
              <button
                aria-label={noteForKey() === '' ? plain : `${plain}, ${noteForKey()}`}
                className={KEY}
                key={plain}
                onClick={() => press(plain)}
                type="button"
              >
                <span aria-hidden="true" className={KEY_LETTER}>
                  {plain}
                </span>
              </button>
            ))}
            {/* ONE KEY SWAPPED IN PLACE, never a pad replaced. 28 keys vanishing under a keyboard
                player's focus drops focus to <body> and restarts the next Tab at the top of the
                page, and a pad left inert reads as 28 broken keys. Swapping in place keeps the same
                DOM element, so focus is never lost, the rectangle stays 7x4, and nothing reflows.
                `Play again` does not fit a 44.86px key: the visible label is `Again` and the
                accessible name is `Play again`, which satisfies 2.5.3 because the visible label is
                contained in the name -- the same trick HintBar uses for `Hint 1 of 3`. */}
            <button
              aria-label={over ? 'Play again' : undefined}
              className={`${KEY} ${KEY_UTILITY}`}
              onClick={over ? again : commit}
              type="button"
            >
              {over ? 'Again' : 'Guess'}
            </button>
            {/* Delete, and it IS Backspace -- the same `erase`, reached by a key on the pad instead
                of a key on a hardware keyboard. There is no Undo on this bench: a committed guess is
                permanent, that is the game, and an Undo here would be a rule this app authored. */}
            <button className={`${KEY} ${KEY_UTILITY}`} onClick={erase} type="button">
              Delete
            </button>
          </div>
        </FloorBar>
      </div>
    </>
  )
}
