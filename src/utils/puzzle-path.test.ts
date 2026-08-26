import { puzzleIdFromPath, puzzlePath } from '@utils/puzzle-path'

describe('puzzle-path', () => {
  describe('puzzlePath', () => {
    it('writes each colon-separated part as its own path segment', () => {
      expect(puzzlePath('2026-08-25:phrazle:9d463f28')).toEqual('/p/2026-08-25/phrazle/9d463f28')
    })

    it('percent-encodes a part that would otherwise open a segment of its own', () => {
      expect(puzzlePath('2026-08-25:odd/type:9d463f28')).toEqual('/p/2026-08-25/odd%2Ftype/9d463f28')
    })

    // The number of parts is not the caller's business and never checked. An id is opaque
    // past its date prefix, so this is a separator swap and not a parse.
    it('writes an id with more parts than todays without counting them', () => {
      expect(puzzlePath('2026-08-25:phrazle:9d463f28:v2')).toEqual('/p/2026-08-25/phrazle/9d463f28/v2')
    })
  })

  describe('puzzleIdFromPath', () => {
    it('joins the segments after /p/ back into an id', () => {
      expect(puzzleIdFromPath('/p/2026-08-25/phrazle/9d463f28')).toEqual('2026-08-25:phrazle:9d463f28')
    })

    it('reads a path the export wrote with a trailing slash', () => {
      expect(puzzleIdFromPath('/p/2026-08-25/phrazle/9d463f28/')).toEqual('2026-08-25:phrazle:9d463f28')
    })

    // Every link shared before this repo wrote path segments carries the id in one
    // encoded segment. One segment decodes to the whole id and joins with itself.
    it('reads the single encoded segment older links carry', () => {
      expect(puzzleIdFromPath('/p/2026-08-25%3Aphrazle%3A9d463f28/')).toEqual('2026-08-25:phrazle:9d463f28')
    })

    it('decodes a segment that carries an encoded slash', () => {
      expect(puzzleIdFromPath('/p/2026-08-25/odd%2Ftype/9d463f28')).toEqual('2026-08-25:odd/type:9d463f28')
    })

    it('returns null for a path that is not a puzzle', () => {
      expect(puzzleIdFromPath('/')).toBeNull()
    })

    it('returns null for /p/ with nothing after it', () => {
      expect(puzzleIdFromPath('/p/')).toBeNull()
    })

    // A malformed escape makes decodeURIComponent throw, and the value comes off the
    // address bar where anyone can type one.
    it('returns null for a segment that is not valid percent-encoding', () => {
      expect(puzzleIdFromPath('/p/2026-08-25/%E0%A4%A/9d463f28')).toBeNull()
    })
  })

  it('round-trips every id it writes', () => {
    expect(puzzleIdFromPath(puzzlePath('2026-08-25:phrazle:9d463f28'))).toEqual('2026-08-25:phrazle:9d463f28')
  })
})
