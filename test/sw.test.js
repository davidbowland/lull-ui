'use strict'

const fs = require('fs')
const path = require('path')

const SW_PATH = path.join(__dirname, '..', 'public', 'sw.js')

// public/sw.js runs in a worker scope, so it is loaded as text and evaluated rather than
// imported: it has no module wrapper, and `self` and `caches` do not exist here. Only the
// two pure rewrite helpers are exercised -- they are the half of the file that has to
// agree, character for character, with UiUrlRewriteFunction in template.yaml.
const load = () => {
  const source = fs.readFileSync(SW_PATH, 'utf8')
  const exported = {}
  const self = { addEventListener: () => undefined, skipWaiting: () => undefined }
  new Function('exports', 'self', source)(exported, self)
  return exported
}

describe('sw.js', () => {
  const { indexFor, shellFor } = load()

  describe('shellFor', () => {
    // Offline there is no CloudFront, so /p/<id> would miss the precache entirely
    // without this. The brackets are percent-encoded because that is how the worker
    // asks the Cache API for the literal out/p/[puzzleId]/ path that
    // scripts/generate-dynamic-pages.js writes -- template.yaml's edge function uses
    // the UNENCODED form for the same file. The asymmetry is deliberate.
    it('rewrites a puzzle URL onto the exported shell', () => {
      expect(shellFor('/p/2026-08-18:gofigure:9f3a1c02')).toEqual('/p/%5BpuzzleId%5D/index.html')
    })

    it('rewrites the trailing-slash form onto the same shell', () => {
      expect(shellFor('/p/2026-08-18:gofigure:9f3a1c02/')).toEqual('/p/%5BpuzzleId%5D/index.html')
    })

    // An id carries colons and reaches the address bar encoded. The worker never
    // decodes it: the whole segment is opaque and only has to match [^/]+.
    it('rewrites a percent-encoded id onto the same shell', () => {
      expect(shellFor('/p/2026-08-18%3Agofigure%3A9f3a1c02/')).toEqual('/p/%5BpuzzleId%5D/index.html')
    })

    // The shell is one file under a bracketed name. Decoding the worker's key has to
    // land on exactly what generate-dynamic-pages.js wrote, or the precache holds a
    // document the worker can never ask for.
    it('names the file the build actually wrote', () => {
      expect(decodeURIComponent(shellFor('/p/anything'))).toEqual('/p/[puzzleId]/index.html')
    })

    it('rewrites the route data payload onto the placeholder', () => {
      expect(shellFor('/_next/data/abc123/p/2026-08-18:gofigure:9f3a1c02.json')).toEqual(
        '/_next/data/abc123/p/__placeholder__.json',
      )
    })

    it('leaves the home page alone', () => {
      expect(shellFor('/')).toBeNull()
    })

    it('leaves a hashed asset alone', () => {
      expect(shellFor('/_next/static/chunks/main-abc123.js')).toBeNull()
    })

    it('leaves a nested path under /p/ alone', () => {
      expect(shellFor('/p/one/two')).toBeNull()
    })
  })

  describe('indexFor', () => {
    // The last rule in UiUrlRewriteFunction. Only needed offline: online the edge has
    // already appended it, and the response comes back keyed by the URL the browser
    // asked for.
    it('appends index.html to a directory URL', () => {
      expect(indexFor('/')).toEqual('/index.html')
    })

    it('appends a directory index to an extensionless path', () => {
      expect(indexFor('/404')).toEqual('/404/index.html')
    })

    it('leaves a file with an extension alone', () => {
      expect(indexFor('/icon-192.png')).toBeNull()
    })
  })

  // Firefox fetches the manifest inside a requestIdleCallback with no try/catch, and
  // discards the whole thing on any non-2xx answer -- which silently degrades install to
  // a plain bookmark for the entire page load. The miss branch of this worker answers any
  // non-navigate request with a synthetic 503, so it must never be in the path at all.
  // Asserted against the source because the guard is an early return with nothing to
  // call.
  it('never answers for the manifest', () => {
    expect(fs.readFileSync(SW_PATH, 'utf8')).toContain("if (url.pathname === '/site.webmanifest') return")
  })
})
