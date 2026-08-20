import { entryFor, REGISTRY } from './index'
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

  // Opt-in per entry. Absent means today's flow, which is what keeps goFigure and Missing Vowels
  // untouched by a layout that exists for one type.
  it('asks for the docked layout for cryptogram', () => {
    expect(REGISTRY.cryptogram.layout).toBe('docked')
  })

  it('leaves goFigure on the default flow', () => {
    expect(REGISTRY.gofigure.layout).toBeUndefined()
  })

  it('leaves missing vowels on the default flow', () => {
    expect(REGISTRY.missingvowels.layout).toBeUndefined()
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
})
