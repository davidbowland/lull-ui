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

// What a HINTED puzzle carries, and it is NO LONGER EVERY TYPE. It said "which today is every puzzle
// type", and that stopped being true when Cryptogram, Phrazle and Themed Anagrams moved to
// letter-shaped hints computed on the device: three of the six types now ship no ladder at all, and
// a shell that assumes one finds `undefined`. TWO interfaces extend this -- MissingVowelsData and
// CrypticClueData -- and GoFigureData CONFORMS to it structurally without naming it, for the reason
// given at the bottom of this comment. Three types carry a ladder; only two inherit the base.
//
// SO THE SHELL'S TEST IS "does this puzzle have `hints`", not "which type is this". A client
// branching on the type list above would have to be edited every time a type crosses the line, and
// the line is exactly what this base draws. Absence is the normal case for half the catalog rather
// than a defect to repair.
//
// It lives HERE rather than in the phrase section below because it is not a phrase type's business:
// it is the base the shared UI shell reads to find hints without knowing the type, and `hints` is
// the ONLY thing it needs for that job. The ladder is ONE TO THREE rungs by HintLadder above -- not
// always three, since 2026-08-24 -- and each rung's shape is fixed by CLAUDE.md ("Every hint on the
// wire is { text, metadata? }"). The shell must read `hints.length` rather than assuming it.
//
// GoFigureData satisfies it without extending it, because GoFigureHintLadder is assignable to
// HintLadder -- so it is a base something conforms to rather than one nothing reads.
export interface HintedPuzzleData {
  hints: HintLadder
}

// goFigure

export type Operator = '+' | '-' | '*' | '/'

export type OperatorSlot = 0 | 1 | 2

// The two facts a rung reveals, plus the tag that says which member of HintMetadata this is -- which
// is currently a question with one answer, for the reasons recorded on that union.
//
// `kind` is REQUIRED and its value is fixed by the union's naming rule: `${PuzzleType}-${role}`, so
// `gofigure-operator`. The role segment is required even though goFigure has exactly one member
// today, because a SECOND member of the same type is the case a bare type tag cannot express -- and
// that case is the rejected elimination rung, which the second paragraph below places on the axis
// `kind` is NOT. Nothing in this repo describes that rung further; it was never built.
//
// AN EARLIER VERSION OF THIS COMMENT argued there is no discriminator, on the ground that "the
// presence of `operator` is what says this is an operator rung". That reasoning is sound for ONE
// alternative member and did not survive two arriving in one phase: Themed Anagrams contributed
// { entryIndex, reveal } and Phrazle { wordIndex, position, letter }, which are the same shape --
// { index-into-the-board, what-is-revealed } -- and nothing structural separated them.
//
// BOTH OF THOSE MEMBERS HAVE SINCE GONE, with the ladders that carried them, so the structural
// argument is technically available again and the tag is kept anyway. Where that was decided, and
// what it costs to undo, is on HintMetadata above; it is not re-argued here.
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

// TAGGED, AND BACK TO A UNION OF ONE. Every member carries `kind`, and its value is
// `${PuzzleType}-${role}` with the type segment the PuzzleType literal verbatim -- so
// `gofigure-operator`, the only member left.
//
// IT REACHED THREE AND CAME BACK. Themed Anagrams contributed { entryIndex, reveal } and Phrazle
// { wordIndex, position, letter }, and both left with the ladders that carried them when Cryptogram,
// Phrazle and Themed Anagrams stopped shipping `hints` on the wire at all -- their hints are now
// letter-shaped, chosen on the device against a board the generator cannot see, and built from
// src/rules/ rather than sent.
//
// SO THE DISCRIMINANT NARROWS NOTHING AGAIN, and that is worth saying plainly rather than leaving
// the reader to notice. The case for tagging was made on two arms arriving at once -- "a `kind` on
// one arm narrows nothing and on two it narrows both" -- and with one arm the compiler is back where
// it started: `metadata` typed as this union is already GoFigureHintMetadata, and there is nothing
// to discriminate.
//
// IT STAYS ANYWAY, and not out of deference to work already done. The tag is a NAMING RULE first and
// a compiler feature second, and the naming rule is what stops the drift that produced three
// separate proposals -- 'gofigure', 'operator', 'gofigure-operator' -- for this one member. Dropping
// it would cost a wire change on the one type whose `metadata` is REQUIRED and whose read sites do
// not branch on its absence, and would buy back nothing: the next type to add metadata would
// re-litigate the naming from nothing and pay the same widening again. It inherits the convention
// instead, and the narrowing arrives with it on the day it lands.
//
// A NEW MEMBER ARRIVES WITH ITS OWN `kind`, and NOTHING MAKES IT -- not the type, and not any test.
// A member declared without a tag widens this union just as quietly as before, because the union is
// what would have to be checked and a bare `A | B` has no shape to violate.
//
// NO TEST CATCHES IT EITHER, and it is worth being exact about why, because a golden ladder looks
// like it would. goFigure pins its ladder with toEqual against what its builder emits --
// __tests__/unit/generators/gofigure/hints.test.ts, over the fixture in __tests__/unit/__mocks__.ts.
// That catches DRIFT BETWEEN A BUILDER AND ITS FIXTURE: one side losing `kind`, or carrying a wrong
// one. Every case it catches is a regression on a member that is ALREADY TAGGED. It cannot catch a
// member arriving untagged, because that type's fixture and its builder are written by the same hand
// in the same commit and agree with each other perfectly -- toEqual passes on two untagged ladders.
// Both halves were run before this sentence was written: dropping `kind` from buildHints alone fails
// that assertion, and dropping it from the builder and the fixture together passes it.
//
// So this convention is held by REVIEW and by nothing else. tsconfig.json excludes __tests__/, so
// the annotations there are checked by nothing at CI time either, and no script, CI step or smoke
// check inspects `kind` anywhere in this repo.
//
// ONE RULE ON THE UNION, and it survives the shrink: `metadata` is a machine-readable RESTATEMENT of
// its own rung's `text`, never a superset. A renderer that prints only hint.text must work on every
// type, and a metadata field revealing more than its rung silently breaks that.
//
// The optional field on Hint also cannot keep goFigure structure OFF a phrase rung:
// `{ text, metadata }` satisfies `Hint`, so a missing vowels ladder carrying operator metadata
// typechecks. Only toHintLadder's discipline stops that, not the type.
export type HintMetadata = GoFigureHintMetadata

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

// answer and scrambles in ONE object, never two parallel arrays. Parallel arrays permit different
// lengths and permit an index skew, and a type that permits an invalid state will eventually hold
// one -- here that state is a board showing word 3's scramble above word 2's answer.
//
// `scrambles` IS A LIST WHOSE LENGTH HAS TO BE READ, and the tuple type is what says so: at least
// one, at most SCRAMBLES_PER_ENTRY (4 in lull-api today), and the length VARIES PER ENTRY -- two
// entries in the same puzzle can hold four and one. ONE IS A NORMAL LENGTH rather than a degenerate
// pack: KETTLE at band 4 has exactly one arrangement hard enough to show, out of 180.
//
// [0] is the board as it first appears and the rest are what the reshuffle control cycles through,
// IN THE ORDER GIVEN, wrapping back to [0] after the last. Do not sort, dedupe, re-shuffle or extend
// it: each member is separated from every other by a rule applied in lull-api -- at most a third of
// the tiles may sit where they sat in any other -- and each is checked against the charged-string
// blocklist as a composed string. An arrangement this app invented would have passed neither gate.
// The order carries no difficulty gradient; every member clears the same bar.
//
// THE WIRE STILL CARRIES THE OLD SINGULAR `scramble` AND THIS TYPE DOES NOT, deliberately. It is a
// promise about the generator rather than about the wire, exactly as the board's own guards say --
// and the shape that is actually on the network today, and in every `lull:pack:` a device has
// cached, is read structurally in themedanagrams/index.tsx, which is where every other untrusted
// read on that bench already lives.
export interface AnagramEntry {
  answer: string // uppercase A-Z, 5-9 letters, the word the player types
  scrambles: [string, ...string[]] // each the same letter multiset and length as `answer`
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
// RENDERED IN WIRE ORDER, and the reason is now the device's rather than the wire's. The ladder used
// to ship ordinals that indexed this array, so a board that sorted entries by length -- the obvious
// tidy-up -- made every rung point at the wrong row. There is no shipped ladder to break any more,
// but the rungs the device builds carry the same ordinals against the same array, so a board that
// reorders these entries breaks its own hints instead of the pack's.
//
// NO `hints`, and this type no longer extends HintedPuzzleData. Its ladder picked three target
// entries by ANSWER LENGTH, ranked once at generate time, so a player who had already solved the
// longest entry still got the whole-answer reveal spent on it. Which entries are still unsolved is a
// fact about a board four guesses have already changed, so the rungs are chosen on the device
// instead, by the vendored builder at src/rules/hint-themed-anagrams.ts -- which in THIS repo is a
// file sitting beside this one, reached through the adapter in components/themedanagrams/hints.ts.
// (lull-api's copy of this comment names it as a promise about the integrated tree, because that
// repo holds the rule and never runs it against a board.)
export interface ThemedAnagramsData {
  entries: [AnagramEntry, AnagramEntry, AnagramEntry, AnagramEntry]
  theme: string
}

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

// ORDERED BY THE BACKEND, and NOT necessarily least to most revealing -- render them in the order
// they arrive and do not sort or renumber. The prose ladder Missing Vowels ships does run least to
// most revealing, but a goFigure ladder with a unique operator tuple deliberately does not: it
// spends rung 1 on op2, so its slots come out 1, 0, 2. This type is the wire shape for every type
// that ships hints at all, so a promise true of only one of them does not belong on it.
//
// For phrase puzzles the count is checked once, at the parse boundary in phrase-checks; the tuple
// carries that guarantee to every read site downstream.
//
// ONE TO THREE RUNGS, and the lower bound is the type rather than a comment: `[Hint, ...Hint[]]` is
// a NON-EMPTY array, so `ladder[0]` needs no guard while `ladder[2]` does. It was a fixed 3-tuple
// until 2026-08-24.
//
// WHY IT WIDENED. Cryptic Clue draws its rungs from a pool whose entries drop when the clue already
// says what they would say, and on one clue shape -- an indicator that announces the device, a
// one-word definition, and no usable gloss -- only two survive that are worth a player's hint.
// Padding to three meant emitting a second letter reveal, and two letter reveals in a row is not a
// ladder, it is the same hint twice. A rung you do not have is better than a bad one.
//
// THE OTHER TWO TYPES THAT SHIP A LADDER STILL SHIP EXACTLY THREE -- goFigure through
// GoFigureHintLadder, a 3-tuple that stays assignable to this, and Missing Vowels through
// toHintLadder over a PhraseHints triple. So the tuple was never load-bearing for them and this
// widening costs them nothing; what it costs is that a client can no longer index blind.
//
// A FOURTH CASE IS NOT THIS TYPE'S. Cryptogram, Phrazle and Themed Anagrams ship no `hints` key,
// which is an ABSENT field rather than a short ladder -- there is no empty HintLadder and this type
// cannot express one. A client tests for the field, then reads its length.
export type HintLadder = [Hint, ...Hint[]]

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
//
// IT NO LONGER EXTENDS HintedPuzzleData, and that is the change that took cryptogram and phrazle
// hints off the wire. Drawing a phrase and shipping the phrase's ladder were always separate
// questions -- toHintLadder's comment has said so since Phrazle arrived -- and this type used to
// answer the second one for all three of its members. Missing Vowels extends both bases and is now
// the only phrase type that ships a ladder; Cryptogram and Phrazle compute letter-shaped hints on
// the device from src/rules/, against a board no generator can enumerate in advance.
export interface PhrasePuzzleData {
  answer: string
  category?: string
}

// Missing Vowels

// TWO BASES, and the second one used to be inherited through the first. It is the ONLY phrase type
// that still ships a ladder, so it is the only one that names HintedPuzzleData: the shared prose
// rungs are semantic ("never about how it is written", per prompts/create-phrases.txt), and
// recognizing the phrase from its meaning is exactly what a missing vowels player is doing.
export interface MissingVowelsData extends HintedPuzzleData, PhrasePuzzleData {
  displayed: string // respaced consonant string -- the spacing deliberately lies
}

// Cryptogram

// No `revealed` map: the system design sketches one for pre-filled letters and Cryptogram has none.
//
// AND NO `hints`. It shipped the shared prose ladder -- three model sentences about what the phrase
// MEANS -- and a cryptogram player is not trying to recognize a phrase from its meaning, they are
// solving a substitution cipher one letter at a time. A semantic nudge on this type is a hint for a
// different puzzle. The replacement is letter-shaped and cannot be shipped at all: it ranks the
// cipher letters this player has not yet got right, which is a fact about a board built at play
// time. It runs on the device, from the vendored builder at src/rules/hint-cryptogram.ts.
//
// The phrase still ARRIVES with three prose hints -- passesProseGates requires them before a phrase
// is usable at all, and Missing Vowels ships them -- and that generator drops them on the floor.
export interface CryptogramData extends PhrasePuzzleData {
  ciphertext: string
}

// Phrazle

// TWO fields, both of them inherited, and its smallness is the point: `answer` and `category?` come
// from PhrasePuzzleData, which is this type declaring in the type system what it is -- the same
// phrase in a third costume, exactly as generators/category-visibility.ts already says. An ALIAS
// rather than an `extends` with an empty body, which is the same type carrying a lint error.
//
// IT WAS THREE FIELDS. `hints` left with PhrasePuzzleData's ladder, and this type's went two ways at
// once: it never used the prose rungs (it built three positional letter reveals in code instead),
// and those reveals were blind -- `Letter 1 of word 1 is T.` names a position with no regard for
// what four guesses have already colored in, so a rung routinely spent itself on something the
// player had proved. A hint fixed before the player exists cannot know what is still worth saying.
// The vendored builder at src/rules/hint-phrazle.ts replaces it on the device, reading the guesses
// actually made.
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

// The localStorage record that made the case for keeping history. Solved ids are a few bytes
// each, so history outlives the pack payloads it refers to: an old solved puzzle still shows
// as solved and re-downloads if opened. It was the ONLY unpruned record until reaching an
// earlier day became possible, at which point `lull:progress:` and `lull:hints:` stopped being
// collected on the same argument -- packs are the family whose weight is measured in kilobytes
// a day, and they are the only one usePrefetch collects.
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
