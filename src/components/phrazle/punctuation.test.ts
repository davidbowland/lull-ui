import { splitPhrase } from '@rules/is-valid-guess'

import { punctuatedPhrase, punctuationOf } from './punctuation'

describe('punctuationOf', () => {
  it('draws no marks on a plain answer', () => {
    expect(punctuationOf('TOE HOLD')).toEqual([
      [[], [], [], []],
      [[], [], [], [], []],
    ])
  })

  // HERE'S is H, E, R, E, then the apostrophe, then S: gap 4 of a five-letter word.
  it('puts an apostrophe in the gap between the letters it sits between', () => {
    expect(punctuationOf("HERE'S")).toEqual([[[], [], [], [], ["'"], []]])
  })

  it('puts a trailing mark after the last letter', () => {
    expect(punctuationOf('YOU, KID')).toEqual([
      [[], [], [], [',']],
      [[], [], [], []],
    ])
  })

  it('keeps every apostrophe and the trailing mark in one word', () => {
    expect(punctuationOf("Y'ALL'D?")).toEqual([[[], ["'"], [], [], ["'"], ['?']]])
  })

  it('agrees with splitPhrase on the letters of every word', () => {
    const answer = "HERE'S LOOKING AT YOU, KID"
    expect(punctuationOf(answer).map((gaps) => gaps.length - 1)).toEqual(splitPhrase(answer).map((word) => word.length))
  })

  it('folds an accent into its letter rather than drawing it', () => {
    expect(punctuationOf('CAFÉ!')).toEqual([[[], [], [], [], ['!']]])
  })

  it('carries a run with no letters into the word after it', () => {
    expect(punctuationOf('GO - NOW')).toEqual([
      [[], [], []],
      [['-'], [], [], []],
    ])
  })

  it('closes the last word with a run that has no word after it', () => {
    expect(punctuationOf('GO NOW !')).toEqual([
      [[], [], []],
      [[], [], [], ['!']],
    ])
  })

  it('draws nothing for an answer that never arrived', () => {
    expect(punctuationOf('')).toEqual([])
  })
})

describe('punctuatedPhrase', () => {
  it('spells the answer as the board draws it', () => {
    const answer = "HERE'S  LOOKING AT YOU, KID"
    expect(punctuatedPhrase(splitPhrase(answer), punctuationOf(answer))).toBe("HERE'S LOOKING AT YOU, KID")
  })

  it('spells a plain answer as its canonical words', () => {
    expect(punctuatedPhrase(['TOE', 'HOLD'], punctuationOf('TOE HOLD'))).toBe('TOE HOLD')
  })
})
