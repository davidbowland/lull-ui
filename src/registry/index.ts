import { CryptogramBoard } from '@components/cryptogram'
import { GoFigureBoard } from '@components/gofigure'
import { MissingVowelsBoard } from '@components/missingvowels'
import { PuzzleComponent, PuzzleType } from '@types'

export interface RegistryEntry {
  Component: PuzzleComponent
  // The `d` of one path in a 0 0 24 24 viewBox, not JSX, so this file stays .ts and the
  // registry stays data. The shelf draws it inside an aria-hidden <svg> beside the label
  // -- decoration next to words, never a glyph standing alone.
  icon: string
  label: string
  // Absent means today's flow: a page of stacked sections with the board somewhere in the middle.
  // 'docked' means the board pins something to the bottom of the viewport and everything above it
  // has to get out of the way -- which is a SHELL concern, so the board's four-prop contract does
  // not change and it still never learns what is around it.
  layout?: 'docked'
}

// Everything a type contributes to the shell. Adding a type is adding a line here and a
// component: the shell owns routing, storage, and the network, and asks the registry
// only what to render.
export const REGISTRY: Record<PuzzleType, RegistryEntry> = {
  cryptogram: {
    // Cast for the same reason the other two are: the shell carries a Puzzle<unknown> because it
    // deliberately cannot know what any type's data looks like, and this is the single line
    // asserting that Cryptogram's board gets Cryptogram's data.
    Component: CryptogramBoard as PuzzleComponent,
    // An arrow crossing into a wall -- one thing standing for another, which is the whole game.
    icon: 'M4 12h9m0 0-3-3m3 3-3 3M18 5v14',
    label: 'Cryptogram',
    // The one type that asks for it. A 26-key pad docked to the bottom of the viewport covers
    // whatever is under it, and today's Back button sits under the board.
    layout: 'docked',
  },
  gofigure: {
    // Cast once, here, where the pairing of the type tag to its component is declared.
    // The shell carries a Puzzle<unknown> because it deliberately cannot know what any
    // type's data looks like, and this is the single line that asserts goFigure's board
    // gets goFigure's data.
    Component: GoFigureBoard as PuzzleComponent,
    icon: 'M5 12h14M12 5v14',
    label: 'Go Figure!',
  },
  missingvowels: {
    // Cast for the same reason goFigure is: the shell carries a Puzzle<unknown> because it
    // deliberately cannot know what any type's data looks like, and this is the single line
    // asserting that Missing Vowels' board gets Missing Vowels' data.
    Component: MissingVowelsBoard as PuzzleComponent,
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
