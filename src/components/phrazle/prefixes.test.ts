import { startsSomeWord } from './prefixes'

describe('startsSomeWord', () => {
  // Deliberately unsorted, so the build has to sort, and holding TOD's longer neighbor TODAY so the
  // length clause has something to refuse.
  const dictionary: ReadonlySet<string> = new Set(['TOE', 'HOLD', 'TODAY', 'ABE', 'ZOO', 'HAND', 'TEA'])

  it.each([
    ['T', 3],
    ['TO', 3],
    ['TOE', 3],
    ['HO', 4],
    ['TOD', 5],
  ])('finds a word of length %#: %s in %i letters', (prefix, length) => {
    expect(startsSomeWord(prefix, length, dictionary)).toBe(true)
  })

  it.each([
    ['TX', 3],
    ['TOD', 3],
    ['TOEX', 4],
    ['HE', 4],
    ['ZOP', 3],
  ])('refuses %s in %i letters', (prefix, length) => {
    expect(startsSomeWord(prefix, length, dictionary)).toBe(false)
  })

  // THE TWO ENDS OF A BUCKET, where a lower-bound search most often goes wrong: a prefix sorting
  // before every word, and one sorting after every word, which lands past the end of the array.
  it('handles prefixes that sort before the first word and after the last', () => {
    expect(startsSomeWord('A', 3, dictionary)).toBe(true)
    expect(startsSomeWord('AA', 3, dictionary)).toBe(false)
    expect(startsSomeWord('ZOO', 3, dictionary)).toBe(true)
    expect(startsSomeWord('ZZ', 3, dictionary)).toBe(false)
  })

  it('finds nothing for a length the list has no words of', () => {
    expect(startsSomeWord('', 9, dictionary)).toBe(false)
  })

  // The board's floor: handed no dictionary, it reads an empty set, and nothing is a live prefix.
  it('finds nothing in an empty list, even for an empty prefix', () => {
    expect(startsSomeWord('', 3, new Set())).toBe(false)
  })

  // A NEW SET IS A NEW DICTIONARY. The cache is keyed on identity, so a second set with different
  // words must be answered from its own words and not from the first set's arrays.
  it('answers each set from its own words', () => {
    expect(startsSomeWord('Q', 3, dictionary)).toBe(false)
    expect(startsSomeWord('Q', 3, new Set(['QAT']))).toBe(true)
  })
})
