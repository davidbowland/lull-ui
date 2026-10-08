import { everyWordInDictionary, isValidGuess, splitPhrase } from '@rules/is-valid-guess'
import { markGuess, TileState } from '@rules/mark-guess'
import React, { useEffect, useRef, useState } from 'react'

import { DEFAULT_WIDTH, GUESS_GAP, LETTER_GAP, tileSize, WORD_GAP, WRAP_GAP } from './layout'
import { decode, encode } from './progress'
import type { PhrazleSpentRung } from './rungs'
import { FloorBar } from '@components/floor-bar'
import { Keypad } from '@components/keypad'
import { PhrazleData, PuzzleComponentProps } from '@types'

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
// is kept. Never `not in the phrase`: markGuess's own fixture ships a gray H on a phrase that
// CONTAINS an H, because the phrase's one H was already spent by a green, so a membership claim on
// a TILE is a lie the player can disprove by looking. (A KEY may say it, and the reason the same
// sentence is true there and false here is worked out at KEY_PHRASE below.)
//
// `no more of this letter`, and it replaced `no copy left`. The old wording was the marking rule's
// own vocabulary -- markGuess keeps a ledger and debits a COPY per colored tile -- read straight
// out of the rule and onto the board. It is exactly right and it is jargon: nothing on screen ever
// mentions copies or a ledger, so a player met the word cold, in the one state that is hardest to
// reason about anyway, and had to reverse-engineer an accounting metaphor to reach "this letter
// cannot help me". The replacement says the same thing in words the board has already used.
//
// The same four phrases serve the tile names and the ribbon, so the board says one thing in one
// voice, and the vendored TileState literals are the keys -- no second vocabulary, no translation
// layer that can drift from the rule.
const PHRASE: Record<TileState, string> = {
  gray: 'no more of this letter',
  green: 'in place',
  purple: 'in another word',
  yellow: 'elsewhere in this word',
}

// WHAT A KEY KNOWS, and it is deliberately THREE states against the tiles' four rather than a
// summary of them.
//
// A tile is inside a word and a key is not, so half the tile vocabulary cannot be spoken here: a
// key reading `elsewhere in this word` names a word it is not in, and `in place` claims a position
// it does not have. What survives the move off the grid is the one question a keyboard is actually
// scanned for -- is this letter worth pressing again -- so green, yellow and purple collapse into
// `in the phrase` and only gray is left to answer no.
//
// AND A KEY MAY SAY `not in the phrase` THOUGH A TILE MAY NOT. That is not the membership claim
// PHRASE above forbids; it is a claim about EVERY marking a letter has ever received, and it holds
// on markGuess's own passes. Take a letter the phrase contains and a guess containing it: pass 1
// gives a green to any position that matches, pass 2 drains that word's unspent copies into
// yellows, and pass 3 drains the phrase's into purples -- so a tile only falls through to gray once
// no unspent copy is left anywhere, which means some earlier tile of that same letter, in that same
// guess, took one and is not gray. A letter in the phrase therefore cannot be gray on every tile of
// any guess it appears in, and a letter that IS gray everywhere is a letter the phrase does not
// have. The tile's claim is about one position and is false; the key's is about the whole record
// and is a theorem.
//
// A BOUGHT RUNG IS THE SECOND SOURCE, and it needs no theorem at all. `choosePhrazleRung` draws its
// absent letters from the ones the phrase does not contain and its other two kinds from the ones it
// does, both read straight off the answer -- so a rung states what the argument above has to prove.
// The two sources therefore cannot disagree, and both spell their verdict with these two phrases.
const KEY_PHRASE = { absent: 'not in the phrase', present: 'in the phrase' } as const

type KeyStatus = keyof typeof KEY_PHRASE | 'untried'

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
// player is typing look exactly like a row of `no more of this letter` verdicts. The composing tile takes the
// RAISED surface with a `rule` border and full ink -- the same three tokens the cipher bench's
// square takes, all three of which contrast.test.ts already holds -- so the live row reads as the
// nearest thing on the board and the future rows stay flat plate behind it.
const COMPOSING = 'border border-[var(--lull-rule)] bg-[var(--lull-raised)] text-[var(--lull-ink)]'

// THE EXTENT OF THE MARK, and it is the same tile with one token swapped: `rule` becomes `accent` on
// the border and nothing else moves. Ground, border width and radius are COMPOSING's, so a rejected
// word costs no reflow, invents no fifth tile type, and cannot be mistaken for a marked tile -- the
// four verdicts all carry a fill and a bar, and this carries neither.
//
// THE CHIP IS THE MARK; THIS BORDER IS REDUNDANCY, and the order matters because the obvious reading
// is the other way round. `accent` against `rule` is 1.674:1 in light and 2.155:1 in dark -- a
// near-luminance-identical hue swap on a 1px edge, which is precisely the failure colors.ts:112-115
// names for tileGreen against tileYellow. So this channel is not the non-color channel and must
// never be relied on as one: it is what makes a word already carrying a chip read as a whole word
// rather than as a tile with a badge on it. NotAWord is the channel that survives a color vision
// deficiency, and it survives it by being a shape.
//
// AN ACCENT EDGE ON AN `r-sm` CELL ALREADY MEANS SOMETHING ELSE IN THIS APP, and the tally is worth
// getting right because a vaguer version of it reads as a smaller problem than it is. Two of them
// are BORDERS like this one -- cryptogram/index.tsx:162 for the selected square (which also spends
// accent on hover) and gofigure/index.tsx:261 for a hint-locked cell -- and two more are `inset-ring-2`
// rather than a border, drawn for the caret on each of those benches (cryptogram/index.tsx:187,
// gofigure/index.tsx:255). So this is a FIFTH sense of accent on a cell and a THIRD drawn as a
// border: REJECTED. It is accepted rather than overlooked, on three grounds. Phrazle
// has no caret and no current-word affordance for it to be confused with; the three benches never
// render together, so no player meets two senses on one screen; and within this bench the chip
// disambiguates, because nothing else on the board draws one.
//
// IT IS RECORDED SO THE NEXT EDIT IS NOT FREE. A future "current word" affordance on THIS board
// cannot use this channel, because a board with both would be spelling two different facts in one
// mark and the chip would be doing all the work for both.
const COMPOSING_REJECTED = 'border border-[var(--lull-accent)] bg-[var(--lull-raised)] text-[var(--lull-ink)]'

// `Press Guess to mark it`, not `to have it marked`. The passive named no actor and the sentence
// beside it is an imperative, so one line asked the player to do something and the next described
// something happening to them.
const INSTRUCTION = 'Each word must be a real word of that length. Press Guess to mark it.'
// Drawn with the ACTUAL bar segments the tiles use, so the key is the mark rather than a description
// of it. Ordered home, this word, another word, nowhere -- the order the states run in, which is the
// order the segment count counts in.
//
// SENTENCE CASE ON ALL FOUR, including the last, which once read `no bar, no copy left` beside
// three capitalized siblings -- the spec's wording quoted verbatim into a list that did not exist
// when the spec was written. A list of four items reading three one way and one another is a typo
// to every reader who is not holding the spec.
//
// THE WORDING IS PHRASE.gray's, still, and that is the rule this entry lives under rather than the
// capital: the gray tile's accessible name and this label have to be the same sentence, so a player
// who reads the key and a player who hears the tile learn one thing. `no copy left` is what it used
// to be and the reason for the change is at PHRASE. The `No bar` prefix stays, because the gray
// entry is the one whose mark is the ABSENCE of a mark and there is nothing beside the label to
// look at.
const LEGEND: [TileState, string][] = [
  ['green', 'In place'],
  ['yellow', 'Elsewhere in this word'],
  ['purple', 'In another word'],
  ['gray', 'No bar, no more of this letter'],
]

// `Every tile is full`, not `Row full`. The board counts GUESSES everywhere a player can read a
// number -- the sign row says `Guess 2`, every spent row is named `Guess 1` -- so `row` was a third
// noun for a thing already called two others, and a player who had just filled the last square was
// told about a row they had never been told they were filling. `tile` is the word the sentence
// below it already uses, and the shape matches the cipher bench's `Every square is full.`
const ROW_FULL = 'Every tile is full. Press Guess.'
const FILL_FIRST = 'Fill every tile first.'
const NOT_IN_LIST = (word: string): string => `${word} isn’t in the word list. Change it and press Guess.`
// THE SAME REFUSAL WITHOUT THE IMPERATIVE, for the moment the row is still being typed. `Change it
// and press Guess` is advice about a button that does nothing yet: a row short of full is refused by
// the length check above, long before the dictionary is consulted, so mid-row the tail would name an
// action that cannot be taken. It appears exactly when it becomes actionable -- when the row fills,
// or when Guess is pressed -- and until then the sentence stops at the fact.
//
// ONE NOUN EVERYWHERE, AND IT IS `in the word list`. Never `isn't a word`: the list runs to about
// 52,000 entries and real English falls outside it, so a claim about English is one this board
// cannot support and a player holding a perfectly good word would be told they were wrong.
//
// A SECOND FUNCTION RATHER THAN A SLICE OF THE FIRST. Deriving one from the other -- splitting
// NOT_IN_LIST on its own full stop, say -- would make the two sentences one string with a seam
// inside it, and a seam is what an edit to either half breaks in silence.
const notInList = (word: string): string => `${word} isn’t in the word list.`
const FINISHED = 'This board is finished. Press Again to start over.'
// goFigure's sentence verbatim, because it is the same refusal for the same reason on another
// bench: a sheet is lying over the board and the keyboard is writing underneath it. A player who
// learns what it means on one bench meets the same words on this one. "Close" because that is the
// word on the sheet's own button; the scrim takes every pointer press while the sheet is up, so only
// a hardware keyboard ever reaches this.
const CLOSE_TO_TYPE = 'Close the hints to type.'
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

// THE THREE LETTER-KEY TONES, and no token in them is new: floorAccent-on-floor and
// floorMuted-on-floor are both already held by contrast.test.ts, and contrast is symmetric, so the
// filled key's `floor` ink on a `floorAccent` ground is the same 7.074:1 (light) and 8.780:1 (dark)
// pair read the other way round. The tile fills are deliberately NOT reused: colors.ts scopes them
// to the plate, and tileGreen on the light floor is 1.9:1 -- a fill nobody can see.
//
// COLOR IS NOT A CHANNEL ON ITS OWN HERE EITHER. `present` is a filled block against 25 unfilled
// ones and `absent` carries a strike through its letter, so the three states differ by ink, by
// ground, and by whether a mark is drawn -- and a player who sees no hue at all still sorts them.
//
// NOTHING IS EVER DISABLED. A ruled-out key stays a live control that types its letter: a player
// spelling a word that happens to contain a dead letter is doing something ordinary, and 26 keys
// that come and go under a thumb is a keyboard that cannot be learned.
//
// THE PRESSED LOOK KEYS OFF `data-down`, NEVER `:active`. The pad commits on release and lets a
// thumb slide to the neighboring key before lifting, and it reads a touch 6px above where it landed
// -- so the key that will type is often not the element the finger first touched. `:active` stays
// on that first element for the whole press and would light the wrong key; Keypad sets
// `data-down="true"` on the key the gesture currently resolves to, and only on that one.
//
// `[&:focus-visible:active]` beside it is the KEYBOARD's flash. Holding Space or Enter on a focused
// key sets `:active` and no `data-down`, so without it a keyboard press lit nothing. It cannot bring
// back the wrong-key light: a touch or a mouse press never matches `:focus-visible`.
const TONE: Record<KeyStatus, string> = {
  absent:
    'bg-[var(--lull-floor)] text-[var(--lull-floor-muted)] hover:text-[var(--lull-floor-ink)] ' +
    'data-[down=true]:bg-[var(--lull-floor-ink)] data-[down=true]:text-[var(--lull-floor)] [&:focus-visible:active]:bg-[var(--lull-floor-ink)] [&:focus-visible:active]:text-[var(--lull-floor)]',
  present:
    'bg-[var(--lull-floor-accent)] text-[var(--lull-floor)] hover:bg-[var(--lull-floor-ink)] data-[down=true]:bg-[var(--lull-floor-ink)] [&:focus-visible:active]:bg-[var(--lull-floor-ink)]',
  untried:
    'bg-[var(--lull-floor)] text-[var(--lull-floor-ink)] hover:text-[var(--lull-floor-accent)] ' +
    'data-[down=true]:bg-[var(--lull-floor-ink)] data-[down=true]:text-[var(--lull-floor)] [&:focus-visible:active]:bg-[var(--lull-floor-ink)] [&:focus-visible:active]:text-[var(--lull-floor)]',
}
// The two utility keys take no state -- Guess and Delete are not letters and are never ruled out --
// so they keep the accent ink they have always had, now as their only color source. Their press
// variant is `data-[down=true]:` for TONE's reason.
const TONE_UTILITY =
  'bg-[var(--lull-floor)] text-[var(--lull-floor-accent)] hover:text-[var(--lull-floor-ink)] ' +
  'data-[down=true]:bg-[var(--lull-floor-ink)] data-[down=true]:text-[var(--lull-floor)] [&:focus-visible:active]:bg-[var(--lull-floor-ink)] [&:focus-visible:active]:text-[var(--lull-floor)]'
// `relative` IS FOR THE CHIP AND IT SITS ON THE SHARED CLASS, which means it reaches committed tiles
// too. That is inert rather than sloppy: a tile's only descendants are a static letter span and
// Bar's flex span, neither of which is absolutely positioned, so a positioning context nothing
// positions against changes nothing at all. Scoping it to the composing tile would be a second tile
// class differing by one utility, and the two would drift.
const TILE =
  'relative flex shrink-0 flex-col items-center justify-center gap-[2px] rounded-[var(--lull-r-sm)] ' +
  'leading-none lull-sign'

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

// THE RULED-OUT MARK, and it is an ELEMENT for the same reason the segments above are: a
// `line-through` would put the whole non-color channel in a stylesheet, where nothing in this repo
// can assert it and jsdom lays nothing out. Drawn as a sibling of the letter, the mark is DOM and a
// test can count it.
//
// `currentColor` again, so it is whatever ink the key's tone set -- floorMuted at rest, floorInk
// under a pointer, floor while pressed -- and it can never be the one thing on the key that fails
// to change with it. It overhangs the letter by 3px a side, because a strike that stops at the
// glyph reads as an underline that has slipped.
//
// aria-hidden, because the key's accessible name already ends in `not in the phrase` and a screen
// reader must not hear the same verdict twice.
const Strike = (): React.ReactNode => (
  <span
    aria-hidden="true"
    className="absolute inset-x-[-3px] top-1/2 h-[1.5px] -translate-y-1/2 rounded-[1px] bg-current"
    data-struck=""
  />
)

// THE HAIRLINE BETWEEN ONE GUESS AND THE NEXT, drawn in `rule` rather than in `hair`. hair is
// documented as decorative and forbidden from carrying meaning, and this line carries the only
// thing on the board that says where one attempt ends: a sixteen-letter phrase wraps at 390, so
// without it two guesses are four evenly spaced lines. `rule` on plate is 3.836:1 in light and
// 3.644:1 in dark, both held by contrast.test.ts.
//
// AN ELEMENT RATHER THAN A BORDER, on the Bar's reasoning exactly: a `border-t` on the row below
// would be a promise no test in this repo can read. Counted by the suite as `rows - 1`.
const GuessRule = (): React.ReactNode => (
  <span aria-hidden="true" className="h-px w-full shrink-0 bg-[var(--lull-rule)]" data-guess-rule="" />
)

// THE NOT-IN-THE-WORD-LIST CHIP, drawn on the rejected word's FIRST tile and nowhere else, and an
// ELEMENT for the reason Bar, Strike and GuessRule are: style assertions are forbidden here and
// jsdom lays nothing out, so a channel that lives only in CSS is a promise nothing in this repo can
// defend. Drawn as `<span>` with a bare `data-*`, matching those three -- not `<i>`, which would be
// a fourth spelling of one convention.
//
// TWO PARTS, AND BOTH WERE RENDERED BEFORE BEING BELIEVED. The ✕ alone is a speck against a
// 292px-wide word; the accent outline alone marks a word without saying WHY it is marked. Together
// one says "this word" and the other says "wrong".
//
// THE GEOMETRY IS SET BY THE TWO GAPS THE CHIP MUST NOT INVADE, and the numbers are hard-coded px
// arrived at by rendering rather than by arithmetic. Nothing in the repo fails if they are tidied,
// which is exactly the case this comment convention exists for:
//
//   - WRAP_GAP IS THE BINDING CONSTRAINT, NOT GUESS_GAP. Words wrap onto their own lines INSIDE one
//     guess whenever they do not fit, which is the common case rather than an edge one: `SLIPPED
//     DISK` wraps at a 390 viewport, and layout.test.ts:107 pins the three-seven-letter phrase at a
//     39px tile with words 2 and 3 each taking a line of their own. The chip is offset 4px and rings
//     itself in another 1.25, so it reaches 5.25px above the tile and leaves 0.75px of WRAP_GAP's 6.
//     That 0.75 is the whole remaining margin and it is the number to check first if the chip, the
//     ring or WRAP_GAP is ever touched again. An earlier draft specified a 5.45px offset and a 1.5px
//     ring -- 6.95px into a 6px gap, which is a mark overlapping the tile on the line above, and that
//     is the same fault the rejected spellcheck wave lost on.
//   - THE CAP LINE, AND THE CLEARANCE IS COMPUTED AT ONE TILE SIZE RATHER THAN GUARANTEED AT ALL OF
//     THEM. All 26 capitals rasterized in the real Baskervville face at round(tile x 0.58) put ink
//     no higher than 14.75px down AT A 40px TILE, where the chip's inner edge is at 10px and clears
//     the tallest letter by 4.75px. See the limitation below for where that stops being true: the
//     glyph scales with the tile and the chip does not, so the two meet on the way down.
//   - HORIZONTALLY the chip reaches the same 5.25px into the 12px WORD_GAP on a word that is not the
//     first, leaving 6.75px. The rejected margin caret spent 7 of those 12, and the gap still reads
//     as a word boundary here for a reason that caret could not claim: the caret was a mark ABOUT the
//     gap, sitting in the middle of it, where this one hangs off a corner and reads as belonging to
//     the tile it overlaps.
//
// THE RING IS LOAD-BEARING AND IS NOT A HIGHLIGHT. Every tile of the rejected word is outlined in
// accent as well, so a bare accent chip has its own edge fuse with that border -- worst in light,
// where both are the same dark madder. It is drawn in `--lull-plate` because that is the surface
// OUTSIDE the tile; inside the tile the chip overlaps `--lull-raised` instead, and the two grounds
// differ by about 1.1:1, so one ring color reads as one surface across the boundary either way.
//
// KNOWN LIMITATION, STATED RATHER THAN SOLVED, AND IT IS REACHED BEFORE THE FLOOR IS. The chip is a
// fixed 14px and the glyph is round(tile x 0.58), so the cap line climbs toward the chip as the tile
// shrinks. Working the cap ratio above back out -- ink starts 0.272em above the tile's center, which
// is about 0.368 x tile -- the chip's 10px bottom edge meets the tallest capital at roughly a 27px
// tile, and its 1.25px ring meets it at roughly 30px.
//
// THE 2px MOVE THAT PUT THE OFFSET AT 4 BOUGHT THAT, and it is the trade this geometry now sits on:
// the chip clears the capitals at every tile size the corpus reaches, and pays for it with the wrap
// gap. At a 320 viewport the plate holds 288, which sizes an eight-letter word at 34 and a
// nine-letter word at 30 -- so the ring grazes the first capital at nine letters and the chip itself
// no longer laps onto it anywhere. Nine letters is not a malformed pack: layout.test.ts measures the
// overflow fix on a nine-letter word.
//
// IT IS ACCEPTED AT A GRAZE AND WOULD NOT BE AT MORE. The overlap is a pixel of ring on the shoulder
// of one capital on the smallest phones, and the letter stays legible; the alternative is sizing the
// chip off `tile` the way `letter` and `bar` already are, which is one line and a render, and is a
// separate change rather than one made on spec. MIN_TILE (18px) is well past the graze and would put
// the chip over the tile's center, but layout.ts:87 records that floor as all but unreachable -- it
// takes a fifteen-letter word -- so the bound that actually matters is the 27px one above.
//
// aria-hidden on Bar's stated reasoning: the composing row's own accessible name already ends in
// `not in the word list`, and a screen reader must not meet the same verdict twice.
//
// NO MOTION AT ALL, deliberately. A mark that fades in is a mark you had to be watching to catch,
// and this one appears and disappears on keystrokes a player is making with their eyes on the pad.
// Nothing in this repo transitions border-color either, so the extent arrives at the same instant.
const NotAWord = (): React.ReactNode => (
  <span
    aria-hidden="true"
    className={
      'absolute top-[-4px] left-[-4px] flex h-[14px] w-[14px] items-center justify-center rounded-[3px] ' +
      'bg-[var(--lull-accent)] shadow-[0_0_0_1.25px_var(--lull-plate)]'
    }
    data-not-a-word-mark=""
  >
    {/* Two bars at right angles rather than a glyph: a text ✕ is a font's opinion at 7.5px, and the
        two arms are countable in the DOM where a character is not. */}
    <span className="relative block h-[7.5px] w-[7.5px]">
      <span
        className="absolute top-1/2 left-0 h-[2px] w-full -translate-y-1/2 rotate-45 rounded-[1px] bg-[var(--lull-on-accent)]"
        data-not-a-word-arm=""
      />
      <span
        className="absolute top-1/2 left-0 h-[2px] w-full -translate-y-1/2 -rotate-45 rounded-[1px] bg-[var(--lull-on-accent)]"
        data-not-a-word-arm=""
      />
    </span>
  </span>
)

// THE TWO FACTS EVERY KEY IS DRAWN FROM: the rungs the player has BOUGHT, and the markings the grid
// is already showing. No new rule is authored on either side -- choosePhrazleRung decides the rungs
// and markGuess decides the tiles, and this walks what they decided.
//
// A RUNG IS A VERDICT LIKE ANY OTHER, and that is the whole reason this function grew two arguments.
// Every rung this game sells is a statement about the alphabet -- which letters are wasted, which are
// in play -- so a bar that says "The phrase has no B, no G, and no P." while the pad goes on offering
// all three is telling the player something and then hiding it from the one place they are looking.
// The three tones are unchanged and there is no fourth: a rung-derived key is indistinguishable from
// a guess-derived one, because the key only ever promised "worth pressing again" and that is equally
// true from both sources.
//
// EVERY RUNG IS TRUE OF THE ANSWER, which is what makes the two sources safe to merge at all. The
// absent rung draws from letters the phrase does not contain and the other two from letters it does,
// so no rung can ever contradict a marking and the order these are folded in cannot change a verdict.
// They are seeded FIRST anyway, so the precedence below is the only precedence in the function.
//
// A WORD RUNG SAYS `in the phrase` AND NEVER `in place`. It alphabetizes its letters precisely so no
// position can be read off it, and a key has no position to claim in the first place -- see
// KEY_PHRASE. `?? ''` guards an index past the end of the phrase: `decode` refuses such a rung
// through `withinAnswer`, so nothing can reach here, and a throw during render is the one failure
// this board latches on.
//
// PRESENT WINS AND NEVER LOSES. A letter is gray in one guess and green in another all the time --
// type H twice when the phrase has one H and the second H is gray on the very board that proves the
// letter is in the phrase -- so `absent` is written only where nothing has claimed the letter yet,
// and any non-gray marking anywhere overwrites it for good. Reading the guesses in order with the
// two branches the other way round would report a live letter as ruled out.
const keyStatuses = (
  guesses: string[],
  marked: TileState[][][],
  hints: PhrazleSpentRung[],
  answerWords: string[],
): Record<string, KeyStatus> => {
  const statuses: Record<string, KeyStatus> = {}
  hints.forEach((rung) => {
    const letters = rung.kind === 'word' ? (answerWords[rung.index] ?? '') : rung.letters
    const status: KeyStatus = rung.kind === 'absent' ? 'absent' : 'present'
    for (const letter of letters) statuses[letter] = status
  })
  marked.forEach((words, index) => {
    // The guess's letters in the same order the marks come out in, which is what lets one flat walk
    // line them up. Both sides come from the same stored string, so they cannot fall out of step.
    const letters = guesses[index].replace(/ /g, '')
    words.flat().forEach((state, at) => {
      const letter = letters[at]
      if (state !== 'gray') statuses[letter] = 'present'
      else if (statuses[letter] === undefined) statuses[letter] = 'absent'
    })
  })
  return statuses
}

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
  const { answer, category } = puzzle.data

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
  // THE LADDER IS READ OFF THE LIVE PROP AND THE GUESSES ARE NOT, and the split is the same one
  // cryptogram and Themed Anagrams make. The board's own portion is mount-time state because the
  // board is its writer -- re-reading it would fight the player's keystrokes -- and the hint tail has
  // exactly one writer, which is the adapter, out in the shell. So a rung bought mid-composition
  // reaches the pad on the very next render without a remount and without discarding the half-typed
  // row underneath it.
  //
  // ONLY THE RUNGS THE PLAYER BOUGHT. `decode` reads the stored `hints`, which `open` commits one at
  // a time; the adapter's speculative tail is folded from live state, is never stored, and is never
  // seen here. A pad drawn from that fold would hand out three letters for free on every render.
  //
  // `decode` RATHER THAN `decodeHints`, for the reason hints.ts gives at its own call: only `decode`
  // applies `withinAnswer`, so a stored word rung naming a word this phrase does not have is refused
  // before it can index past the end of `answerWords`.
  const { hints = [] } = decode(progress, phrase)
  const [typed, setTyped] = useState('')
  // `detail` is the half of an announcement that is never drawn -- see FloorBar's prop. Only the
  // marking of a committed guess ever fills it; every other message on this bench is one short
  // sentence that belongs on screen.
  const [message, setMessage] = useState({ detail: '', nonce: 0, text: '' })
  // A WIDTH, not a box. The height went with the guess limit: a grid that grows cannot be sized to
  // fit a band, so the bench scrolls instead and the tiles hold their size.
  const [width, setWidth] = useState(DEFAULT_WIDTH)

  const plateRef = useRef<HTMLDivElement>(null)
  const composingRef = useRef<HTMLDivElement>(null)
  // The last row spent, which is what an accepted Guess shows the player. See the scroll effects
  // below for when each of these two refs is the target.
  const lastMarkedRef = useRef<HTMLDivElement>(null)
  // "A guess was just marked and the player has not started the next one." Set by an accepted,
  // unsolved commit; cleared by the first letter that lands in the new row, and by Again. A ref,
  // not state: nothing is drawn from it, and setting it must not cost a render.
  const revealPending = useRef(false)
  // Bumped once per "start of the next guess", so the effect that scrolls the composing row runs
  // after the render that drew the letter rather than before it. It is 0 at mount, and the mount
  // scroll is the same effect running for the first time.
  const [scrollNonce, setScrollNonce] = useState(0)
  // The guess count the last commit effect saw, so that effect can tell a GROWN count (a guess was
  // accepted) from a shrunk one (Again) and from the mount, none of which but the first may scroll.
  const seenGuesses = useRef(guesses.length)

  useEffect(() => {
    const plate = plateRef.current
    if (plate === null || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver((entries) => {
      // THE PLATE, AND ONLY THE PLATE -- AND ITS CONTENT BOX, NEVER ITS PADDING BOX. This used to
      // observe the board section too, for a height the tiles were sized against; that measurement
      // is gone, and with it the reason the two boxes had to be told apart. The plate is still the
      // right ELEMENT: it is the box the tiles are actually laid out inside, and the section would
      // overstate the room by a gutter a side.
      //
      // AND THE RIGHT ELEMENT WAS BEING READ THE WRONG WAY, which is what this line used to get
      // wrong while the paragraph above congratulated it. It was `plate.clientWidth`, and
      // clientWidth is the PADDING box: it counts the plate's own --lull-gutter-left and
      // --lull-gutter-right, 16px each, so it overstates the room by exactly the gutter a side the
      // section was rejected for overstating it by. tileSize is documented and tested as taking the
      // CONTENT width, so the tiles were sized against 32px of room no row has, and a long word
      // overflowed -- at 320 a nine-letter word drew a 329px grid inside a 320px box, and
      // .lull-board, which was its own vertical scroller then and so computed `overflow-x: auto`,
      // really did scroll sideways. (It is no scroller now: the bench is, and the section below
      // clips its horizontal overflow outright.) `contentRect` is the content box and the callback is
      // handed it for free: no second measurement, and no reading a gutter back out of a stylesheet
      // to subtract it.
      //
      // MEASURING THE PLATE'S HEIGHT WAS NEVER AN OPTION and still is not, which is worth keeping
      // said: the plate's height grows with the grid inside it, so sizing tiles off it is circular
      // -- bigger tiles, taller plate, bigger tiles, to the ceiling on every board. Width has no
      // such loop, which is why width is the one that survived.
      const measured = entries[0]?.contentRect.width ?? 0
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

  // THE SCROLL WAITS FOR THE FIRST LETTER. Pressing Guess used to scroll the NEW, EMPTY composing
  // row into view, and on a phone that was the wrong row: a three-line phrase is ~126px a guess, so
  // bringing the next row up pushed the row that had just been marked off the top -- the player
  // pressed Guess and was shown blank tiles instead of their result. What a player does after Guess
  // is read the marking; what they do next is start typing. So each moment gets its own scroll:
  //
  //   - An accepted Guess shows THE MARKED ROW (the effect keyed on `guesses.length`).
  //   - The first letter of the next guess shows THE COMPOSING ROW (the effect keyed on
  //     `scrollNonce`), because that letter is the player saying "I've read it, I'm moving on".
  //   - Nothing else scrolls: not later letters, not Delete, not a refused Guess, not a key refused
  //     while the hint sheet is up. Scrolling on every keystroke would fight a player who has
  //     scrolled up to re-read row 1 while typing row 4, which is exactly what this bench asks of
  //     people.
  //
  // `nearest` EVERYWHERE, so a row already fully on screen does not move at all. That is the common
  // case after Guess -- the player was looking at the row they typed, which is the row that is now
  // marked -- and in it the board stays perfectly still. Otherwise the bench moves the least
  // distance that shows the whole row, and the row's scroll margins (see the row below) keep it
  // clear of the sticky sign row on top and the sticky floor underneath.
  //
  // THE REFS ARE OPTIONAL AND THE METHOD IS NOT. `composingRef.current` is null on a finished board
  // and on an undrawable pack -- both draw no composing row. The finished board then scrolls its
  // winning row (below); the undrawable pack draws no rows at all, so both refs are null and nothing
  // scrolls. Both arms are exercised by the suite. The call itself is written plainly: a `?.()` there
  // would make a real browser losing this method silent, and the honest failure is a loud one.
  //
  // jsdom implements no scrolling at all, so `Element.prototype.scrollIntoView` does not exist and
  // this board's suite installs it in a beforeAll and removes it in an afterAll. It is the only
  // suite that mounts this component: puzzle-frame's mocks `entryFor` and mounts a recorder.
  //
  // MOUNT IS THIS SAME EFFECT running with the nonce at 0, which is the one scroll a restored board
  // owes: the player arrives at the row they will type into.
  //
  // A FINISHED BOARD HAS NO SUCH ROW, so its mount falls back to the last marked one -- the winning
  // row. That is the row "Show answer" fills in: the frame reveals by rebuilding this board from the
  // solved progress it wrote, so the answer arrives as a mount, appended under every guess, and
  // without this it could sit under the pinned floor with the press seeming to do nothing. Only the
  // mount can reach the fallback: every later bump of the nonce comes from a letter typed into a
  // composing row, which by then exists.
  useEffect(() => {
    ;(composingRef.current ?? lastMarkedRef.current)?.scrollIntoView({ block: 'nearest' })
  }, [scrollNonce])

  // ONLY WHEN THE COUNT GREW. The count also changes when Again empties the board, and it is "seen"
  // at mount -- neither is a guess the player needs shown, and a scroll on Again would point at a
  // row that no longer exists. The winning guess lands here too: a solved board draws no composing
  // row, so the marked row is the only thing there is to show.
  useEffect(() => {
    const grew = guesses.length > seenGuesses.current
    seenGuesses.current = guesses.length
    if (grew) lastMarkedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [guesses.length])

  // The detail DEFAULTS TO EMPTY rather than carrying, so a caller that says one plain sentence
  // cannot inherit the previous guess's marking and announce a transcript of a row that is no
  // longer the subject.
  const say = (text: string, detail = ''): void =>
    setMessage((previous) => ({ detail, nonce: previous.nonce + 1, text }))
  // Clears the band WITHOUT announcing. FloorBar renders nothing at all for '', so the live region
  // goes back to empty and the next message is an announcement rather than a re-read. The nonce is
  // carried rather than bumped, because nothing was said.
  const hush = (): void => setMessage((previous) => ({ detail: '', nonce: previous.nonce, text: '' }))

  const wordsOf = (letters: string): string[] =>
    lengths.map((length, index) => letters.slice(offsets[index], offsets[index] + length))

  // WHICH WORDS ARE COMPLETE AND NOT IN THE LIST. Derived per word, at render, never stored -- the
  // discipline `marked` already follows, and for the same reason: a corrected dictionary or a
  // corrected splitter re-marks the row instead of contradicting it.
  //
  // IT READS `wordList`, NEVER THE `dictionary` PROP. `wordList` is `dictionary ?? EMPTY`, and the
  // empty-set floor is the documented behavior of a board handed nothing -- it refuses every word
  // rather than accepting every word, which is what reaching past it to the prop would silently do.
  //
  // TWO CONJUNCTS AND THE FIRST IS THE WHOLE DESIGN. A word the player is still typing is not
  // rejected, it is unfinished; without the length check every empty slot on a fresh board would be
  // marked at mount. `everyWordInDictionary` is false on an empty word too, so the guard is what
  // separates "not yet" from "no".
  //
  // A FUNCTION OF `letters` RATHER THAN A READ OF `typed`, because `press` decides about the string
  // it is ABOUT to set and React has not committed it yet. One predicate, two callers, no stale
  // read.
  //
  // `commit` IS NOT REFACTORED AND MUST NOT BE. It applies the same predicate at its own call site
  // as `words.filter(...)`, producing a string[] of offenders, and only on a row that is already
  // full -- the same predicate at a different arity with the completion guard already discharged.
  // Hoisting the two together would make one function that returns booleans for a half-typed row and
  // strings for a full one, and the shared thing would be the easy half.
  const rejectedIn = (letters: string): boolean[] =>
    wordsOf(letters).map((word, index) => word.length === lengths[index] && !everyWordInDictionary([word], wordList))

  // ONLY THE COMPOSING ROW IS EVER MARKED, and nothing here enforces that because nothing has to: a
  // committed guess passed isValidGuess's dictionary clause by definition, so a spent row has no
  // offenders to find. The grid asks for this array on the composing row alone anyway.
  //
  // AND IT CANNOT LIGHT UP A WHOLE ROW ON A NETWORK FAILURE, which is the failure mode a
  // dictionary-derived mark invites. PuzzleFrame refuses to mount this board without a ready word
  // list (puzzle-frame/index.tsx:607,628), so the empty-set floor is reachable from the suite and
  // not from a player.
  const rejected = rejectedIn(typed)

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
    if (typed.length >= total) return 'every tile is full'
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

    // THE FIRST LETTER AFTER A MARKED GUESS, and only that one, brings the composing row into view.
    // Below the full-row return above on purpose: a key that changed nothing is not the player
    // starting anything. See the scroll effects for the whole of the rule.
    if (revealPending.current) {
      revealPending.current = false
      setScrollNonce((nonce) => nonce + 1)
    }

    // THE TWO THRESHOLDS THAT BREAK THE SILENCE, and the test both of them pass is the one this
    // comment has always stated: the ribbon speaks for a change in WHAT GUESS WILL DO. There used to
    // be one. Filling the last tile is still the first, because an empty Guess becomes a live one.
    // Completing a word the list does not have is the second, because Guess will now be refused -- a
    // player who fills the row and presses it has already spent the press, and on a bench with no
    // Undo the cheap moment to say so is the moment it becomes true.
    //
    // A KEYSTROKE THAT MERELY MOVES THE CARET STILL SAYS NOTHING, which is the §8.2 rule this is a
    // documented exception to rather than a repeal of. Position is not a change in what Guess will
    // do, the pad's own key names carry it, and a live region that fired seven times a guess would
    // bury the marking. The mark on the board is STANDING STATE and is recomputed every keystroke;
    // this ribbon is an EVENT and is written only on the transition INTO a rejected completion. A
    // rejected word that merely goes on standing is never re-announced, and that split is why an
    // erase hushes while the chip stays.
    const words = wordsOf(next)
    const offenders = rejectedIn(next)
    if (next.length === total) {
      // The FIRST offender, which is `commit`'s rule verbatim: a player fixes one word and presses
      // again, and a list read into a live region is a list read for nothing. NOT_IN_LIST rather
      // than `notInList` here, so the typing-time sentence and the Guess-time refusal are one string
      // said at two moments -- and the imperative tail lands exactly where it becomes actionable.
      // ROW_FULL's `Every tile is full` drops out rather than merging: the player just filled the
      // last tile and can see it, and in a two-line band the actionable half is worth more than the
      // observable one.
      const first = offenders.indexOf(true)
      say(first === -1 ? ROW_FULL : NOT_IN_LIST(words[first]))
      return
    }

    // Which word this keystroke just finished, if any -- the one whose last letter sits at
    // `next.length`. Found off `offsets` rather than by walking the words for a full slice, because
    // the arithmetic that cut the words is the arithmetic that says where one ends.
    const finished = lengths.findIndex((length, index) => offsets[index] + length === next.length)
    if (finished !== -1 && offenders[finished]) {
      say(notInList(words[finished]))
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

    // Below the win's return, so a solved board never sets it: there is no next row to start.
    revealPending.current = true

    // TWO ARGUMENTS, AND THE SPLIT IS THE POINT. This was one string handed to a two-line clamp,
    // which is the same division made by the wrong instrument: the head is the guess and the tail is
    // a per-letter transcript of a grid the sighted player is looking at, so the clamp spent both
    // visible lines on the transcript and then trailed off mid-word. Passed as a detail the tail is
    // announced entire and drawn not at all, and the ribbon says one short sentence.
    //
    // Word groups are separated by a full stop so a screen reader pauses at the word boundary --
    // which is the boundary the purple state is about.
    //
    // THE HEAD USED TO CARRY A COUNT -- `4 guesses left` -- and it is gone rather than reworded.
    // There is no number to put there: `guess 7` is the sign row's job and saying it twice makes the
    // ribbon a counter, and every phrasing of "unlimited" is a sentence announcing a rule instead of
    // a result. What a player needs after a guess is the marking, and that is what is left.
    const tail = tiles
      .map((word, index) => `${word.map((tile, at) => `${words[index][at]} ${PHRASE[tile]}`).join(', ')}.`)
      .join(' ')
    say(`${words.join(' ')}.`, tail)
  }

  const again = (): void => {
    setGuesses([])
    setTyped('')
    hush()
    // A fresh board has no marked row to have read, so its first letter is not a moment to scroll.
    revealPending.current = false
    // A LIFECYCLE SIGNAL, not game state: onReset says "the player started this puzzle over" and
    // takes no argument and names no destination, so deleting lull:hints:<puzzleId> and resetting
    // the hint bar stay entirely the shell's business.
    //
    // THE '' BELOW DOES NOT CLEAR THE LADDER, and the line after it is what does. The rungs live in
    // the progress string, and the adapter's `merge` re-attaches them to every board write including
    // this one -- because '' is what an emptied board writes on the sibling writing bench, where an
    // adapter reading it as "start over" charged the player their rungs for a backspace. So the
    // signal is the reset: PuzzleFrame answers it by storing '' over the whole record, and
    // `removeHints` beside it is a no-op on a key nothing wrote. The signal also does the half an
    // erasure never covers -- it tells the MOUNTED hint bar to shut its sheet and stop announcing
    // yesterday's rungs.
    //
    // ON THIS BENCH THE '' WOULD HAVE BEEN UNAMBIGUOUS, and it is worth saying that nothing relies on
    // it. `encode` here always writes a JSON object, so this line is the only thing in the component
    // that can produce '' -- but three adapters saying the same sentence in the same words has to
    // mean the same thing in all three, and the bench that reaches an ambiguous '' on every keystroke
    // is the one that sets the rule.
    onProgress('')
    onReset?.()
  }

  // THE SHEET IS THE SHELL'S AND IT LIES OVER THIS BOARD, which is why a board that renders no hint
  // bar still has to ask whether one is open. PuzzleFrame draws HintBar in a dock laid over this
  // board's sign row and the sheet drops down over the grid, so a keyboard player who opens a
  // hint to check a row is standing in a modal dialog -- on its Close button, where opening it puts
  // focus, or on its body, which is focusable precisely so it can be scrolled -- and every keystroke
  // made there still reaches this handler, which is on the window. Enter spent one of six attempts on a row the player could not see, and
  // THIS BENCH HAS NO UNDO BY DESIGN: a committed guess is permanent, that is the game, so the loss
  // was irreversible. Letters and Backspace edited the hidden row the same way.
  //
  // IT FOLLOWS `aria-controls` TO THE SHEET, exactly as gofigure/index.tsx does, and reads the
  // answer off the DOM rather than through a prop or a mirrored boolean. What HintBar PUBLISHES --
  // the control's `aria-controls`, and the `hidden` attribute on the element it names -- is the same
  // fact a screen reader is told, so a bench that reads it can never disagree with what the player
  // is hearing, and it cannot go stale on a path that shuts the sheet without saying so (Escape and
  // the sheet's own Close and its scrim are all such paths).
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
    // hint sheet's `Close` and all 28 pad keys are in reach. Without this, pressing `Close` with the
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

    // AND IT IS ASKED AFTER RULE 3, never before: with the sheet up and focus on its Close button,
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
      say(CLOSE_TO_TYPE)
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

  const statuses = keyStatuses(guesses, marked, hints, answerWords)
  // COMPUTED ONCE, not once per key. This used to be called twice inside every one of the 26 letter
  // buttons -- 52 walks of the word lengths per render -- for a value that cannot vary between them:
  // the note is about the caret, and there is one caret.
  const note = noteForKey()

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

  // THE ROW'S NAME LISTS EVERY OFFENDER, WHERE THE RIBBON NAMES ONE, and the two are not
  // inconsistent: a label is read on demand, so completeness costs nothing there, while a live
  // region reads itself at the player whether or not they wanted the list.
  //
  // STANDING, NEVER ANNOUNCED. This is an aria-label on a role="group", so it is what a screen
  // reader finds when it works the row -- no live region, no announcement, and nothing said on the
  // keystroke that changes it.
  //
  // THE JOIN IS ENGLISH'S, not a comma-separated dump: one offender stands alone, two are joined by
  // `and`, and three or more are comma-separated with a final `and`. `Your guess, SLIPPEX DISX,
  // SLIPPEX and DISX not in the word list`.
  //
  // TILE NAMES DO NOT CHANGE, and that is the rule this clause exists under. A word-level fact must
  // not be spoken by a letter-level element: a tile that said `X, not in the word list` would be
  // claiming something about one letter that is true of four.
  const offenderWords = wordsOf(typed).filter((_unused, index) => rejected[index])
  const offenderList =
    offenderWords.length < 2
      ? offenderWords.join('')
      : `${offenderWords.slice(0, -1).join(', ')} and ${offenderWords[offenderWords.length - 1]}`
  // `trimEnd` BEFORE THE CLAUSE, and it is not cosmetic. `composed` joins every word slot with a
  // space, so a half-typed row ends in one space per slot the player has not reached -- invisible
  // until now, because accessible-name computation trims a trailing space and every assertion in the
  // suite reads the computed name. Append a clause and that same space becomes INTERIOR: word 1
  // complete and rejected with word 2 untouched would name the row `Your guess, TOD , TOD not in the
  // word list`, which no trimming rule removes. Trimmed here rather than in `composed`, so the head
  // is the same string with or without the clause.
  const said = `Your guess, ${composed}`.trimEnd()
  const composingName = offenderWords.length === 0 ? said : `${said}, ${offenderList} not in the word list`

  const announced = message.text === '' ? '' : `${message.text}${REPEAT_MARK.repeat(message.nonce % 2)}`

  return (
    // Exactly two elements, and they are siblings: the frame wraps them in `.lull-play`, where the
    // board comes first and the floor sticks to the bottom of the bench beneath it. The shell's
    // hint dock sits before that wrapper, laid over this board's sign row. Neither element knows
    // the other is there.
    <>
      {/* A <section> with a name is a landmark, which is what lets the shell and the page find the
          board without either reaching into it. The name is the TYPE, because a reader moving by
          landmark is choosing a band and not reading content.

          THIS BAND DOES NOT SCROLL; THE BENCH DOES. It used to be the one scroller on the bench,
          with the breadcrumb, title and hint bar standing still above it, and that is what left a
          phone a 173px window onto the grid. Now the whole bench column scrolls, the crown scrolls
          away, and this band simply grows with its rows -- index.css owns that geometry, so nothing
          here sets flex, height or vertical scrolling.

          `overflow-x-clip`, NOT `overflow-x-hidden`, and the difference is the whole layout. Any
          `overflow-x` other than `visible` or `clip` forces `overflow-y` to compute to `auto`,
          which would make this section a scroll container again -- one that never scrolls, and
          that the sticky sign row would pin itself to instead of the bench. `clip` clips the same
          way and creates no scroll container. It is a backstop rather than the guarantee: the word
          groups below are a flex-wrap row, so the widest phrase the corpus can produce wraps rather
          than extending, and the clip exists so no band can ever drag the bench sideways.

          NO tabIndex. It had one so a keyboard player could scroll this band, because nothing
          inside it is focusable -- a tile is role="img" with no handler, deliberately, because 126
          buttons is 126 tab stops for elements nothing can do anything with. That reason went with
          the scrolling. The scroller is the bench now, and the bench holds focusable controls in
          every state (the breadcrumb's links, the hint control, the pad's keys), so focus on any
          of them lets the arrow and Page keys scroll it, and a Tab back to the breadcrumb brings
          the crown into view. WCAG 2.1.1 still holds, one level up. */}
      <section aria-label="Phrazle" className="lull-board flex flex-col overflow-x-clip">
        {/* Sticky, because the count is the one number a player checks constantly and the bench
            scrolls under it. It is the board's FIRST child, which is the layout convention every
            hint-dock bench follows: the shell lays its hint control over this row's right end and
            the row reserves the room (`.lull-bench[data-hint-dock]` in index.css). A <div> rather
            than the <p> it was, because it now carries a stacked layout with a control laid over it.

            The two lines STACK: the category on top, read the way the cipher bench reads it --
            what this phrase IS -- and the count beneath it. A pack stored before Phrazle shipped a
            category has none, so the top line is absent and the count stands alone. */}
        {/* `Guess 7`, never `Guess 7 of N`. There is no N: the board grows a row whenever the
            player needs one, so an "of" would have to name either a limit that does not exist or the
            row count the player can already see, which counts nothing. What is left is the one
            number that still means something -- how many attempts this phrase has taken. */}
        <div className={SIGN_ROW}>
          {category !== undefined && (
            <span className="truncate text-[11.5px] font-semibold tracking-[0.11em] uppercase">{category}</span>
          )}
          {drawable && <span className="shrink-0">{`Guess ${spent}`}</span>}
        </div>

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
          <div aria-label="Guesses" className="flex flex-col" role="group" style={{ gap: `${GUESS_GAP}px` }}>
            {Array.from({ length: rows }, (_unused, index) => index).map((index) => {
              const done = index < guesses.length
              const isComposing = !over && index === guesses.length
              const letters = done ? guesses[index].replace(/ /g, '') : typed
              // The composing row, or the last row spent (which, on a solved board, is the winning
              // one), or neither. Lifted out of the JSX so the attribute is not a nested ternary.
              const lastMarked = index === guesses.length - 1
              const rowRef = isComposing ? composingRef : lastMarked ? lastMarkedRef : undefined

              return (
                // A FRAGMENT, so the hairline is a SIBLING of the row rather than a child of it.
                // Inside the row it would land within a `role="group"` named `Guess 1, HOT HAND`
                // and inherit the wrap gap instead of the guess gap; outside, it takes its share of
                // GUESS_GAP on each side and the separation between two guesses is the gap, the
                // line, and the gap again -- against one wrap gap inside a guess.
                //
                // Before the FIRST guess there is nothing to separate, so `index > 0` draws exactly
                // `rows - 1` of them, which is what the suite counts.
                <React.Fragment key={index}>
                  {index > 0 && <GuessRule />}
                  <div
                    // Absent on every other row, never "false": there is no
                    // this-is-not-the-current-row state worth saying on every row above.
                    aria-current={isComposing ? 'true' : undefined}
                    // `Guess 3`, matching the sign row, for the same reason: there is no total to be
                    // three of.
                    aria-label={isComposing ? composingName : `Guess ${index + 1}, ${guesses[index]}`}
                    // THE SCROLL MARGINS ARE THE OTHER HALF OF THE TWO STICKY BANDS, and they are on
                    // the row because `scrollIntoView` above is what puts the row where it lands. The
                    // sign row is `sticky top-0` in the bench and the floor is sticky at its bottom,
                    // so each OVERLAYS an edge of the scrollport -- and a browser aligning
                    // `block: 'nearest'` knows nothing about either and would tuck the row under one
                    // of them. Scroll margin is the property that exists for exactly this, and it is
                    // inert everywhere else: it moves no layout and affects only a scroll that
                    // targets this element.
                    //
                    // TOP, 52px = the sign row's 46 (a border-box band, its two 1px rules included)
                    // plus the 6 the not-in-the-word-list chip hangs above the tile it sits on. The
                    // chip is what makes the last term more than tidiness -- clearing the row but
                    // clipping its mark is the same bug one channel smaller.
                    //
                    // BOTTOM, the seam plus the device's bottom inset: --lull-seam is the floor's
                    // whole height (ribbon, pad and safe strip), and the inset is what the safe strip
                    // grows by on a phone with a home indicator. Without it a `nearest` scroll that
                    // moves DOWN to show a row would align the row's bottom with the bench's bottom,
                    // which is underneath the keypad.
                    className="flex scroll-mt-[52px] scroll-mb-[calc(var(--lull-seam)+env(safe-area-inset-bottom))] flex-wrap"
                    // The two rows worth scrolling to, so the effects above have something to point
                    // at. Undefined on every other row: React would otherwise call a cleanup callback
                    // with null for every spent row on every render and leave the ref holding
                    // whichever row rendered last.
                    ref={rowRef}
                    role="group"
                    // WRAP_GAP, never GUESS_GAP. This is the gap a SINGLE guess breaks at when its
                    // words do not fit the width, and the two were one constant until a sixteen-letter
                    // phrase drew two guesses as four identical lines.
                    style={{ columnGap: `${WORD_GAP}px`, rowGap: `${WRAP_GAP}px` }}
                  >
                    {/* WORDS NEVER BREAK: word shape is a solving cue and a broken word reads as two
                        words. The row wraps BETWEEN words instead, identically on every row because
                        every row has identical word lengths, and the grid gets taller and the bench scrolls. */}
                    {wordsOf(letters).map((word, wordIndex) => {
                      // THE COMPOSING ROW AND ONLY THE COMPOSING ROW. `rejected` is derived from
                      // `typed`, so it says nothing about a spent row's letters -- and a spent row
                      // cannot have an offender anyway, having passed isValidGuess to get here. The
                      // guard is what stops the array being read against the wrong letters.
                      const wordRejected = isComposing && rejected[wordIndex]
                      // Lifted out of the JSX rather than nested in the tile's template, because the
                      // alternative is a ternary inside a ternary inside an attribute, and the fill
                      // is decided by two independent questions: is this tile marked, and is the
                      // word it sits in rejected.
                      const composingFill = wordRejected ? COMPOSING_REJECTED : COMPOSING

                      return (
                        // `data-not-a-word` IS THE ONLY ASSERTABLE PROXY FOR THE EXTENT, and it is
                        // here for that reason rather than for styling: the border swap is a class,
                        // style assertions are forbidden, and jsdom lays nothing out -- so without
                        // this attribute the accent outline would ship with nothing able to see it.
                        <div
                          className="flex"
                          data-not-a-word={wordRejected ? '' : undefined}
                          key={wordIndex}
                          style={{ gap: `${LETTER_GAP}px` }}
                        >
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
                                className={`${TILE} ${state === undefined ? composingFill : FILL[state]}`}
                                key={at}
                                role="img"
                                style={{ height: `${tile}px`, width: `${tile}px` }}
                              >
                                <span aria-hidden="true" style={{ fontSize: `${letter}px` }}>
                                  {shown}
                                </span>
                                {state !== undefined && <Bar state={state} width={bar} />}
                                {/* THE FIRST TILE OF THE WORD AND NO OTHER. One chip annotates a
                                    word; a chip per tile would read as a fifth marking verdict and
                                    would make a five-letter word look more rejected than a
                                    two-letter one. Drawn LAST so the letter and the bar keep the
                                    child positions the suite reads them at. */}
                                {wordRejected && at === 0 && <NotAWord />}
                              </span>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                </React.Fragment>
              )
            })}
          </div>
        </div>
      </section>

      {/* FloorBar takes no className, and CSS cannot move a box into another parent -- so the band
          class goes on a wrapper around it rather than on the bar itself. */}
      <div className="lull-instrument">
        <FloorBar detail={message.detail} message={announced} resting={restingLine()}>
          {/* THE SHARED PAD. Full bleed, no horizontal padding, three QWERTY rows in the same 179px
              the four alphabetical ones spent -- keypad/layout.ts holds that arithmetic and the
              reason the letters are in this order. Nothing about the instrument is decided here.

              THE NAME FOLLOWS THE KEY, in both senses. It names `Delete` FIRST because Delete is
              the left-hand key -- a group that lists its controls out of order describes a pad the
              player is not looking at. And one key is swapped in place when the board is over, so a
              group still promising a `Guess` button would send a screen-reader user navigating by
              group to look for a control that is not in it -- the group holds `Play again` by then.
              The two names use the keys' own accessible names, not their visible labels, so the
              group and the button it names cannot come apart. */}
          <Keypad
            label={over ? 'Letters, Delete and Play again' : 'Letters, Delete and Guess'}
            letter={(plain) => {
              const status = statuses[plain] ?? 'untried'

              return {
                // THE RULED-OUT MARK, drawn only where the verdict is in. Nothing at all on the
                // other two states, rather than a hidden element -- see Strike.
                mark: status === 'absent' ? <Strike /> : undefined,
                // LETTER, THEN VERDICT, THEN CARET, and the order is the order a player needs them
                // in: which key this is, whether it is worth pressing, and what pressing it would
                // fill. An untried key contributes no verdict at all rather than a third phrase
                // saying so -- `A, fills word 2 letter 1` is a key nobody has spent a guess on, and
                // naming that absence would put a sentence on 26 keys at mount.
                //
                // Both middle terms drop out on an undrawable pack, where the note is '' and no
                // guess has been marked, leaving the bare letter.
                name: [plain, KEY_PHRASE[status as keyof typeof KEY_PHRASE], note].filter(Boolean).join(', '),
                tone: TONE[status],
              }
            }}
            onPress={press}
            utility={[
              // Delete, and it IS Backspace -- the same `erase`, reached by a key on the pad instead
              // of a key on a hardware keyboard. There is no Undo on this bench: a committed guess is
              // permanent, that is the game, and an Undo here would be a rule this app authored.
              //
              // LEFT, and it is the eraser that is pinned there rather than this bench's other tool
              // -- see keypad's `utility` prop for the rule and for what it costs.
              { label: 'Delete', onClick: erase, tone: TONE_UTILITY },
              // ONE KEY SWAPPED IN PLACE, never a pad replaced. 28 keys vanishing under a keyboard
              // player's focus drops focus to <body> and restarts the next Tab at the top of the
              // page, and a pad left inert reads as 28 broken keys. Keypad draws both utility keys
              // outside a map for exactly this reason: the DOM element survives the swap, so focus
              // is never lost and nothing reflows. `Play again` does not fit the key; the visible
              // label is `Again` and the accessible name is `Play again`, which satisfies 2.5.3
              // because the visible label is contained in the name -- the same trick HintBar uses
              // for `Hint 1 of 3`.
              //
              // RIGHT, because it is the one key on this pad that finishes something. Every form on
              // the device this ships to puts the confirming control on that side, and this is the
              // control a player reaches for once per row.
              {
                label: over ? 'Again' : 'Guess',
                name: over ? 'Play again' : undefined,
                onClick: over ? again : commit,
                tone: TONE_UTILITY,
              },
            ]}
          />
        </FloorBar>
      </div>
    </>
  )
}
