import { BENCH_ORDER, entryFor, REGISTRY } from './index'
import { CrypticClueBoard } from '@components/crypticclue'
import { CryptogramBoard } from '@components/cryptogram'
import { GoFigureBoard } from '@components/gofigure'
import { ThemedAnagramsBoard } from '@components/themedanagrams'

describe('registry', () => {
  it('maps goFigure to its board', () => {
    expect(REGISTRY.gofigure.Component).toBe(GoFigureBoard)
  })

  it('gives the type a name a reader can see', () => {
    expect(REGISTRY.gofigure.label).toBe('Go Figure!')
  })

  // The icon is decoration. It is rendered inside an aria-hidden <svg> beside the label
  // above, never on its own -- a glyph with no words is unreadable to half the people
  // this app has to work for.
  //
  // LENGTH, never `expect.any(String)`. The field is typed `string` and required, so the compiler
  // already guarantees everything a type assertion could check -- delete the designed path, leave
  // `icon: ''`, and a test asserting its type stays green while the shelf draws nothing. The glyph
  // test below got this right and these three did not; they are the same assertion now.
  it('gives the type an icon', () => {
    expect(REGISTRY.gofigure.icon.length).toBeGreaterThan(0)
  })

  it('maps cryptic clue to its board', () => {
    expect(REGISTRY.crypticclue.Component).toBe(CrypticClueBoard)
  })

  it('gives cryptic clue a name a reader can see', () => {
    expect(REGISTRY.crypticclue.label).toBe('Cryptic Clue')
  })

  // Required on the entry and drawn by nothing in src/ today -- the shelf draws `glyph`. Asserted
  // anyway, exactly as goFigure's is, because the field is required by the type and a type that
  // requires a field nobody supplies is the next reader's hour.
  it('gives cryptic clue an icon', () => {
    expect(REGISTRY.crypticclue.icon.length).toBeGreaterThan(0)
  })

  it('maps cryptogram to its board', () => {
    expect(REGISTRY.cryptogram.Component).toBe(CryptogramBoard)
  })

  it('gives cryptogram a name a reader can see', () => {
    expect(REGISTRY.cryptogram.label).toBe('Cryptogram')
  })

  it('maps themed anagrams to its board', () => {
    expect(REGISTRY.themedanagrams.Component).toBe(ThemedAnagramsBoard)
  })

  it('gives themed anagrams a name a reader can see', () => {
    expect(REGISTRY.themedanagrams.label).toBe('Themed Anagrams')
  })

  // Required on the entry and drawn by nothing in src/ today -- the shelf draws `glyph`. Asserted
  // anyway, exactly as the other entries' are, because the field is required by the type and a type
  // that requires a field nobody supplies is the next reader's hour.
  it('gives themed anagrams an icon', () => {
    expect(REGISTRY.themedanagrams.icon.length).toBeGreaterThan(0)
  })

  it('gives phrazle a name a reader can see', () => {
    expect(REGISTRY.phrazle.label).toBe('Phrazle')
  })

  // The fifth entry to get this, and the last one that was missing it. Same assertion, same reason:
  // the field is required by the type, drawn by nothing in src/ today, and a required field nobody
  // supplies is the next reader's hour. Length rather than `expect.any(String)`, because the
  // compiler already makes the type claim and `icon: ''` would sail through one.
  it('gives phrazle an icon', () => {
    expect(REGISTRY.phrazle.icon.length).toBeGreaterThan(0)
  })

  // The one entry in the registry that answers true, and the field exists for exactly this type
  // today. Asserted as a value rather than as "some entry needs one", because the shelf and the
  // frame both branch on it and a `false` here is a row that links to a board the shell will
  // refuse to mount -- an invitation to a dead end.
  it('says phrazle needs the dictionary and that nothing else does', () => {
    expect(REGISTRY.phrazle.needsDictionary).toBe(true)
    expect(Object.values(REGISTRY).filter((entry) => entry.needsDictionary)).toHaveLength(1)
  })

  it('finds the entry for a known type', () => {
    expect(entryFor('gofigure')).toBe(REGISTRY.gofigure)
  })

  // A pack is JSON from the network, so it can name a type this build has never heard
  // of -- a new generator shipped by lull-api before the UI that renders it. The caller
  // has to be able to see that and say so, rather than destructure undefined and
  // throw in render, which ErrorBoundary answers by replacing the whole app.
  it('has nothing for a type it does not know', () => {
    expect(entryFor('crossword')).toBeUndefined()
  })

  // Object.hasOwn, not a plain index. Every object inherits `constructor`, so `REGISTRY`
  // indexed by that string returns a function -- which passes an `entry === undefined` guard
  // and then white-screens the frame on <Component /> where Component is undefined. `type`
  // comes off the network, so this is reachable from a pack.
  it('has nothing for an inherited property name', () => {
    expect(entryFor('constructor')).toBeUndefined()
  })
})

describe('benches', () => {
  it('gives every type a bench', () => {
    expect(entryFor('cryptogram')?.bench).toBe('cipher')
    expect(entryFor('crypticclue')?.bench).toBe('writing')
    expect(entryFor('missingvowels')?.bench).toBe('writing')
    expect(entryFor('themedanagrams')?.bench).toBe('writing')
    expect(entryFor('gofigure')?.bench).toBe('tile')
    expect(entryFor('phrazle')?.bench).toBe('guess')
  })

  // The day sorts by DIFFICULTY, breaks that tie with BENCH_ORDER, and breaks whatever is left with
  // the puzzle id -- see `orderPuzzles` in components/shelf. It used to sort by estimated time, and
  // this comment used to say so; the sibling claim in registry/index.ts was corrected and this copy
  // was missed.
  //
  // A bench missing from the list does NOT bring the refetch shuffle back, either: `byId` is the
  // last term and ids are unique, so the comparator stays total. What it costs is that `benchRank`
  // buries the missing bench behind every declared one, so where those rows land is an accident
  // rather than a decision. A duplicate is the same bug wearing a different hat, so the length and
  // the set size have to agree too.
  it('orders every bench exactly once', () => {
    const benches = Object.values(REGISTRY).map((entry) => entry.bench)

    expect([...BENCH_ORDER].toSorted()).toEqual([...new Set(benches)].toSorted())
    expect(BENCH_ORDER.length).toBe(new Set(BENCH_ORDER).size)
  })

  it('draws a glyph for every type', () => {
    expect(Object.values(REGISTRY).every((entry) => entry.glyph.length > 0)).toBe(true)
  })
})
