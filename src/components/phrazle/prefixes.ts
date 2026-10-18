// WHETHER A HALF-TYPED WORD CAN STILL BECOME A WORD IN THE LIST, answered in O(log n) per keystroke.
//
// NOT A RULE, and it does not live in src/rules/ for the reason CLAUDE.md gives: nothing in
// lull-api/src/ imports it. It never decides whether a guess is accepted -- isValidGuess still does
// that at Guess -- it only lets the board say "no" a few letters earlier than the gate would. A
// prefix that survives here can still be refused at Guess, and a complete word is never judged by
// this file: the board asks everyWordInDictionary about those, so the verdict on a finished word is
// the rule's verdict and nobody else's.
//
// SORTED ARRAYS, ONE PER WORD LENGTH, rather than a trie or a set of every prefix. The list runs to
// about 52,000 words; a prefix set would hold several times that many strings, and a trie is a
// structure to maintain. A sorted array answers "does any word start with P" with one binary search:
// find the first word not less than P, and P is a live prefix exactly when that word starts with P,
// because every word that starts with P sorts into one contiguous run beginning there. Splitting by
// length first is what makes the answer "a word of THIS length", which is the only question a slot
// on the board can ask -- TOD starts TODAY, and TODAY does not fit a three-letter slot.
//
// `sort()` WITH NO COMPARATOR AND `<` IN THE SEARCH, and the pair must not be split. Both order by
// UTF-16 code unit, so the array is sorted by the same relation the search walks it with. A
// localeCompare on either side alone would put the run somewhere the other does not look.
//
// CACHED PER SET, weakly. The shell hands the board one live Set and keeps handing it the same one,
// so the arrays are built once per dictionary rather than once per mount, and a superseded
// dictionary takes its arrays with it when it is collected. Rebuilding on identity rather than on
// content is right for the same reason: a new Set is a new dictionary.
const cache = new WeakMap<ReadonlySet<string>, Map<number, string[]>>()

const byLength = (dictionary: ReadonlySet<string>): Map<number, string[]> => {
  const cached = cache.get(dictionary)
  if (cached !== undefined) return cached

  const built = new Map<number, string[]>()
  for (const word of dictionary) {
    const bucket = built.get(word.length)
    if (bucket === undefined) built.set(word.length, [word])
    else bucket.push(word)
  }
  for (const bucket of built.values()) bucket.sort()
  cache.set(dictionary, built)
  return built
}

/**
 * Whether some word of exactly `length` letters in `dictionary` starts with `prefix`.
 *
 * Case-sensitive, like everyWordInDictionary: the board hands it canonical uppercase letters and the
 * list is uppercase. An empty prefix is live whenever the list has any word of that length.
 */
export const startsSomeWord = (prefix: string, length: number, dictionary: ReadonlySet<string>): boolean => {
  const words = byLength(dictionary).get(length) ?? []
  let low = 0
  let high = words.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (words[middle] < prefix) low = middle + 1
    else high = middle
  }
  return low < words.length && words[low].startsWith(prefix)
}
