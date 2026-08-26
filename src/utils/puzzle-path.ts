// A puzzle id is `${date}:${type}:${shortId}` and the URL that opens it is that id with
// every colon written as a slash: /p/2026-08-25/phrazle/9d463f28. The alternative --
// /p/2026-08-25%3Aphrazle%3A9d463f28 -- is what a single encoded segment looks like in an
// address bar, and it is what a player copies out of one to send to somebody.
//
// This is a SEPARATOR SWAP AND NOT A PARSE, which is the only reason it is allowed to
// exist beside the rule in pack-dates.ts that the id is opaque past its date prefix.
// Neither function here counts the parts, names one, or reads the type out of the second:
// split on ':' write '/', split on '/' join with ':'. An id that grew a fourth part would
// round-trip through both without an edit.
//
// The two halves live in one file because they are one contract. Change how a path is
// written and the reader has to change in the same breath, and nothing else in the app
// may build or read a /p/ URL.

// Percent-encode each part. It is a no-op on every id the API has ever issued -- a date, a
// lowercase type, a hex short id -- and it is here for the part that would otherwise open a
// segment of its own and desynchronize the two halves.
export const puzzlePath = (puzzleId: string): string => `/p/${puzzleId.split(':').map(encodeURIComponent).join('/')}`

// Null rather than a throw or a guess: the caller is reading the address bar, where a
// player can type anything, and "this URL names no puzzle" is a state the page already
// renders. decodeURIComponent throws on a malformed escape such as %E0%A4%A, so the decode
// is the part that has to be guarded.
export const puzzleIdFromPath = (pathname: string): string | null => {
  const match = /^\/p\/(.+?)\/?$/.exec(pathname)
  if (match === null) return null
  try {
    return match[1].split('/').map(decodeURIComponent).join(':')
  } catch {
    return null
  }
}
