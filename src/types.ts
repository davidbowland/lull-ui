import type { FC } from 'react'

// ============================================================================
// Copied verbatim from lull-api/src/types.ts. Do not edit here — edit there and
// copy across, so the two repos cannot drift. The comments come with the copy:
// they document the contract, not the code.
// ============================================================================

// Packs

// A UTC calendar date, YYYY-MM-DD. Never derived from a local-time Date.
export type PackDate = string

// It grows one member per board, because REGISTRY is Record<PuzzleType, RegistryEntry> and a member
// with no board is a compile error.
export type PuzzleType = 'gofigure' | 'missingvowels' | 'cryptogram' | 'themedanagrams' | 'crypticclue' | 'phrazle'

// Within-type: a 4 goFigure is hard for a goFigure and is not comparable to a 4 of another type.
export type Difficulty = 1 | 2 | 3 | 4 | 5

export interface Puzzle<T = unknown> {
  // `${date}:${type}:${shortId}` -- opaque, never positional. Difficulty is a generation input,
  // passed in; identity is an address, generated once.
  id: string
  type: PuzzleType
  difficulty: Difficulty
  estimatedSeconds: number
  data: T
}

export interface Pack {
  date: PackDate
  complete: boolean
  puzzles: Puzzle[]
}

// What every HINTED puzzle carries, which today is every puzzle type. It lives HERE rather than in
// the phrase section below because it is not a phrase type's business: it is the base the shared UI
// shell reads to find hints without knowing the type, and `hints` is the ONLY thing it needs for
// that job. The ladder is exactly three rungs by HintLadder above, and each rung's shape is fixed by
// CLAUDE.md ("Every hint on the wire is { text, metadata? }").
//
// It ships with two conforming implementations rather than as a base nothing reads: GoFigureData
// already satisfies it without knowing it, because GoFigureHintLadder is assignable to HintLadder.
export interface HintedPuzzleData {
  hints: HintLadder
}

// goFigure

export type Operator = '+' | '-' | '*' | '/'

export type OperatorSlot = 0 | 1 | 2

// The two facts a rung reveals, plus the tag that says which member of HintMetadata this is.
//
// `kind` is REQUIRED and its value is fixed by the union's naming rule: `${PuzzleType}-${role}`, so
// `gofigure-operator`. The role segment is required even though goFigure has exactly one member
// today, because a SECOND member of the same type is the case a bare type tag cannot express -- and
// that case is the rejected elimination rung, which the second paragraph below places on the axis
// `kind` is NOT. Nothing in this repo describes that rung further; it was never built.
//
// AN EARLIER VERSION OF THIS COMMENT argued there is no discriminator, on the ground that "the
// presence of `operator` is what says this is an operator rung". That reasoning is sound for ONE
// alternative member and does not survive two arriving in one phase: Themed Anagrams contributes
// { entryIndex, reveal } and Phrazle { wordIndex, position, letter }, which are the same shape --
// { index-into-the-board, what-is-revealed } -- and nothing structural separates them.
//
// The WITHIN-goFigure half of that argument is untouched and still holds: a rejected elimination
// rung is a variant axis INSIDE one type and would join structurally. `kind` is the TYPE axis.
//
// A PREVIOUS VERSION OF THIS TYPE HAD NO `text`, on the grounds that lull-ui could compose the
// sentence from these two fields and that wording is not rule. That was the one deliberate exception
// made to "the backend decides; the UI displays", and it is REVERSED. Text is authored here again,
// in hints.ts, and this structure rides alongside it as `metadata`. CLAUDE.md now carries the rule
// ("Every hint on the wire is { text, metadata? }") so the exception is not reintroduced by someone
// noticing that these two fields determine the sentence.
export interface GoFigureHintMetadata {
  kind: 'gofigure-operator'
  // What the board does with this is the board's business. No cell index and no row arithmetic --
  // lull-ui renders the working expression as one joined string and has no per-token cell.
  slot: OperatorSlot
  // ASCII, matching Operator, and never a board glyph: '/' ships as '/', not as U+00F7. The SAME
  // operator appears in the rung's `text` as a board glyph (+ − × ÷) and here as ASCII, in two
  // different alphabets, deliberately -- one is for reading, one is for the board.
  operator: Operator
}

// ONE RULE ON THE UNION, stated because three members are about to test it: `metadata` is a
// machine-readable RESTATEMENT of its own rung's `text`, never a superset. A renderer that prints
// only hint.text must work on every type, and a metadata field revealing more than its rung silently
// breaks that.
//
// The optional field on Hint also cannot keep goFigure structure OFF a phrase rung:
// `{ text, metadata }` satisfies `Hint`, so a cryptogram ladder carrying operator metadata
// typechecks. Only toHintLadder's discipline stops that, not the type.
// TAGGED, and a union of three as of Phrazle. Themed Anagrams is the commit that turned the
// discriminant from a convention into something the compiler can act on, because a `kind` on one arm
// narrows nothing and on two it narrows both. Every arm added since has been free: the narrowing was
// bought once and the third arm inherits it.
export type HintMetadata = GoFigureHintMetadata | PhrazleHintMetadata | ThemedAnagramsHintMetadata

// OPTIONAL here and required on the goFigure narrowing below. That is what lets a shared renderer
// typed on HintLadder read a hint without a type error while the board still gets a required field.
//
// `text` is authored by the backend and rendered VERBATIM. This app derives no hint copy.
// `metadata.operator` is ASCII and is never rendered as itself -- it goes through OPERATOR_SYMBOLS
// to draw a cell and OPERATOR_NAMES to name one.
export interface Hint {
  metadata?: HintMetadata
  text: string
}

export interface GoFigureHint extends Hint {
  metadata: GoFigureHintMetadata
}

export type GoFigureHintLadder = [GoFigureHint, GoFigureHint, GoFigureHint]

export interface GoFigureData {
  goal: number
  // REQUIRED. Every pack is rebuilt on deploy, so there is no puzzle without it and no reason for a
  // read site to branch on its absence.
  hints: GoFigureHintLadder
  bank: number[] // each digit used exactly once
  operators: Operator[] // reusable
  acceptedSolutions: string[] // e.g. "6+9+7*7"
}

// Themed Anagrams

// answer and scramble in ONE object, never two parallel arrays. Parallel arrays permit different
// lengths and permit an index skew, and a type that permits an invalid state will eventually hold
// one -- here that state is a board showing word 3's scramble above word 2's answer.
export interface AnagramEntry {
  answer: string // uppercase A-Z, 5-9 letters, the word the player types
  scramble: string // the same letter multiset, the same length, proved at construction
}

// No `answer` and no `category`. `answer` is defined above as THE ONE STRING THE PLAYER TYPES, and
// this type has four; the repeat unit is the THEME, which is why utils/exclusions.ts reads themes and
// words through two narrowed readers rather than through answerOf.
//
// The theme is ALWAYS SHOWN, at every difficulty. Hiding it is the Backlog's Scrambled Connections
// under another type's name, and mechanically it converts a one-answer puzzle into a several-answer
// one -- which breaks the Tier A claim rather than raising a difficulty. So there is no `category`
// field here and this type never imports generators/category-visibility.ts.
//
// RENDERED IN WIRE ORDER. The hint ladder's ordinals index this array, so a board that sorts entries
// by length -- the obvious tidy-up -- makes every rung point at the wrong row.
export interface ThemedAnagramsData extends HintedPuzzleData {
  entries: [AnagramEntry, AnagramEntry, AnagramEntry, AnagramEntry]
  theme: string
}

// The SECOND member of HintMetadata, and the one that makes the tag load-bearing.
export interface ThemedAnagramsHintMetadata {
  // Which row on the board this rung is about, 0-BASED. With four rows on screen, a rung the board
  // cannot attach to a row is a sentence the player has to re-solve before they can use it. The
  // ordinal rendered into `text` is entryIndex + 1: they are the same row expressed two ways, and a
  // client treating this as 1-based highlights the wrong row while printing the right sentence.
  entryIndex: number
  kind: 'themedanagrams-entry'
  // THE KIND OF REVEAL, never the revealed letters. Metadata restates its own rung; the letters are
  // already on the wire in entries[entryIndex].answer, and a second copy of them here is an
  // independent input describing the same fact that could disagree with it. A board reads `reveal`
  // and slices the answer itself.
  reveal: 'answer' | 'bookends' | 'initial'
}

// `metadata` narrowed from optional to REQUIRED, exactly as GoFigureHint does it.
export interface ThemedAnagramsHint extends Hint {
  metadata: ThemedAnagramsHintMetadata
}

export type ThemedAnagramsHintLadder = [ThemedAnagramsHint, ThemedAnagramsHint, ThemedAnagramsHint]

// Cryptic Clue

// Half-open [start, end) UTF-16 code-unit offsets into CrypticClueData.clue.
//
// COMPUTED IN CODE by locating the model's part strings and then discarding them. NEVER returned by
// the model: a model that miscounts one character would ship a hint quoting the wrong words. The
// clue's charset is [A-Za-z ], so code unit, code point and grapheme all coincide -- which is said
// out loud because a client slicing by grapheme would otherwise highlight the wrong span.
export interface ClueSpan {
  end: number
  start: number
}

// CLOSED HERE AND NOWHERE ELSE -- never in the tool schema. The predicate table in
// generators/crypticclue/verify.ts is exhaustive on this union, so a third device cannot be added
// without the compiler naming the site that must prove it.
export type CrypticDevice = 'anagram' | 'hidden'

// HintedPuzzleData, not PhrasePuzzleData: `answer` here is a single English word drawn from the
// source corpus, and it is deliberately outside PHRASE_CORPUS_TYPES (utils/exclusions.ts) -- a list
// of "phrases not to reuse" holding AARDVARK bans that word from three other types for twenty
// nights.
export interface CrypticClueData extends HintedPuzzleData {
  // The CODE-SUPPLIED shortlist word, uppercased -- never the model's spelling of it. nouns.ts
  // entries are single lowercase lemmas, so this is one token of 4-8 letters by construction, which
  // is the premise `enumeration` and rung 3 both stand on.
  answer: string
  // Gated, rendered verbatim, and stored byte-identical to the string the verifier proved -- which
  // is why a clue needing a trim is REJECTED rather than trimmed. It carries NO enumeration
  // parenthetical: every character the cover tolerates as residue is a character a model can hide
  // content in.
  clue: string
  definitionSpan: ClueSpan
  device: CrypticDevice
  // Word lengths, derived in code from `answer`, so it cannot disagree with it. Always length 1 in
  // Phase 1, and guaranteed so rather than assumed: the answer is a single-token lemma. An array
  // rather than a number because the WIRE SHAPE is the expensive thing to change -- a data-shape
  // change requires the hand-run delete-and-rebuild runbook endpoints.rest documents -- and the
  // derivation is split().map() either way.
  enumeration: number[]
  fodderSpan: ClueSpan
  // NO indicatorSpan. It is verified and not shipped: nothing renders it, the `device` literal
  // already names what the indicator signals, and a field with no reader is a field that rots.
}

// Phrase puzzles

// Tagged by shape because the consumers want different things from one call. The tool schema
// requires the tag and ajv rejects a response missing it.
//
//   title   -- a recognizable title of a work. Missing Vowels' preferred shape.
//   idiom   -- a common saying or expression.
//   quote   -- a witty or aphoristic line. Cryptogram's preferred shape.
//   compact -- two or three short words sharing letters. Phrazle's preferred shape.
//
// A consumer PREFERS a shape; it does not require one. Requiring one would make a call that came
// back light on a single tag produce zero puzzles of a type.
export type PhraseShape = 'compact' | 'idiom' | 'quote' | 'title'

// Exactly three. The count is checked once, at the parse boundary; the tuple carries that guarantee
// to every read site downstream.
//
// A rung index is NOT a slot index. lull-api orders rungs by how much each reveals, so difficulties
// 4 and 5 run slots 1, 0, 2. Never write hints[slot].
export type HintLadder = [Hint, Hint, Hint]

// What the MODEL returned, which is not what goes on the wire. Keeping the two named apart is what
// stops a prose gate quietly running over objects.
export type PhraseHints = [string, string, string]

// 5 = a general audience recognizes it instantly, 1 = obscure but fair. Set by the REVIEWER, never
// by the generator: a generator asked to rate its own output is grading its own work. Defaults to 3
// when review did not run.
//
// Direction matters and is easy to get backwards: high familiarity makes a Cryptogram EASIER.
export type Familiarity = 1 | 2 | 3 | 4 | 5

export interface Phrase {
  text: string
  shape: PhraseShape
  // ONE label -- the general kind of thing. Rung 1 of the ladder is what the old `categorySpecific`
  // used to be, so keeping both would squeeze the ladder into the narrow band between them and make
  // rung 1 duplicate whatever is already on screen.
  category: string
  hints: PhraseHints
  familiarity: Familiarity
}

// What a PHRASE-derived puzzle carries on top. `answer` and `category` were never universal: they
// are the phrase corpus's fields, and the base above is what keeps that honest.
//
// `answer` is defined, once, as THE ONE STRING THE PLAYER TYPES. A multi-answer type does not set
// it -- it carries its own fields and is read through a reader narrowed on its own type. Move the
// field up to the base and every type starts claiming to have one.
//
// It is NOT what decides membership of the anti-repetition list. That used to be true --
// create-phrase-puzzles.ts read `answer` off every puzzle of the last 20 days without narrowing on
// type, so what kept a type out was having no `answer` to find -- and it is now utils/exclusions.ts
// that decides, from an explicit PHRASE_CORPUS_TYPES set. The two questions came apart because a
// type can have a perfectly good single answer that is an ordinary English word, which belongs in an
// adjudication but not in a list titled "phrases not to reuse".
//
// `category` is optional because difficulty HIDES it -- see generators/category-visibility.ts. It is
// omitted, never nulled: dynamodb.ts stores the pack as JSON.stringify, so an absent key simply
// disappears from the payload.
export interface PhrasePuzzleData extends HintedPuzzleData {
  answer: string
  category?: string
}

// Missing Vowels

export interface MissingVowelsData extends PhrasePuzzleData {
  displayed: string // respaced consonant string -- the spacing deliberately lies
}

// Cryptogram

// No `revealed` map: the system design sketches one for pre-filled letters and Cryptogram has none.
export interface CryptogramData extends PhrasePuzzleData {
  ciphertext: string
}

// Phrazle

// Three fields, ALL of them inherited, and its smallness is the point: `answer`, `category?` and
// `hints` all come from PhrasePuzzleData, which is this type declaring in the type system what it
// is -- the same phrase in a third costume, exactly as generators/category-visibility.ts already
// says. An ALIAS rather than an `extends` with an empty body, which is the same type carrying a
// lint error.
//
// THERE IS NO GUESS LIMIT AND NO LOSS STATE. It carried one own field, `maxGuesses`, and lull-api
// shipped six in it. That was the right shape for a rule the backend owns and the wrong rule: this
// game is not losable, and a player guesses until the phrase falls. The board grows a row whenever
// it needs one. The FIELD IS GONE on both sides rather than sentinelled -- a `null` or a `0` meaning
// "unlimited" is a limit field claiming to have no limit, and `0` already meant "undrawable pack"
// here.
//
// THE 25-GUESS CEILING IN progress.ts IS NOT THIS FIELD RETURNING. It bounds what a corrupt
// localStorage write can make this board render, it lives on the storage codec rather than on the
// pack, and it can never end a game -- a player at guess 25 keeps playing, and only the oldest rows
// roll off the far end.
//
// `answer` SHIPS THE CANONICAL FORM -- uppercase A-Z words separated by single spaces, the output of
// splitPhrase re-joined -- and is the ONLY phrase-type answer that is not `phrase.text` verbatim.
// The board paints its characters as tiles and marks them with markGuess, which works on canonical
// words, so shipping corpus text with an accent or a stray double space would give the board an
// answer string whose characters are not the characters the marker marks. Missing Vowels and
// Cryptogram both display a DERIVATION of `answer` (a consonant run, a ciphertext) and adjudicate
// through normalizeAnswer, so neither has this constraint. utils/exclusions.ts is unaffected either
// way, because the anti-repetition list keys on normalizeAnswer, which collapses both forms.
//
// AND IT IS NOT A SECRET. endpoints.rest says so in one sentence rather than obscuring it. A hash
// cannot color a tile -- marking needs the letters -- and an encoding would ship its own reversal in
// the same bundle, which is a CLAIM of secrecy rather than secrecy, and more dangerous than an
// admitted absence of one because the next person builds a control on top of it. Either would also
// make `answer` unreadable as a phrase, which silently removes this type from the anti-repetition
// list. The pack sits in localStorage where three keystrokes reveal it in any case.
//
// NO `wordLengths`, against the system design's sketch. It is splitPhrase(answer).map(w => w.length),
// and two fields that can disagree is a defect surface on the one type where a disagreement is a
// board with the wrong number of tiles. The board derives the lengths through the SAME splitter the
// guess goes through, so grid and guess cannot disagree by construction.
//
// Nothing else: no precomputed marks, no dictionary subset, no familiarity, no shape, no limit.
export type PhrazleData = PhrasePuzzleData

// The THIRD member of HintMetadata. `kind` is `${PuzzleType}-${role}`, so `phrazle-reveal`.
//
// ONE member for this type, not three. A positional letter reveal is the whole ladder: rung k
// reveals the first still-unrevealed position of word `k mod wordCount`, 0-based over [0, 1, 2].
export interface PhrazleHintMetadata {
  kind: 'phrazle-reveal'
  // ONE A-Z character, and the same character the rung's `text` names. Safe to ship because `answer`
  // already ships (above), so unlike a prose rung this adds no exposure at all and needs no leak
  // audit -- which is why 'phrazle' belongs in NON_AUDITED_PUZZLE_TYPES rather than in
  // PHRASE_PUZZLE_TYPES.
  letter: string
  // 0-BASED letter position within that word, and 0-BASED word index. The rung's `text` says the
  // same thing 1-based, because a sentence counts from one and a renderer indexes a board from zero.
  // The `+ 1` lives in hints.ts and is asserted there, so the two cannot drift.
  position: number
  word: number
}

// `metadata` narrowed from optional to REQUIRED, exactly as GoFigureHint and ThemedAnagramsHint do
// it. Not in the spec's data-model list, and added deliberately: buildHints returning a bare
// HintLadder would let a rung be built with no metadata at all and still typecheck, which is the one
// thing the union's `kind` discriminant cannot catch on its own.
export interface PhrazleHint extends Hint {
  metadata: PhrazleHintMetadata
}

export type PhrazleHintLadder = [PhrazleHint, PhrazleHint, PhrazleHint]

// CLIENT-SIDE ONLY. lull-api never reads or writes this; it defines the SHAPE so that a rules fix
// cannot be contradicted by state a client cached. The shell persists progress verbatim and never
// interprets it -- what gains a contract is the type, and a type contract is this repo's to write.
//
// MARKS ARE DERIVED, NEVER STORED, and that is what makes the vendored-rules exposure survivable.
// markGuess's ordering is near-certain to be corrected at least once -- this branch is already
// correcting the published version of it -- and src/rules/ has no cross-repo check. A client caching
// tile colors would resume a board showing two different colorings of one game; raw guesses
// re-derive on every render, so a future marking fix REPAIRS every saved board instead of
// contradicting it. The enforcement is mechanical rather than contractual: markGuess is pure and
// runs in microseconds, so caching marks buys nothing.
//
// `solved` is NOT here and is not this type's to define. It lives in the shell's progress envelope,
// and what this decision fixes is that it is DERIVABLE from the blob -- true iff some guess marks
// all green -- so the two can never disagree.
export interface PhrazleProgress {
  // At most maxGuesses, in order, in CANONICAL FORM, and VALID GUESSES ONLY. A guess is appended
  // AFTER isValidGuess returns true, never before, so an invalid guess never occupies one of the six
  // attempts. Storing raw keystrokes instead would make a resumed board depend on a normalization
  // rule that is allowed to change, which is the thing this type exists to prevent.
  guesses: string[]
}

// ============================================================================
// UI only. Nothing below this line exists in lull-api.
// ============================================================================

// The one localStorage record that is never pruned. Solved ids are a few bytes each,
// so history outlives the pack payloads it refers to: an old solved puzzle still shows
// as solved and re-downloads if opened.
export interface Meta {
  installDismissed: boolean
  solved: string[]
  v: number
}

// The in-flight state of an unfinished puzzle, as its component chose to encode it.
// The shell persists this verbatim and never reads inside it — goFigure stores an
// expression, a later type will store something else entirely, and the shell must not
// have to know which.
export type PuzzleProgress = string

// The dictionary's retry schedule, persisted at lull:dict:retry so backoff survives an app close.
// UI only: lull-api has no such record and no opinion about it.
export interface RetryState {
  attempt: number
  nextAt: number
}

export interface PuzzleComponentProps<T = unknown> {
  // A FACT, never a CAPABILITY -- a set of strings and no callable, so a board can reject a guess
  // without knowing where the words came from. It carries no URL, no version, no cache name, no
  // status, no error, and no way to tell whether the words came off the network or out of a cache
  // last month. It is ambient in exactly the way the theme is ambient.
  //
  // NOT "FROZEN", which this used to claim. `ReadonlySet` is a compile-time view of a live Set that
  // every board is handed by identity, and `Object.freeze` does not stop `Set.prototype.add`, so
  // there is no cheap way to enforce one at runtime. What the type buys is that no board can write
  // to it without a cast, and that is the promise worth making rather than a stronger one nothing
  // keeps.
  //
  // OPTIONAL, so every board that predates it compiles unchanged and no other type's mount site has
  // to name a value it will never read. A board reads `dictionary ?? EMPTY`, and
  // everyWordInDictionary is documented and tested to reject every word against an empty set, so a
  // board handed nothing refuses every guess rather than throwing. That is the SECOND line of
  // defense: the first is that PuzzleFrame is the only thing that mounts a board and it will not
  // mount one that needs a dictionary without one.
  //
  // A BOARD MAY NEVER CALL useDictionary(). The rule is not "no hooks in a board"; it is that the
  // contract is readable off this interface, and a hook is exactly the thing that is not.
  dictionary?: ReadonlySet<string>
  onProgress: (progress: PuzzleProgress) => void
  // "The player started this puzzle over." A LIFECYCLE signal, not game state: it carries no hint
  // knowledge in either direction — the board does not learn that a ladder exists and the shell
  // does not learn what the board holds — so the display-only rule still holds with six props.
  //
  // Empty progress cannot be this signal, which is the tempting zero-prop alternative. Three boards
  // write '' for reasons that are not a reset: cryptogram's encode({}) in mapping.ts when the last
  // letter is cleared, missingvowels when the text is deleted, and goFigure's own Undo and Clear. A
  // shell that treated '' as "start over" would wipe a player's spent rungs on a keystroke.
  //
  // OPTIONAL, so every board that predates it compiles and renders unchanged. A board that has no
  // replay affordance — cryptogram today — simply never calls it.
  onReset?: () => void
  onSolved: () => void
  progress: PuzzleProgress | null
  puzzle: Puzzle<T>
}

// `import type { FC }`, not React.FC: React is a UMD global under this tsconfig and
// referring to it inside a module is a compile error.
export type PuzzleComponent<T = unknown> = FC<PuzzleComponentProps<T>>
