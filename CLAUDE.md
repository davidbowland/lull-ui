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
`{ puzzle, progress, onProgress, onSolved }` and nothing else. The shell owns routing, persistence,
and the network. This is what keeps the display-only rule structural rather than aspirational.

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

## Copy and UX Writing

**All user-facing copy, CTAs, labels, and error messages must be reviewed by a UX expert and by
Steven Pinker's principles** (plain language, active voice, concrete nouns, no jargon, no weasel
words). Apply the suggested changes unless they conflict with technical constraints.

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

**No CSS or style assertions.** Test observable behavior: return values, thrown errors, calls to
collaborators.

**No `if` statements in tests.** No live `Date.now()` or `Math.random()` calls in test bodies. No
date arithmetic that depends on the current wall-clock time.

**Deterministic above all.** A test that passes today and fails tomorrow is broken.
