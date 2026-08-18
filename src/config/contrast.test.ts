import { DARK, LIGHT, Palette } from './colors'
import { contrastRatio } from './contrast'

// The palette in colors.ts is provisional and will be redesigned. These assertions are
// not: they are the WCAG AA floor the repo's own guidelines set, expressed so that a
// later colour change fails here rather than shipping.
describe('contrastRatio', () => {
  it('reports 21:1 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
  })

  it('reports 1:1 for a colour against itself', () => {
    expect(contrastRatio('#2f5d8a', '#2f5d8a')).toBeCloseTo(1, 5)
  })

  it('is order-independent', () => {
    expect(contrastRatio('#1b1b18', '#f5f5f3')).toEqual(contrastRatio('#f5f5f3', '#1b1b18'))
  })
})

describe.each([
  ['light', LIGHT],
  ['dark', DARK],
])('%s palette', (_name: string, palette: Palette) => {
  it.each([
    ['ink on page', 'ink', 'page'],
    ['ink on surface', 'ink', 'surface'],
    ['muted ink on page', 'inkMuted', 'page'],
    ['muted ink on surface', 'inkMuted', 'surface'],
    ['accent ink on accent', 'accentInk', 'accent'],
    ['accent as text on page', 'accent', 'page'],
    ['accent as text on surface', 'accent', 'surface'],
  ])('clears 4.5:1 for %s', (_pair: string, ink: string, ground: string) => {
    expect(contrastRatio(palette[ink as keyof Palette], palette[ground as keyof Palette])).toBeGreaterThanOrEqual(4.5)
  })

  // 1.4.11 Non-text Contrast. A control outline a player cannot see is a control they
  // cannot find, which is the same failure as unreadable type one level down.
  it.each([
    ['border on page', 'page'],
    ['border on surface', 'surface'],
  ])('clears 3:1 for %s', (_pair: string, ground: string) => {
    expect(contrastRatio(palette.border, palette[ground as keyof Palette])).toBeGreaterThanOrEqual(3)
  })
})
