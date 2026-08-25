# Project Guidelines

**Always commit changes** after completing work unless explicitly told not to.

## Lull-specific rules

**This app displays; the backend decides.** No game rule is authored here. Content, difficulty,
selection, and answers all arrive in the pack from `lull-api`. If you find yourself writing logic
that decides whether an answer is right, stop — either the backend should have shipped that as
data, or it belongs in `src/rules/`.

**`src/rules/` is vendored, not authored.** It is a copy of `lull-api/src/rules/`. Never edit it
here — change it in `lull-api`, then copy the rule and its tests over in the same sitting.

**Nothing verifies the copies match, on purpose.** CI here does not clone `lull-api`, there is no
pinned commit, and no script owns the copy. Each of those made a two-file `cp` into a protocol, and
the cross-repo check made this repo's build depend on another one being reachable and already
pushed. What catches drift is the vendored tests running in this suite and a warning on the
`lull-api` commit that changes the rules. A stale copy is a UX inconsistency, not a broken pack:
`lull-api` uses `normalizeAnswer` for corpus entry ids and this app uses it to compare typing, and
neither calls the other.

**A puzzle component gets no router, no storage, and no API client.** It receives
`{ puzzle, progress, onProgress, onReset, onSolved, dictionary }` and nothing else. The shell owns
routing, persistence, and the network. This is what keeps the display-only rule structural rather
than aspirational.

`onReset` is a lifecycle signal, not game state — "the player started this puzzle over." **A board
may name an event; it may never name a key, a route, or an endpoint.** That is the line six props
has to stay on, and it is the line worth stating, because what changed with `onReset` is that a
board can now cause a storage write it does not understand. "The board learns nothing back from it"
is true and does not do the work: it would also permit `onSaveDraft(text)`, which hands the shell a
payload and a place to put it. `onReset()` takes no argument and names no destination, so deleting
`lull:hints:<puzzleId>` and resetting the hint bar stay entirely the shell's business.

It exists because empty progress cannot carry that meaning. Three boards write `''` for reasons that
are not a reset: `encode({})` in `cryptogram/mapping.ts` when the last letter is cleared,
`missingvowels` when the text is deleted, and goFigure's Undo and Clear — which under the current
grammar write `''` only when no rung has been spent, since a cleared board with rungs spent stores
`_______|2|`.

**A board may receive a FACT; it may never receive a CAPABILITY.** `dictionary?: ReadonlySet<string>`
is the second prop to widen this contract, and it sits on the line `onReset` drew. `onReset()` takes
no argument and names no destination, so a board can cause a storage write it does not understand
without naming the key. `dictionary` is a set of strings and no callable, so a board can reject a
guess without knowing where the words came from. Not a FROZEN set: `ReadonlySet` is a compile-time
view of a live `Set`, and `Object.freeze` does not stop `Set.prototype.add`, so the guarantee is the
type rather than the value. It carries no URL, no version, no cache name, no status, no error, and
no way to tell whether the words came off the network or out of a cache last month. It is ambient in
exactly the way the theme is ambient.

What would break the line is a `refresh()`, a `status`, or an `error` reaching a board — each hands
the board a decision that is the shell's, and the first is an API client wearing a prop's clothes.
**It is optional and the board reads `dictionary ?? EMPTY`**, so every board that predates it
compiles unchanged and a board handed nothing refuses every guess rather than throwing.
`DictionaryProvider` stays the shell's — it owns the fetch, the cache, the retry and the timers —
and `PuzzleFrame` reads `useDictionary()` and hands the set down at its one mount site. **A board
may never call that hook.** The rule is not "no hooks in a board"; it is that the contract is
readable off `PuzzleComponentProps`, and a hook is exactly the thing that is not.

**Never let the service worker answer for the manifest.** `public/sw.js` bails out before
intercepting `/site.webmanifest`. Firefox fetches the manifest inside `requestIdleCallback` with no
try/catch, and one non-2xx answer silently degrades install to a plain bookmark for the whole page
load. See `~/Projects/pwa-requirements.md`.

**Storage keys are scanned by full prefix and validated by pattern.** `lull:pack:` and
`lull:progress:` share the `lull:` namespace with `lull:meta`, so a bare `lull:` scan sweeps in the
wrong keys, and a malformed key without the `/^\d{4}-\d{2}-\d{2}$/` check enters the derived index.
Both are required.

**Pack dates are UTC.** Tests run under `TZ=UTC`. The shelf renders the device's local date and
falls back to the most recent available pack when the local date runs ahead of what has been
generated.

## Accessibility

**All designs must meet WCAG AA.** Sufficient color contrast (4.5:1 for normal text, 3:1 for large
text), full keyboard navigability, visible focus indicators, appropriate ARIA roles and labels, and
no content that relies on color alone. Run an accessibility audit before marking UI work complete —
it is a per-task gate, not a cleanup pass. A board built without labeled controls is a rewrite, not
a patch.

**The audit means naming the properties and asserting them, never running `jest-axe`.** That
package is not a dependency of this repo and must not become one. Work out what each state of the
UI actually promises a screen reader or a keyboard, then pin each promise with an observable
assertion: accessible names, roles, focus destinations, live-region text, tab order, `aria-current`,
`aria-expanded`, `aria-disabled`, `aria-hidden`, `hidden`. `getByRole(..., { name })` reads the
accessibility tree, so a role query IS an accessibility assertion — one that names the property it
is defending and fails with a sentence a reader can act on.

A rule engine cannot do this work. It passes markup that is valid and useless — a correctly formed
button labeled "Button", a live region that announces at the wrong moment, a roving `tabIndex`
pinned to the first cell — and under jsdom it never sees layout at all, so contrast and
scrollable-region rules return nothing either way.

**An IDREF is the one thing a role query cannot always defend, and only one kind of IDREF.** Break
`aria-labelledby` or `htmlFor` and the element loses its accessible name, so a
`getByRole(..., { name })` somewhere fails and tells you. `aria-controls` contributes nothing to a
name, so it can rot in total silence — every query keeps passing while the relationship it asserts
is gone. Resolve it explicitly wherever one exists:

```ts
const id = control.getAttribute('aria-controls')
expect(document.getElementById(id ?? '')).toBeInTheDocument()
```

That is observable DOM, not a style assertion, and it is asserted today at both ends of the only
such reference in the app — the hint sheet's, which `gofigure` follows to decide whether to freeze
its keyboard.

**Duplicate `id`s** genuinely have no behavioral equivalent, but nothing here can produce one: the
only id sources are `useId()`, which React makes unique per instance, and `answer-${puzzle.id}` in
Missing Vowels, where the id is unique per puzzle and the shell mounts one board. It becomes a real
risk the day two boards render at once. Where a component builds an id or an IDREF, say so in a
comment beside the code and assert both ends.

## Copy and UX Writing

**All user-facing copy, CTAs, labels, and error messages must be reviewed by a UX expert and by
Steven Pinker's principles** (plain language, active voice, concrete nouns, no jargon, no weasel
words). Apply the suggested changes unless they conflict with technical constraints.

**American English, in prose and in code comments.** `color`, `behavior`, `center`, `gray`,
`labeled`, `canceled`, `-ize` over `-ise`. The comments in this repo are its documentation and they
run to thousands of words, so a mixed spelling convention is a thing every future edit has to guess
at.

**The exception is anything bound to an external contract, and it is not optional.** `aria-labelledby`
keeps its two Ls — it is an ARIA attribute name, and "correcting" it silently removes an element's
accessible name with no test failure anywhere, because a role query that never had a name to find
goes on not finding one. The same holds for a third-party API field, a CSS property, a package name,
and text quoted from someone else. Spelling rules apply to prose; identifiers belong to whoever
defined them.

## Testing Standards

**Jest clears all mocks automatically** (`clearMocks: true`). Never manually clear mocks.

**Mock state:** Set shared defaults in `beforeAll`. Override per-test with `mockReturnValueOnce` /
`mockResolvedValueOnce` / `mockRejectedValueOnce`. Never use `beforeEach` — write a named `setup()`
function if repeated arrangement is needed and call it explicitly.

**Non-determinism:** Any function that uses `Date.now()`, `Math.random()`, or `crypto.randomUUID()`
to produce a value that affects test outcomes MUST accept it as an injectable parameter with a
default.

**Fake timers:** Use `jest.useFakeTimers()` in `beforeAll` (and `jest.useRealTimers()` in
`afterAll`) when the code under test calls `setTimeout`, `setInterval`, or `Date` internally
without injection.

**`userEvent`: always `userEvent.setup({ delay: null })`, once per test, and drive every interaction
through that instance.** Never call `userEvent.click(...)` / `userEvent.keyboard(...)` directly off
the default export.

The direct calls are the v13 API. Under v14 each one builds a throwaway instance carrying the
default `delay: 0`, which inserts a **real `setTimeout` between every event in the sequence** — and
one click is several events (`pointerover`, `pointerdown`, `mousedown`, `focus`, `pointerup`,
`mouseup`, `click`, …). Those timers measure fine on an idle machine and get starved under parallel
workers, where the suite is silently leaning on the undeclared 5000ms default timeout.

Measured on this repo, converting `cryptogram`'s 104 call sites took the suite from **30.9s to
21.8s** — about 30%, so the timers are a real cost but not the dominant one. The reason this is a
rule is the tail, not the mean: `cryptogram` and `puzzle-frame` pass in isolation and fail under
load, and every real `setTimeout` between events is machine-load-dependent slack that eats the
timeout margin. A test whose result depends on how busy the machine is is exactly what
"deterministic above all" forbids, so this is a determinism rule that happens to also be faster.

```ts
const user = userEvent.setup({ delay: null })
await user.click(screen.getByRole('button', { name: 'Undo' }))
```

**No CSS or style assertions.** Test observable behavior: return values, thrown errors, calls to
collaborators.

**No `if` statements in tests.** No live `Date.now()` or `Math.random()` calls in test bodies. No
date arithmetic that depends on the current wall-clock time.

**Deterministic above all.** A test that passes today and fails tomorrow is broken.
