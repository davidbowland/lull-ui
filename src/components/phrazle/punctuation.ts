import { normalizeAnswer } from '@rules/normalize-answer'

/**
 * The marks the pack's answer draws around each word's tiles, gap by gap.
 *
 * `gaps[w][k]` is the marks drawn just before letter k of word w, so `gaps[w][0]` leads the word,
 * `gaps[w][word.length]` trails it, and every index between is a mark inside it -- HERE'S puts its
 * apostrophe at `gaps[0][4]`. A mark is drawn but never typed and never counted as a tile: the
 * letters are still splitPhrase's, so the grid, the guess and markGuess all stay on canonical words.
 *
 * A letter is whatever normalizeAnswer keeps of a character, and splitPhrase is normalizeAnswer
 * over the same whitespace-split runs, so the walk yields exactly splitPhrase's words: the fold is
 * per character (NFD decomposes, uppercasing here has no context) and nothing it drops is a letter.
 * Combining accents fold away rather than being drawn as marks of their own.
 *
 * A run with no letters in it -- a lone dash -- is not a word to splitPhrase, so its marks lead the
 * next word, or trail the last one when nothing follows. The contract never ships one; dropping it
 * would hide text the pack shipped.
 */
export const punctuationOf = (answer: string): string[][][] => {
  const walked: string[][][] = []
  let pending: string[] = []
  for (const run of answer.split(/\s+/)) {
    const gaps: string[][] = [[]]
    for (const character of run) {
      const folded = normalizeAnswer(character)
      if (folded !== '') {
        for (let index = 0; index < folded.length; index++) gaps.push([])
      } else if (!/\p{M}/u.test(character)) {
        gaps[gaps.length - 1].push(character)
      }
    }
    // One gap and no letters: the run is not a word.
    if (gaps.length === 1) {
      pending = [...pending, ...gaps[0]]
      continue
    }
    gaps[0] = [...pending, ...gaps[0]]
    pending = []
    walked.push(gaps)
  }
  const last = walked.at(-1)
  if (last !== undefined) last[last.length - 1].push(...pending)
  return walked
}

/**
 * The answer as the board draws it: canonical letters with the marks back in their gaps, single
 * spaced. Built from the same gaps as the tiles, so the sentence and the grid cannot disagree.
 */
export const punctuatedPhrase = (words: string[], gaps: string[][][]): string =>
  words
    .map((word, index) =>
      [...word].reduce(
        (spelled, letter, at) => `${spelled}${letter}${gaps[index][at + 1].join('')}`,
        gaps[index][0].join(''),
      ),
    )
    .join(' ')
