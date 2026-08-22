import { BENCH_ORDER, entryFor, REGISTRY } from './index'
import { CryptogramBoard } from '@components/cryptogram'
import { GoFigureBoard } from '@components/gofigure'

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
  it('gives the type an icon', () => {
    expect(REGISTRY.gofigure.icon).toEqual(expect.any(String))
  })

  it('maps cryptogram to its board', () => {
    expect(REGISTRY.cryptogram.Component).toBe(CryptogramBoard)
  })

  it('gives cryptogram a name a reader can see', () => {
    expect(REGISTRY.cryptogram.label).toBe('Cryptogram')
  })

  it('finds the entry for a known type', () => {
    expect(entryFor('gofigure')).toBe(REGISTRY.gofigure)
  })

  // A pack is JSON from the network, so it can name a type this build has never heard
  // of -- a new generator shipped by lull-api before the UI that renders it. The caller
  // has to be able to see that and say so, rather than destructure undefined and
  // white-screen a page with no error boundary above it.
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
    expect(entryFor('missingvowels')?.bench).toBe('writing')
    expect(entryFor('gofigure')?.bench).toBe('tile')
  })

  // The day breaks ties in its estimated-time sort with BENCH_ORDER, so a bench missing from it
  // leaves two rows comparing equal and the order back at whatever the backend last sent --
  // the exact shuffle between refetches this order was added to stop. A duplicate is the same
  // bug wearing a different hat, so the length and the set size have to agree too.
  it('orders every bench exactly once', () => {
    const benches = Object.values(REGISTRY).map((entry) => entry.bench)

    expect([...BENCH_ORDER].toSorted()).toEqual([...new Set(benches)].toSorted())
    expect(BENCH_ORDER.length).toBe(new Set(BENCH_ORDER).size)
  })

  it('draws a glyph for every type', () => {
    expect(Object.values(REGISTRY).every((entry) => entry.glyph.length > 0)).toBe(true)
  })
})
