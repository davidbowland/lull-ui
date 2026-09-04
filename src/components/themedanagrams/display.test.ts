import { drawnRun, isGivenAway } from './display'
import { chooseThemedAnagramsRung, pinnedIndices, ThemedAnagramsSpentRung } from './rungs'

// MIN_WORD_LENGTH in lull-api's generators/themedanagrams/words.ts is 5, so LADLE is the shortest
// entry the generator can ship and the one where a third stacked rung would leave a single position
// free. Carried here from the rule's own suite along with the function these rows are about.
const SHORTEST = [{ answer: 'KETTLE' }, { answer: 'LADLE' }, { answer: 'GRATER' }, { answer: 'SKILLET' }]

const foldLadder = (entries: { answer: string }[], state: { solved: boolean[] }): ThemedAnagramsSpentRung[] => {
  const spent: ThemedAnagramsSpentRung[] = []
  let next = chooseThemedAnagramsRung(entries, state, spent)
  while (next !== null && spent.length < 3) {
    spent.push(next)
    next = chooseThemedAnagramsRung(entries, state, spent)
  }
  return spent
}

describe('drawnRun', () => {
  // THE FOUR ROWS BELOW CAME FROM `pinnedDisplay`'S OWN SUITE and are unchanged in what they assert.
  // `drawnRun` is that function plus one guarantee, and the guarantee is the identity on every run
  // that does not spell its answer -- which is every run here.
  it('pins the revealed initial and fills the rest in scramble order', () => {
    expect(drawnRun('SHOW', 'OSWH', new Set([0]))).toBe('SOWH')
  })

  it('pins both bookends and fills the gap', () => {
    expect(drawnRun('SHOW', 'OSWH', new Set([0, 3]))).toBe('SOHW')
  })

  it('returns the scramble untouched when nothing is pinned', () => {
    expect(drawnRun('SHOW', 'OSWH', new Set())).toBe('OSWH')
  })

  it('keeps the letter multiset of the answer', () => {
    expect([...drawnRun('KETTLE', 'ELETKT', new Set([0, 5]))].sort().join('')).toBe([...'KETTLE'].sort().join(''))
  })

  it('spends only one copy of a repeated pinned letter', () => {
    // KETTLE pins index 0 (K) and index 5 (E); one E stays in the pool for the middle.
    expect(drawnRun('KETTLE', 'ELETKT', new Set([0, 5]))).toHaveLength(6)
  })

  // THE ROW MUST NOT SPELL THE ANSWER, which is the whole reason this function exists beside
  // `pinnedDisplay` rather than instead of it. The fill takes the unpinned letters from the scramble
  // in the scramble's own order and never asks what that spells -- so a scramble whose leftovers
  // happen to fall into place printed the word on the plate, and the rung that bought two letters had
  // handed over six.
  //
  // SPATULA with the first three and the last pinned leaves T and U at positions 3 and 4, and the
  // scramble below offers them in exactly that order.
  it('does not draw the answer when the leftovers fall into place', () => {
    expect(drawnRun('SPATULA', 'TUSPALA', new Set([0, 1, 2, 6]))).toBe('SPAUTLA')
  })

  // ONE SWAP AND NOTHING ELSE MOVES. `pinnedDisplay`'s contract is that a hint moves only what it
  // bought, so the repair is the smallest one that can work: the first two unpinned positions holding
  // different letters trade places. Asserted as the exact string above and as the property here, so a
  // future implementation that picks a different pair still has to keep the tiles it did not touch.
  it('leaves every pinned tile where the rung put it', () => {
    const run = drawnRun('SPATULA', 'TUSPALA', new Set([0, 1, 2, 6]))

    expect([...run].filter((_letter, at) => new Set([0, 1, 2, 6]).has(at)).join('')).toBe('SPAA')
  })

  // A SETTLED ROW IS LEFT ALONE, and it has to be: there is no pair of differing letters to trade,
  // so a function that insisted on a swap here would either loop or lie. SEES with both S's pinned
  // leaves E and E, and the board hands that word over rather than drawing it -- see `isGivenAway`.
  it('draws a settled row as it falls, since there is nothing left to hide', () => {
    expect(drawnRun('SEES', 'ESSE', new Set([0, 3]))).toBe('SEES')
  })

  // THE PROPERTY, OVER EVERY LADDER THE CHOOSER CAN ACTUALLY PRODUCE, on the shortest board it can
  // ship -- which is where the pinned set is largest relative to the word and the leftovers are
  // fewest. It used to be asserted as "at least two tiles wrong", which was the two-free invariant
  // read off the plate; it is now the thing a player would notice, which is stronger and simpler.
  it.each([
    ['the shortest entry', 'LADLE', 'DELAL', [true, false, true, true] as boolean[], 1],
    ['a six-letter entry', 'KETTLE', 'ELETKT', [false, true, true, true] as boolean[], 0],
    ['a seven-letter entry', 'SKILLET', 'LTEKLIS', [true, true, true, false] as boolean[], 3],
  ])('never spells %s after the whole ladder', (_case, answer, scramble, solved, index) => {
    const spent = foldLadder(SHORTEST, { solved })

    expect(drawnRun(answer, scramble, pinnedIndices(spent, index, answer.length))).not.toBe(answer)
  })

  it('never throws on a run it cannot repair', () => {
    expect(() => drawnRun('', '', new Set([0]))).not.toThrow()
  })

  // A SCRAMBLE SHORTER THAN ITS ANSWER falls back to the answer's own letter for the positions the
  // pool cannot fill, which is the arrangement `pinnedDisplay` has always made. `canPin` on the board
  // keeps this function off such a row -- it compares the two lengths for exactly this reason, since a
  // run of the answer's length would otherwise add or drop tiles the player was counting -- so this
  // pins the fallback rather than a state a player can reach.
  it('falls back to the answer’s letter where the scramble runs out', () => {
    expect(drawnRun('SHOW', 'OS', new Set([0]))).toBe('SOOW')
  })
})

describe('isGivenAway', () => {
  const rung = (kind: ThemedAnagramsSpentRung['kind'], entryIndex = 0): ThemedAnagramsSpentRung => ({
    entryIndex,
    kind,
  })

  // ZERO POSITIONS LEFT. Everything the word has is pinned, so there is nothing to work out.
  it('calls a wholly pinned word given away', () => {
    expect(isGivenAway('SHOW', [rung('prefix3'), rung('final')], 0)).toBe(true)
  })

  // ONE POSITION LEFT. A gap that can hold only the one letter left in the row is not a gap, which is
  // the case that prompted this: five letters with the first three and the last pinned.
  it('calls a word with a single gap given away', () => {
    expect(isGivenAway('LADLE', [rung('prefix3'), rung('final')], 0)).toBe(true)
  })

  // THE DOUBLE-LETTER CASE, and the reason the rule counts distinct letters rather than positions.
  // SEES with both S's pinned leaves two positions and one letter to fill them, so every arrangement
  // spells the answer -- the row is as settled as one with a single gap, and `drawnRun` has nothing
  // it could rearrange to hide it.
  it('calls a word given away when every letter left is the same letter', () => {
    expect(isGivenAway('SEES', [rung('bookends')], 0)).toBe(true)
  })

  it('leaves a word with two different letters left to work out', () => {
    expect(isGivenAway('SPATULA', [rung('prefix3'), rung('final')], 0)).toBe(false)
  })

  // NOTHING PINNED IS NEVER GIVEN AWAY, and this is the clause that stops a board handing a row over
  // at mount. `data` is opaque JSON off the network, so a one-letter-repeated answer is representable
  // -- and under a rule stated over distinct letters alone it would arrive already solved, before the
  // player had bought anything.
  it('gives nothing away on a board with no rungs spent', () => {
    expect(isGivenAway('AAAAA', [], 0)).toBe(false)
    expect(isGivenAway('SPATULA', [], 0)).toBe(false)
  })

  // A rung names the entry it is aimed at, so a ladder that pinned row 0 says nothing about row 1.
  it('reads only the rungs aimed at this entry', () => {
    expect(isGivenAway('LADLE', [rung('prefix3', 1), rung('final', 1)], 0)).toBe(false)
  })

  // STRUCTURAL, in the register `isEntry` and `entriesOf` already use: isValidPuzzle leaves `data`
  // opaque, so the wire can deliver a number or nothing where a string is promised. A blank answer is
  // refused for its own reason -- `isRight` reports an empty guess as wrong, so a board that called it
  // given away would fill the box with '' and then draw no chip beside it.
  it('gives nothing away on an entry whose answer never arrived', () => {
    expect(isGivenAway(undefined, [rung('prefix3'), rung('final')], 0)).toBe(false)
    expect(isGivenAway(7, [rung('prefix3'), rung('final')], 0)).toBe(false)
    expect(isGivenAway('', [rung('prefix3'), rung('final')], 0)).toBe(false)
  })
})
