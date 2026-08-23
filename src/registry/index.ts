import { CryptogramBoard } from '@components/cryptogram'
import { GoFigureBoard } from '@components/gofigure'
import { MissingVowelsBoard } from '@components/missingvowels'
import { PuzzleComponent, PuzzleType } from '@types'

// The surface a type is played on, named for the input it is shaped around rather than for
// the type that happens to use it today. A bench is a room: 'cipher' is a grid you select
// into from a docked keypad, 'writing' is a line you type onto, 'tile' is a tray you build an
// expression out of. Two types could share one, and that is the point of naming the surface
// instead of the game.
export type Bench = 'cipher' | 'tile' | 'writing'

// Declared here rather than derived from Object.keys(REGISTRY), because the order a reader
// meets the benches in is a product decision and key order in an object literal is an
// implementation detail -- reordering the entries alphabetically or by type name should not
// silently reshuffle the day.
//
// The day sorts its rows by estimated time and breaks ties with this. toSorted is stable, so
// before there was a tiebreak, equal-time rows kept whatever order the backend happened to
// send, which changed between refetches: a player saw difficulty bands that looked deliberate
// with an order inside each band that did not. Every bench has to appear here exactly once or
// two rows compare equal again and the shuffle comes back.
export const BENCH_ORDER: readonly Bench[] = ['cipher', 'writing', 'tile']

export interface RegistryEntry {
  bench: Bench
  Component: PuzzleComponent
  // The `d` of one path in a 0 0 22 16 viewBox -- wider and shorter than `icon` because the day
  // directory draws it as a small landscape plate at the head of a row, so each row shows the
  // shape of the bench it opens and choosing is visibly choosing between three different rooms.
  // Stroked, not filled, like `icon`: every glyph here has to read as an outline.
  glyph: string
  // The `d` of one path in a 0 0 24 24 viewBox, not JSX, so this file stays .ts and the
  // registry stays data. The shelf draws it inside an aria-hidden <svg> beside the label
  // -- decoration next to words, never a glyph standing alone.
  icon: string
  label: string
}

// Everything a type contributes to the shell. Adding a type is adding a line here and a
// component: the shell owns routing, storage, and the network, and asks the registry
// only what to render.
export const REGISTRY: Record<PuzzleType, RegistryEntry> = {
  cryptogram: {
    bench: 'cipher',
    // Cast for the same reason the other two are: the shell carries a Puzzle<unknown> because it
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
  },
}

// Said in one place because it is said in two: the shelf prints it on a row it cannot
// draw, and the frame prints it on a puzzle it cannot open. Two copies of one sentence
// drift, and the reader meets both.
export const UNKNOWN_TYPE_MESSAGE = 'A newer kind of puzzle. Reload while you’re online to play it.'

// A pack is JSON off the network, so `type` is a string that a build this old may never
// have heard of -- lull-api can ship a generator before the UI that draws it. The
// caller gets undefined and says so; destructuring straight off REGISTRY would throw
// during render, where storage.ts's own comments note there is no error boundary.
//
// Object.hasOwn, not a plain index. Every object inherits `constructor`, `toString`, and
// `__proto__`, so `REGISTRY['constructor']` returns a function -- which passed the
// `entry === undefined` guard, and the frame then rendered <Component /> where Component
// was undefined. "Element type is invalid", white screen: exactly the failure this guard
// was written to prevent, from a `type` string off the network.
export const entryFor = (type: string): RegistryEntry | undefined =>
  Object.hasOwn(REGISTRY, type) ? (REGISTRY as Record<string, RegistryEntry>)[type] : undefined
