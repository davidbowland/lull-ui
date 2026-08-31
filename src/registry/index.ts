import { CrypticClueBoard } from '@components/crypticclue'
import { CryptogramBoard } from '@components/cryptogram'
import { GoFigureBoard } from '@components/gofigure'
import { MissingVowelsBoard } from '@components/missingvowels'
import { PhrazleBoard } from '@components/phrazle'
import { ThemedAnagramsBoard } from '@components/themedanagrams'
import { HintLadder, Puzzle, PuzzleComponent, PuzzleProgress, PuzzleType } from '@types'

// The surface a type is played on, named for the input it is shaped around rather than for
// the type that happens to use it today. A bench is a room: 'cipher' is a grid you select
// into from a docked keypad, 'guess' is a grid you commit whole rows into and cannot edit
// afterwards, 'writing' is a line you type onto, 'tile' is a tray you build an expression
// out of. Two types could share one, and that is the point of naming the surface instead of
// the game.
//
// 'guess' IS NOT 'cipher', and the two are siblings rather than the same room. The cipher bench
// keeps every square live for the whole session and one keystroke changes squares all over the
// phrase; the guess bench has exactly one live row, and committing it moves it into a history
// nothing can edit.
export type Bench = 'cipher' | 'guess' | 'tile' | 'writing'

// Declared here rather than derived from Object.keys(REGISTRY), because the order a reader
// meets the benches in is a product decision and key order in an object literal is an
// implementation detail -- reordering the entries alphabetically or by type name should not
// silently reshuffle the day.
//
// The day sorts its rows by difficulty, breaks that tie with this, and breaks whatever is left
// with the puzzle id -- see orderPuzzles in components/shelf. It used to sort by estimated time
// alone, and toSorted is stable, so equal-time rows kept whatever order the backend happened to
// send, which changed between refetches: a player saw difficulty bands that looked deliberate with
// an order inside each band that did not. A bench missing from this list does not bring that back
// -- byId is the last term and ids are unique, so the comparator stays total and the order stays
// steady -- but benchRank buries it behind every bench that was declared, and where it lands is
// then an accident rather than a decision.
export const BENCH_ORDER: readonly Bench[] = ['cipher', 'guess', 'writing', 'tile']

/**
 * How a type computes its own hints, for the types whose rungs depend on what the player has
 * established. The shell owns WHEN a rung is shown; this owns WHICH.
 *
 * It exists because a rung that cannot see the board cannot know what is still worth saying. A pack
 * ladder is decided before the puzzle ships, which is right for a hint about what a phrase MEANS and
 * useless for a hint about its letters: "every Q is an E" is worth nothing to a player who already
 * has Q, and the generator cannot know whether they do.
 *
 * IT IS THE SHELL'S QUESTION, NOT THE BOARD'S -- the same standing `needsDictionary` has. A board
 * still receives its six props and still never learns that hints exist. The half of that sentence
 * worth reading twice: a rung an adapter sells is written into the board's OWN progress string, so
 * the board does find, say, some letters locked. It reads that off its own progress and has no idea
 * why they are there. "The board never learns hints exist" was always the promise; "the board is
 * never affected by a hint" never was, and it is not one this seam keeps.
 *
 * THE SHELL IS THE ONLY WRITER OF THE HINT FIELD, AND `merge` IS THE WHOLE OF THAT RULE. Every board
 * in this app reads `progress` once, in a lazy initializer, and owns its state from then on -- so a
 * field an adapter writes into that string is a field the mounted board neither renders nor knows
 * about, and the board's very next `encode` writes over it. That is silent loss of a rung the player
 * paid for, and no amount of care in an adapter can prevent it, because the clobbering write is the
 * board's and the board is right to make it.
 *
 * So boards keep writing only their own portion, `PuzzleFrame` routes EVERY board write through this,
 * and the tail is re-attached from what is currently stored. Two properties fall out and both are
 * worth naming: each field has exactly one writer, and the adapter never has to guess what the board
 * meant to say about its own squares -- it copies a tail it wrote itself and leaves the rest alone.
 *
 * A board write of '' IS A RESET and an adapter must answer it with ''. Play again writes the empty
 * string through the same callback, `''` is what the shell reads as "no progress", and re-attaching a
 * ladder to it would hand the player back rungs they just threw away on a board that no longer has
 * them.
 *
 * `ladder` returns the rungs already bought, rendered from their frozen records, followed by
 * speculative placeholders for the unspent tail. HintBar draws only `slice(0, opened)`, so the tail
 * is computed, never shown, and committed from live state at the moment it is bought -- which is
 * what stops a ladder recomputed on every render from letting a player open rung 1, learn something,
 * and watch rung 1 silently upgrade itself into a better hint.
 *
 * IT IS ONE TO THREE RUNGS, NEVER ALWAYS THREE. `chooseNext` answers null once the player has
 * established everything a rung could say, and the speculative tail stops there rather than padding.
 * That is crypticclue's "a rung you do not have beats a bad one", reached from the other direction.
 * `null` is the further case -- nothing worth saying at all -- and the frame reads it exactly as it
 * reads a malformed pack ladder: no bar.
 *
 * `open` returns the NEXT PROGRESS STRING, or null when there is nothing left to sell. Null is a
 * decline and the count stays where it is, which is the behavior HintBar already documents for a
 * controlled owner that says no. One step past the last rung is the ANSWER -- see `controlLabel` in
 * hint-bar, where `opened > hints.length` is the reveal -- so an adapter that stops at its own last
 * rung takes the reveal away from its bench.
 *
 * `opened` IS STORED BESIDE THE SPENT RUNGS AND IS NOT DERIVED FROM THEM, which is goFigure's grammar
 * (`<cells>|<opened>|<locked>`) and is what its BoardState comment already argues for. An earlier
 * draft of this interface derived it -- one record, nothing to keep in step -- and that is a
 * genuinely better property that this seam cannot have, for a reason that has nothing to do with
 * keeping two numbers in step: `controlLabel` in hint-bar reaches "Show answer" only when
 * `opened > hints.length`, so a bar must be able to sell one step PAST the last rung, and a count
 * derived from a three-rung spent list can never express four. Deriving it makes the answer reveal
 * unreachable on every adapter bench. So `open` must be able to advance the count without appending
 * a rung, and that last step is the reveal.
 *
 * Co-locating the count with the rungs in the board's own progress string is still the point, and
 * still goFigure's: split across two stores with different prune rules, the count and the rungs can
 * disagree, and a board showing a spent ladder while offering "Open hint 1 of 3" is a state no test
 * would think to write. It is also why a board's Play again clears the ladder for free -- it writes
 * `''` through the same callback, and `merge` above answers '' with ''.
 */
export interface HintAdapter {
  ladder(puzzle: Puzzle<unknown>, progress: PuzzleProgress): HintLadder | null
  merge(boardWrite: PuzzleProgress, current: PuzzleProgress): PuzzleProgress
  open(puzzle: Puzzle<unknown>, progress: PuzzleProgress): PuzzleProgress | null
  opened(progress: PuzzleProgress): number
}

export interface RegistryEntry {
  bench: Bench
  Component: PuzzleComponent
  // The `d` of one path in a 0 0 22 16 viewBox -- wider and shorter than `icon` because the day
  // directory draws it as a small landscape plate at the head of a row, so each row shows the
  // shape of the bench it opens and choosing is visibly choosing between four different rooms.
  // Stroked, not filled, like `icon`: every glyph here has to read as an outline.
  glyph: string
  // OPTIONAL, unlike `needsDictionary` above, and the asymmetry is a decision rather than an
  // oversight. A type that needs a word list and forgets to say so links to a board the shell will
  // refuse to mount, so that question is required and every entry answers it. This one has a correct
  // default: three of the six types compute nothing and read their ladder off the pack, and they
  // always will -- a hint about what a phrase MEANS is decided before the puzzle ships and does not
  // improve for being recomputed. So absent means "the pack's ladder", which is what the shell did
  // for every type before this field existed.
  //
  // NO ENTRY SETS IT YET. The three that will are wired with their adapters, one type at a time.
  hints?: HintAdapter
  // The `d` of one path in a 0 0 24 24 viewBox, not JSX, so this file stays .ts and the
  // registry stays data. The shelf draws it inside an aria-hidden <svg> beside the label
  // -- decoration next to words, never a glyph standing alone.
  icon: string
  label: string
  // REQUIRED on every entry rather than optional, so a new type that needs a dictionary and forgets
  // to say so is a compile error rather than a shelf row linking to a board the shell will refuse
  // to mount. Five entries answer false and one answers true.
  //
  // It is the shell's question, not the board's: the shelf reads it to decide whether to draw a row
  // that is not a link, and PuzzleFrame reads it to decide whether to paint a dead end. A board
  // never sees it.
  needsDictionary: boolean
}

// Everything a type contributes to the shell. Adding a type is adding a line here and a
// component: the shell owns routing, storage, and the network, and asks the registry
// only what to render.
export const REGISTRY: Record<PuzzleType, RegistryEntry> = {
  // FIRST in the object, and it is convention rather than anything the compiler holds. REGISTRY is
  // in alphabetical order by key and `crypticclue` sorts before `cryptogram`, because `i` precedes
  // `o` at the sixth character. Nothing enforces it -- a Record is not ordered by the type and no
  // lint rule sorts object keys here -- so it is written down rather than left to be noticed by
  // whoever appends next.
  crypticclue: {
    bench: 'writing',
    // Cast for the same reason the other five are: the shell carries a Puzzle<unknown> because it
    // deliberately cannot know what any type's data looks like, and this is the single line asserting
    // that Cryptic Clue's board gets Cryptic Clue's data.
    Component: CrypticClueBoard as PuzzleComponent,
    // A line of writing, then a bracket holding one unknown. The rule sits at y = 11.4, the SAME
    // baseline Missing Vowels' rule sits on, because the day directory can now show three
    // writing-bench rows and glyphs whose rules sit on one line read as games in one room.
    // Unbroken where that one is broken by two gaps: this bench's letters are all present, and it
    // is their meaning that is missing. The parentheses are the enumeration -- the one mark on
    // screen that says at a glance this is a cryptic clue and not a phrase -- and the dot inside
    // them is the answer, not yet known.
    glyph: 'M1 11.4h11.2M15 5c-1.4 2-1.4 4.4 0 6.4M19.4 5c1.4 2 1.4 4.4 0 6.4M17.2 8.4h.01',
    // Two lines converging into one: two readings of one sentence meeting at a single answer. The
    // second subpath ends at (13, 12), exactly where the first subpath's horizontal run begins, so
    // the three strands meet at a point.
    icon: 'M4 7h5l4 5h7M4 17h5l4-5',
    label: 'Cryptic Clue',
    needsDictionary: false,
  },
  cryptogram: {
    bench: 'cipher',
    // Cast for the same reason the other five are: the shell carries a Puzzle<unknown> because it
    // deliberately cannot know what any type's data looks like, and this is the single line
    // asserting that Cryptogram's board gets Cryptogram's data.
    Component: CryptogramBoard as PuzzleComponent,
    // Three cells in a row with the first one marked. The cipher bench's whole move is picking a
    // cell and then a letter, so the glyph shows a cell picked. The mark is a dot rather than a
    // filled cell because the day strokes this path with no fill, which would leave a "filled"
    // square indistinguishable from its two empty neighbors.
    glyph: 'M0.7 2.6h6v10.8h-6zM8 2.6h6v10.8h-6zM15.3 2.6h6v10.8h-6zM3.7 8h.01',
    // An arrow crossing into a wall -- one thing standing for another, which is the whole game.
    icon: 'M4 12h9m0 0-3-3m3 3-3 3M18 5v14',
    label: 'Cryptogram',
    needsDictionary: false,
  },
  gofigure: {
    bench: 'tile',
    // Cast once, here, where the pairing of the type tag to its component is declared.
    // The shell carries a Puzzle<unknown> because it deliberately cannot know what any
    // type's data looks like, and this is the single line that asserts goFigure's board
    // gets goFigure's data.
    Component: GoFigureBoard as PuzzleComponent,
    // A plus and a times over a baseline: operators picked off a tray and set down on a line,
    // which is what building an expression out of tiles looks like from across the room.
    glyph: 'M4 2.4v6.2M0.9 5.5h6.2M14.6 3.3l4.4 4.4M19 3.3l-4.4 4.4M1 13.4h20',
    icon: 'M5 12h14M12 5v14',
    label: 'Go Figure!',
    needsDictionary: false,
  },
  missingvowels: {
    bench: 'writing',
    // Cast for the same reason goFigure is: the shell carries a Puzzle<unknown> because it
    // deliberately cannot know what any type's data looks like, and this is the single line
    // asserting that Missing Vowels' board gets Missing Vowels' data.
    Component: MissingVowelsBoard as PuzzleComponent,
    // A writing rule broken by two gaps, with a dot floating over each gap: the letters that
    // are missing and the line you type them onto. The dots sit over the gaps and not over the
    // segments, so the glyph points at the holes rather than decorating the text.
    glyph: 'M1 11.4h5.6M9.6 11.4h3.2M15.8 11.4h5.2M8.1 5.8h.01M14.3 5.8h.01',
    // A serifed capital T -- letters, which is what this type is made of.
    icon: 'M5 7V5h14v2M12 5v14M9 19h6',
    label: 'Missing Vowels',
    needsDictionary: false,
  },
  phrazle: {
    bench: 'guess',
    // Cast for the same reason the other five are: the shell carries a Puzzle<unknown> because it
    // deliberately cannot know what any type's data looks like, and this is the single line
    // asserting that Phrazle's board gets Phrazle's data.
    Component: PhrazleBoard as PuzzleComponent,
    // Six cells in two rows of three, with dots in the first two cells of the TOP row. It depicts
    // what the bench is: rows, the ones above already marked, the one below empty and waiting. The
    // x geometry is Cryptogram's exactly -- 0.7, 8, 15.3, each 6 wide -- which is deliberate: the
    // two grid benches should read as relatives at a glance and be told apart by the second row and
    // by TWO marks rather than one. One mark would be a selected cell, which is the cipher bench's
    // move.
    glyph:
      'M0.7 1.7h6v5.4h-6zM8 1.7h6v5.4h-6zM15.3 1.7h6v5.4h-6zM0.7 8.9h6v5.4h-6zM8 8.9h6v5.4h-6z' +
      'M15.3 8.9h6v5.4h-6zM3.7 4.4h.01M11 4.4h.01',
    // A row divided into three cells above one undivided box. The divided row is a VERDICT --
    // marked cell by cell, which is the only thing that ever happens to a committed row. The
    // undivided box is the phrase you are still composing, which has no verdict yet because you
    // have not pressed Guess. The bench's whole move is turning the second into the first. It does
    // not read as a text-align icon because the two rows differ in kind rather than in length.
    icon: 'M4 5h16v6H4zM9.33 5v6M14.67 5v6M4 14h16v5H4z',
    label: 'Phrazle',
    // The only true one in the file.
    needsDictionary: true,
  },
  themedanagrams: {
    bench: 'writing',
    // Cast for the same reason the other five are: the shell carries a Puzzle<unknown> because it
    // deliberately cannot know what any type's data looks like, and this is the single line
    // asserting that Themed Anagrams' board gets Themed Anagrams' data.
    Component: ThemedAnagramsBoard as PuzzleComponent,
    // Four short uprights over one wide box: a run of loose letters with a line to write on under
    // them, which is one row of this worksheet standing for the whole board. The uprights are
    // STAGGERED -- 2.2, 3.8, 1.8, 3.2 -- and the stagger is the whole content of the mark: level
    // letters would say "a word", and letters at four different heights say "letters not yet in an
    // order". Four of them, because four is what the puzzle is.
    //
    // The box below is landscape and singular, which keeps it clear of Cryptogram's three portrait
    // cells (that mark is about picking one of several; this one is about one line you write on)
    // and of Missing Vowels', whose rule is broken into segments with dots over the gaps -- here
    // the rule is a closed box, because on this bench the boundary is a control's, not a
    // baseline's. Stroked with no fill, like the other five.
    glyph: 'M3 2.2v3.4M7.8 3.8v3.4M12.6 1.8v3.4M17.6 3.2v3.4M1 9.4h20v5.2H1z',
    // Two arrows, one over the other, pointing opposite ways -- the same things exchanging places,
    // which is what an anagram is and the one fact that separates this type from Missing Vowels.
    // The glyphs and the icons divide the work deliberately: the glyph says what the surface looks
    // like, the icon says what the game does to you. Missing Vowels' icon is a serifed T because
    // that type is made of letters; this one cannot be a letter too, so it takes the operation.
    icon: 'M4 9h13m0 0-3.5-3.5M17 9l-3.5 3.5M20 15H7m0 0 3.5-3.5M7 15l3.5 3.5',
    label: 'Themed Anagrams',
    needsDictionary: false,
  },
}

// Said in one place because it is said in two: the shelf prints it on a row it cannot
// draw, and the frame prints it on a puzzle it cannot open. Two copies of one sentence
// drift, and the reader meets both.
export const UNKNOWN_TYPE_MESSAGE = 'A newer kind of puzzle. Reload while you’re online to play it.'

// A pack is JSON off the network, so `type` is a string that a build this old may never
// have heard of -- lull-api can ship a generator before the UI that draws it. The
// caller gets undefined and says so; destructuring straight off REGISTRY would throw
// during render, and ErrorBoundary (_app.tsx) answers a render throw by replacing the
// whole app with "Lull got stuck" -- so one unknown type would cost the entire surface.
//
// Object.hasOwn, not a plain index. Every object inherits `constructor`, `toString`, and
// `__proto__`, so `REGISTRY['constructor']` returns a function -- which passed the
// `entry === undefined` guard, and the frame then rendered <Component /> where Component
// was undefined. "Element type is invalid", white screen: exactly the failure this guard
// was written to prevent, from a `type` string off the network.
export const entryFor = (type: string): RegistryEntry | undefined =>
  Object.hasOwn(REGISTRY, type) ? (REGISTRY as Record<string, RegistryEntry>)[type] : undefined
