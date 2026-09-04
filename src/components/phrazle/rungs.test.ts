import { choosePhrazleRung, MAX_PHRAZLE_RUNG_LENGTH, phrazleHintFor, PhrazleSpentRung, seededRandom } from './rungs'

// RESTATED, NOT IMPORTED, because the gate it names is in the other repo: this is lull-api's
// generators/phrazle/difficulty.ts MAX_WORD_LETTERS, and this repo has no `@generators/...` to
// import from.
//
// AND IT IS NOW UNPINNED, which is a loss rather than a note. While this file lived in lull-api's
// vendored src/rules/ tests, hint-sweep.test.ts read this literal out of the SOURCE TEXT and asserted
// it against the generator's own constant -- the only arrangement that could catch someone editing
// the 11 below, since importing the restatement would have re-run this whole file inside that one.
// The sweep travelled here as test/rungs-sweep.test.ts and the generator's constant did not, so
// nothing compares them any more. lull-api keeps a plain `expect(MAX_WORD_LETTERS).toBe(11)` in its
// phrazle difficulty test naming this line; what joins the two halves now is two comments and a
// person who reads them.
//
// THE POST-MORTEM IS WHY THAT MATTERS: this literal once said 7, four below the real gate, and the
// rung cap was derived from the wrong number. That is the failure the old pin caught and this
// comment cannot.
const MAX_WORD_LETTERS = 11

// TOE HOLD. Present letters: T, O, E, H, L, D. Absent: everything else.
const DATA = { answer: 'TOE HOLD' }
const fresh = { guesses: [] }

// A fixed source so no test body calls Math.random. Cycles through a short list, which is enough to
// make the pick deterministic without pinning the shuffle's internals.
const fixedRandom = (): (() => number) => {
  let index = 0
  const values = [0.1, 0.4, 0.7, 0.2, 0.9, 0.5]
  return () => values[index++ % values.length]
}

describe('choosePhrazleRung', () => {
  it('opens with three letters that are absent from the phrase', () => {
    const rung = choosePhrazleRung(DATA, fresh, [], fixedRandom()) as { kind: string; letters: string }
    expect(rung.kind).toBe('absent')
    expect(rung.letters).toHaveLength(3)
    expect([...rung.letters].some((letter) => 'TOEHLD'.includes(letter))).toBe(false)
  })

  it('draws rung 1 only from common letters', () => {
    const rung = choosePhrazleRung(DATA, fresh, [], fixedRandom()) as { letters: string }
    // The ten strongest absent letters for TOE HOLD are A, R, I, N, S, C, U, P, M and G; J, Q, X and
    // Z are the four weakest in the table and can never reach that window.
    expect([...rung.letters].some((letter) => 'JQXZ'.includes(letter))).toBe(false)
  })

  it('follows with three letters that are present', () => {
    const spent: PhrazleSpentRung[] = [{ kind: 'absent', letters: 'AIR' }]
    const rung = choosePhrazleRung(DATA, fresh, spent, fixedRandom()) as { kind: string; letters: string }
    expect(rung.kind).toBe('present')
    expect([...rung.letters].every((letter) => 'TOEHLD'.includes(letter))).toBe(true)
  })

  it('picks the RAREST present letters for rung 2', () => {
    const spent: PhrazleSpentRung[] = [{ kind: 'absent', letters: 'AIR' }]
    const rung = choosePhrazleRung(DATA, fresh, spent, fixedRandom()) as { letters: string }
    // Of T O E H L D, the three weakest by the strength table are H, D and L, recorded alphabetized.
    expect([...rung.letters].sort().join('')).toBe('DHL')
  })

  it('closes with a word rung', () => {
    const spent: PhrazleSpentRung[] = [
      { kind: 'absent', letters: 'AIR' },
      { kind: 'present', letters: 'DHL' },
    ]
    expect(choosePhrazleRung(DATA, fresh, spent, fixedRandom())?.kind).toBe('word')
  })

  it('offers nothing beyond three rungs', () => {
    const spent: PhrazleSpentRung[] = [
      { kind: 'absent', letters: 'AIR' },
      { kind: 'present', letters: 'DHL' },
      { index: 0, kind: 'word' },
    ]
    expect(choosePhrazleRung(DATA, fresh, spent, fixedRandom())).toBeNull()
  })

  // THE COUNT GUARD, REACHED. The row above never touches it: that record holds one of each kind, so
  // the `used` checks refuse every branch below and the function returns null before `spent.length`
  // is consulted -- which left `spent.length >= RUNG_COUNT` dead to this suite, passing unchanged
  // when replaced by `if (false)`. Stored progress is untrusted, and a record naming ONE kind three
  // times is exactly what the guard's own comment says it is for: the present and word pools are
  // both full here, so without it this board buys a fourth rung.
  it('offers nothing beyond three rungs of one kind', () => {
    const spent: PhrazleSpentRung[] = [
      { kind: 'absent', letters: 'AIR' },
      { kind: 'absent', letters: 'CNS' },
      { kind: 'absent', letters: 'MPU' },
    ]
    expect(choosePhrazleRung(DATA, fresh, spent, fixedRandom())).toBeNull()
  })

  it('skips absent letters the player has already ruled out', () => {
    // Guessing SIR proves S, I and R are absent, so rung 1 must not spend itself on them.
    const played = { guesses: ['SIR RAIN'] }
    const rung = choosePhrazleRung(DATA, played, [], fixedRandom()) as { letters: string }
    expect([...rung.letters].some((letter) => 'SIRAN'.includes(letter))).toBe(false)
  })

  it('skips present letters the player has already seen colored', () => {
    const played = { guesses: ['DOE HOLD'] }
    const spent: PhrazleSpentRung[] = [{ kind: 'absent', letters: 'AIR' }]
    const rung = choosePhrazleRung(DATA, played, spent, fixedRandom()) as { letters: string }
    expect([...rung.letters].some((letter) => 'DOEHL'.includes(letter))).toBe(false)
  })

  // A BARREN POOL SKIPS A KIND, IT DOES NOT END THE LADDER. Rung 2's pool is the present letters the
  // player has not met, and a single guess touching all six empties it -- which under a positional
  // ladder killed the word rung too, permanently, for the one player it still helps.
  it('skips the present rung to the word rung when every present letter is known', () => {
    // DOT HELL touches T, O, E, H, L and D, which is every letter of TOE HOLD.
    const played = { guesses: ['DOT HELL'] }
    const spent: PhrazleSpentRung[] = [{ kind: 'absent', letters: 'AIR' }]
    expect(choosePhrazleRung(DATA, played, spent, fixedRandom())?.kind).toBe('word')
  })

  it('still reaches the word rung after the absent pool is skipped', () => {
    const played = { guesses: ['DOT HELL'] }
    const spent: PhrazleSpentRung[] = [
      { kind: 'absent', letters: 'AIR' },
      { index: 0, kind: 'word' },
    ]
    expect(choosePhrazleRung(DATA, played, spent, fixedRandom())).toBeNull()
  })

  it('uses each kind at most once', () => {
    const spent: PhrazleSpentRung[] = [{ index: 0, kind: 'word' }]
    const rung = choosePhrazleRung(DATA, fresh, spent, fixedRandom()) as PhrazleSpentRung
    expect(rung.kind).toBe('absent')
  })

  it('offers nothing when no kind has anything left', () => {
    // Every word is a single letter the player has already met, so the word rung is all that is left
    // -- and once it is spent alongside the other two, nothing is.
    const spent: PhrazleSpentRung[] = [
      { kind: 'absent', letters: 'AIR' },
      { kind: 'present', letters: 'DHL' },
      { index: 0, kind: 'word' },
    ]
    expect(choosePhrazleRung(DATA, { guesses: ['DOT HELL'] }, spent, fixedRandom())).toBeNull()
  })
})

// Every shape the chooser can be asked about: a fresh board, a board whose guesses have emptied one
// pool, and two answers whose letter sets are the awkward ones.
const LADDERS: [string, string, string[]][] = [
  ['a fresh board', 'TOE HOLD', []],
  ['one guess', 'TOE HOLD', ['ATE MILD']],
  ['every present letter met', 'TOE HOLD', ['DOT HELL']],
  ['several guesses', 'TOE HOLD', ['ATE MILD', 'DOT HELL', 'SUN GRIP']],
  ['a phrase of common letters', 'RATIO SENATE', []],
  ['the longest legal word', 'OUTSTANDING WORK', []],
]

const foldLadder = (answer: string, guesses: string[]): PhrazleSpentRung[] => {
  const random = fixedRandom()
  const spent: PhrazleSpentRung[] = []
  let next = choosePhrazleRung({ answer }, { guesses }, spent, random)
  while (next !== null && spent.length < 3) {
    spent.push(next)
    next = choosePhrazleRung({ answer }, { guesses }, spent, random)
  }
  return spent
}

describe('escalation', () => {
  // WHAT A RUNG YIELDS ON THIS TYPE, MEASURED AGAINST THE ANSWER rather than declared.
  //
  // THE TABLE THAT STOOD HERE COULD NOT FAIL. It was `{ absent: 1, present: 2, word: 3 }` -- the
  // chooser's own preference order, restated by hand -- so the two rows below were asking whether a
  // list built in preference order was in preference order, and they were green whatever the rungs
  // turned out to be worth. The comment above them claimed a property over what a rung is WORTH,
  // which is the thing the table was standing in for.
  //
  // THE CURRENCY IS CELLS OF THE ANSWER THE RUNG NAMES, worked out in the hand. Three absent letters
  // name none: they say what not to spend a guess on, which prunes the search and hands over no part
  // of the phrase. Three present letters name every cell holding one of them -- the player learns
  // those letters are in there, and where they are not is the tile grid's job. A word's letters, as a
  // multiset, name every cell of that word: the player is left with an ordering problem over a known
  // bag, which on a short word is a lookup. That last one is the giveaway and nothing else is close.
  const wordsIn = (answer: string): string[] =>
    answer
      .toUpperCase()
      .split(/[^A-Z]+/)
      .filter((word) => word.length > 0)

  const yieldOf = (answer: string, rung: PhrazleSpentRung): number => {
    const letters = answer.toUpperCase().replace(/[^A-Z]/g, '')
    if (rung.kind === 'absent') return 0
    if (rung.kind === 'present') {
      return [...letters].filter((letter) => rung.letters.includes(letter)).length
    }
    return (wordsIn(answer)[rung.index] ?? '').length
  }

  // NO LADDER OPENS WITH ITS STRONGEST RUNG, and the giveaway is last. Stated as a property over what
  // the rungs are WORTH rather than as an order over which kind sits at which index -- the latter is
  // the implementation restated, and it passes whatever the rungs turn out to be worth.
  it.each(LADDERS)('opens with a weakest rung and closes with a strongest on %s', (_case, answer, guesses) => {
    const yields = foldLadder(answer, guesses).map((rung) => yieldOf(answer, rung))

    expect(yields[0]).toBe(Math.min(...yields))
    expect(yields[yields.length - 1]).toBe(Math.max(...yields))
  })

  it.each(LADDERS)('never steps back down the ladder on %s', (_case, answer, guesses) => {
    const yields = foldLadder(answer, guesses).map((rung) => yieldOf(answer, rung))

    expect(yields.filter((count, index) => index > 0 && count < yields[index - 1])).toStrictEqual([])
  })

  // THE WORD RUNG IS LAST OR NOWHERE. `at(-1)` rather than an index, because the ladder's length
  // varies: a pool a diligent player has emptied shortens it to two.
  it.each(LADDERS)('puts the word rung last or not at all on %s', (_case, answer, guesses) => {
    const ladder = foldLadder(answer, guesses)

    expect(ladder.filter((rung) => rung.kind === 'word')).toStrictEqual(
      ladder.at(-1)?.kind === 'word' ? [ladder.at(-1)] : [],
    )
  })

  // ONE TO THREE RUNGS, never empty and never the same sentence twice. The word rung's pool cannot
  // run dry on a phrase with a word in it, so the lower bound is structural.
  it.each(LADDERS)('ships one to three distinct rungs on %s', (_case, answer, guesses) => {
    const texts = foldLadder(answer, guesses).map((rung) => phrazleHintFor({ answer }, rung).text)

    expect(texts.length).toBeGreaterThanOrEqual(1)
    expect(texts.length).toBeLessThanOrEqual(3)
    expect(new Set(texts).size).toBe(texts.length)
  })

  it.each(LADDERS)('uses each kind at most once on %s', (_case, answer, guesses) => {
    const kinds = foldLadder(answer, guesses).map((rung) => rung.kind)

    expect(new Set(kinds).size).toBe(kinds.length)
  })
})

describe('seededRandom', () => {
  it('is deterministic for one seed', () => {
    const left = seededRandom('2026-08-31:phrazle:abcd1234')
    const right = seededRandom('2026-08-31:phrazle:abcd1234')
    expect([left(), left(), left()]).toStrictEqual([right(), right(), right()])
  })

  it('differs between seeds', () => {
    expect(seededRandom('one')()).not.toBe(seededRandom('two')())
  })

  it('stays inside the unit interval', () => {
    const random = seededRandom('seed')
    const drawn = Array.from({ length: 50 }, () => random())
    expect(drawn.every((value) => value >= 0 && value < 1)).toBe(true)
  })
})

describe('phrazleHintFor', () => {
  it('names the absent letters', () => {
    expect(phrazleHintFor(DATA, { kind: 'absent', letters: 'AIR' }).text).toBe('The phrase has no A, no I, and no R.')
  })

  it('names the present letters', () => {
    expect(phrazleHintFor(DATA, { kind: 'present', letters: 'DHL' }).text).toBe('The phrase contains D, H, and L.')
  })

  it('gives one word its letters, alphabetized', () => {
    expect(phrazleHintFor(DATA, { index: 1, kind: 'word' }).text).toBe(
      'Word 2 uses these letters, alphabetized: D, H, L, and O.',
    )
  })

  it('says the order is alphabetical, so the list cannot be read as the spelling', () => {
    expect(phrazleHintFor(DATA, { index: 1, kind: 'word' }).text).toContain('alphabetized')
  })

  it('lists a repeated letter once per occurrence', () => {
    expect(phrazleHintFor({ answer: 'BANANA STAND' }, { index: 0, kind: 'word' }).text).toBe(
      'Word 1 uses these letters, alphabetized: A, A, A, B, N, and N.',
    )
  })

  it('numbers the word from one', () => {
    expect(phrazleHintFor(DATA, { index: 0, kind: 'word' }).text).toMatch(/^Word 1\b/)
  })

  // "A and B", never "A, and B". The serial comma joins a list of three or more; on two items it is
  // a comma splice, and lull-ui's own utils/hints.ts joiner has always got this right.
  it.each([
    ['absent', DATA, { kind: 'absent', letters: 'AI' } as PhrazleSpentRung, 'The phrase has no A and no I.'],
    ['present', DATA, { kind: 'present', letters: 'DH' } as PhrazleSpentRung, 'The phrase contains D and H.'],
    [
      'word',
      { answer: 'AT ONE' },
      { index: 0, kind: 'word' } as PhrazleSpentRung,
      'Word 1 uses these letters, alphabetized: A and T.',
    ],
  ])('joins a two-item %s list with "and" and no comma', (_kind, data, rung, expected) => {
    expect(phrazleHintFor(data, rung).text).toBe(expected)
  })

  it('replays a frozen rung as one fixed sentence', () => {
    expect(phrazleHintFor(DATA, { kind: 'absent', letters: 'AIR' }).text).toBe('The phrase has no A, no I, and no R.')
  })

  // THE EMPTY-WORD FALLBACK, AND IT IS REACHABLE. `spent` is a stored record a player can hand-edit,
  // so a word index past the end of the phrase is an input this composer receives. It was covered
  // only by a `not.toThrow()` row, which passes for every string a composer could produce -- swapping
  // `?? ''` for `?? 'XX'` killed nothing. The SENTENCE is what a player reads, so the sentence is
  // what is pinned, and the empty list after the colon is the honest rendering of a word that is not
  // there.
  it('renders a word index past the end of the phrase as an empty list', () => {
    expect(phrazleHintFor(DATA, { index: 9, kind: 'word' }).text).toBe('Word 10 uses these letters, alphabetized: .')
  })

  // WHAT THE BOARD ALREADY DRAWS, and this row is the negative match that fails if a rung starts
  // naming it. The tile grid IS the enumeration: a player can count the rows, the words and the
  // letters in each straight off their own screen, so any number a rung carried would be a number
  // they have. The row it replaced matched `three|four|five|six|seven|eight` against sentences that
  // could not contain one and omitted one, two, nine, ten, eleven and every digit, so it defended
  // nothing.
  //
  // `Word 2` IS THE ONE NUMBER A RUNG MAY CARRY, and it is cut before the match: it names WHICH word
  // the rung is about rather than how long anything is, and without it the sentence names no word at
  // all.
  const boardNumbers = (text: string): string[] =>
    text
      .replace(/^Word \d+ /, '')
      .match(/\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|long|length|\d+)\b/gi) ?? []

  it.each(LADDERS)('states no length, count or enumeration on %s', (_case, answer, guesses) => {
    const found = foldLadder(answer, guesses).flatMap((rung) => boardNumbers(phrazleHintFor({ answer }, rung).text))

    expect(found).toStrictEqual([])
  })

  // THE COLORED TILES ARE THE OTHER HALF OF WHAT THE BOARD DRAWS. A letter the player has already
  // played has been answered on their screen one way or the other, so a rung naming it spends itself
  // on a fact they hold -- which is the whole reason these builders take player state at all. The
  // word rung is exempt: its subject is a WORD's multiset, and which letters sit in which word is
  // exactly what the tiles do not say.
  it.each(LADDERS)('names no letter the player has already played on %s', (_case, answer, guesses) => {
    const played = new Set(guesses.join('').replace(/[^A-Z]/g, ''))
    const named = foldLadder(answer, guesses)
      .filter((rung) => rung.kind !== 'word')
      .flatMap((rung) => [...(rung as { letters: string }).letters])

    expect(named.filter((letter) => played.has(letter))).toStrictEqual([])
  })

  // MAX_WORD_LETTERS in generators/phrazle/difficulty.ts is 11, so an eleven-letter word is the
  // longest word sentence a legal Phrazle can produce. Imported rather than restated so the row
  // moves if the structural floor does -- and it is asserted against the fixture, because a row
  // claiming to test the ceiling while standing well below it is worse than no row at all.
  //
  // THREE CHARACTERS OF HEADROOM, so this is a real ceiling and not a formality: 77 against a cap of
  // 80. The exact string is pinned beside the length for the same reason.
  it('stays within the cap on the longest legal word', () => {
    const longest = { answer: 'OUTSTANDING WORK' }
    const text = phrazleHintFor(longest, { index: 0, kind: 'word' }).text
    expect('OUTSTANDING'.length).toBe(MAX_WORD_LETTERS)
    expect(text).toBe('Word 1 uses these letters, alphabetized: A, D, G, I, N, N, O, S, T, T, and U.')
    expect(text).toHaveLength(77)
    expect(text.length).toBeLessThanOrEqual(MAX_PHRAZLE_RUNG_LENGTH)
  })

  // THE OTHER HALF OF THIS PIN IS IN THE OTHER REPO, and it is now a manual link. 80 is lull-api's
  // MAX_GLOSS_LENGTH in generators/crypticclue/hints.ts -- one number, so that every rung the hint
  // bar prints fits the same line as every gloss it prints. While this rule was vendored, lull-api's
  // crypticclue hints test asserted the two equal in one expression; the rule left and the assertion
  // could not follow, so each repo now pins its own to 80 and names the other.
  //
  // A ROW ABOUT A NUMBER RATHER THAN ABOUT BEHAVIOR, deliberately. Nothing else here would fail if
  // the cap moved to 90: the ceiling row above asserts 77 <= cap, which stays true. This is the row
  // that turns "the caps agreed" into something a reader can find from either side.
  it('holds the cap at the gloss length lull-api pins from its own side', () => {
    expect(MAX_PHRAZLE_RUNG_LENGTH).toBe(80)
  })
})

describe('totality', () => {
  it('never throws, however malformed the input', () => {
    const broken = { answer: '' }
    expect(() => choosePhrazleRung(broken, fresh, [], fixedRandom())).not.toThrow()
    expect(() => phrazleHintFor(broken, { index: 9, kind: 'word' })).not.toThrow()
    expect(() => phrazleHintFor(broken, { kind: 'absent', letters: '' })).not.toThrow()
  })
})
