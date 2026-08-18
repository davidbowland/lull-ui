import { GoFigureBoard } from '@components/gofigure'
import { PuzzleComponent, PuzzleType } from '@types'

export interface RegistryEntry {
  Component: PuzzleComponent
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
  gofigure: {
    // Cast once, here, where the pairing of the type tag to its component is declared.
    // The shell carries a Puzzle<unknown> because it deliberately cannot know what any
    // type's data looks like, and this is the single line that asserts goFigure's board
    // gets goFigure's data.
    Component: GoFigureBoard as PuzzleComponent,
    icon: 'M5 12h14M12 5v14',
    label: 'goFigure',
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
export const entryFor = (type: string): RegistryEntry | undefined => (REGISTRY as Record<string, RegistryEntry>)[type]
