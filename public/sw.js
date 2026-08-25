/* eslint-disable no-undef */
'use strict'

// CACHE_VERSION and PRECACHE are rewritten by scripts/generate-sw-manifest.js at
// postbuild, so the cache name changes whenever the build does. The literals below are
// only what a dev server sees; nothing ships with them.
//
// PRECACHE therefore lists only '/', the one URL that exists in both worlds. The puzzle
// shell sits at the literal /p/[puzzleId]/ path that scripts/generate-dynamic-pages.js
// writes into out/, and `next dev` has never heard of it. addAll is atomic, so naming it
// here would 404 in the dev-server log on every page load and then fail the install --
// meaning the worker never activates locally and none of the offline behavior can be
// exercised in dev at all.
var CACHE_VERSION = 'dev'
var PRECACHE = ['/']

var CACHE_NAME = 'lull-' + CACHE_VERSION

// The dictionary cache is a SIBLING, keyed by the DICTIONARY version rather than by the build --
// so it must survive a deploy. caches.keys() is origin-wide and the activate sweep deletes
// everything that is not the current build's cache, which would take it with every release. Putting
// the dictionary inside CACHE_NAME instead is worse, not simpler: that cache is dropped wholesale on
// each version bump, so every installed device would re-download the word list on deploy day --
// ~123KB on the wire, 366KB decoded -- against a route throttled at 2 requests per second across ALL
// CALLERS: the synchronized stampede on a schedule.
//
// This worker never DELETES a stale dictionary version either, and that is deliberate rather than a
// leak left open: the only code that knows which version is current is src/services/dictionary.ts,
// and it prunes its own siblings the moment it successfully installs the current one.
//
// It also never intercepts the download. The fetch handler returns early on any cross-origin
// request, and the dictionary is served from the API host.
//
// The one residual risk is a future CACHE_VERSION that happens to start with 'dict-', which would
// make CACHE_NAME itself match this prefix and exempt the build cache from its own sweep. It is
// impossible today -- generate-sw-manifest.js writes a build hash -- and is worth this sentence
// rather than a runtime assertion.
var DICT_PREFIX = 'lull-dict-'

// IMPORTANT: this mirrors UiUrlRewriteFunction in template.yaml. CloudFront runs that
// rewrite at the edge, and offline there is no edge -- so /p/<id> would miss the cache
// entirely without it. The exported shell is written to the literal out/p/[puzzleId]/
// path by scripts/generate-dynamic-pages.js, which is why the URL here carries
// percent-encoded brackets while the edge function uses them unencoded. Change one and
// you must change the other.
function shellFor(pathname) {
  var dataMatch = pathname.match(/^(\/_next\/data\/[^/]+)\/p\/[^/]+\.json$/)
  if (dataMatch) {
    return dataMatch[1] + '/p/__placeholder__.json'
  }
  if (/^\/p\/[^/]+\/?$/.test(pathname)) {
    return '/p/%5BpuzzleId%5D/index.html'
  }
  return null
}

// The last rule in UiUrlRewriteFunction: a directory URL gets index.html appended. Only
// needed on the offline path -- online, the edge has already done it, and the response
// comes back keyed by the URL the browser actually asked for.
function indexFor(pathname) {
  if (pathname.slice(-1) === '/') return pathname + 'index.html'
  if (/\.[^/]+$/.test(pathname)) return null
  return pathname + '/index.html'
}

// cache.put rejects on a partial response and happily stores an error page. Storing a
// 404 for the app shell would survive the deploy that fixed it, so only a real answer is
// ever written.
function isStorable(response) {
  return Boolean(response) && response.ok && response.status !== 206
}

// Returns a promise so the caller can hand it to event.waitUntil -- a worker may be
// killed the moment respondWith settles, which would drop the write. The catch is
// load-bearing too: cache.put rejects on a full quota or an unsupported scheme, and an
// unhandled rejection in a worker is both noisy and useless. The response is already on
// its way to the page, so a lost write costs one re-fetch and nothing else.
function putInCache(key, response) {
  if (!isStorable(response)) return Promise.resolve()
  var copy = response.clone()
  return caches
    .open(CACHE_NAME)
    .then(function (cache) {
      return cache.put(key, copy)
    })
    .catch(function () {
      return undefined
    })
}

// The document wording is what a reader actually sees. A failed subresource never
// renders its body -- but a *wrong* one would, which is the whole point of the guard
// below. charset is declared because the copy carries a typographic apostrophe, and
// text/plain with no charset is decoded as windows-1252 by every browser that guesses.
function offlineResponse(noun) {
  return new Response('You’re offline and this ' + noun + ' isn’t on this device. Try again when you’re online.', {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    status: 503,
    statusText: 'Offline',
  })
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE)
    }),
  )
  self.skipWaiting()
})

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) {
              return key !== CACHE_NAME && key.indexOf(DICT_PREFIX) !== 0
            })
            .map(function (key) {
              return caches.delete(key)
            }),
        )
      })
      // Inside waitUntil and after the deletion, so a page adopted by this worker never
      // sees the moment where the old caches are still around.
      .then(function () {
        return self.clients.claim()
      }),
  )
})

self.addEventListener('fetch', function (event) {
  var request = event.request
  if (request.method !== 'GET') return

  var url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // The manifest is the file that decides whether Android offers to install an app or to
  // drop a bookmark on the home screen, and Gecko discards the whole thing on any
  // non-2xx answer:
  //
  //   const badStatus = aResp.status < 200 || aResp.status >= 300
  //   if (aResp.type === "error" || badStatus) throw new Error(msg)
  //
  // mobile/shared/actors/ContentDelegateChild.sys.mjs runs that fetch from a
  // requestIdleCallback with no try/catch, so a single bad response means no manifest at
  // all for that page load, and Firefox's installableManifest() returns null.
  //
  // A worker in that path has nothing to offer -- the file is under a kilobyte, ships
  // no-cache, and only matters while there is a connection to install over -- and one
  // thing to lose, because the miss branch below answers any non-navigate request with a
  // synthetic 503. So leave it to the browser.
  if (url.pathname === '/site.webmanifest') return

  var shell = shellFor(url.pathname)

  // Everything under _next/ is content-hashed and ships immutable (see
  // scripts/copyToS3.sh), so the bytes behind a URL can never change and cache-first is
  // safe forever. The rewritten data payloads are the exception -- they resolve to a
  // shared placeholder and are handled below.
  if (url.pathname.indexOf('/_next/') === 0 && shell === null) {
    event.respondWith(
      caches.match(request).then(function (hit) {
        return (
          hit ||
          fetch(request).then(function (response) {
            event.waitUntil(putInCache(request, response))
            return response
          })
        )
      }),
    )
    return
  }

  // Everything else ships `public, no-cache`, so network-first. A cache-first shell would
  // pin every installed player to the build they first opened.
  event.respondWith(
    // Two-argument then, not .then().catch(): a trailing catch also swallows anything the
    // success handler throws, which would quietly answer a live request with a stale
    // cached copy and look exactly like being offline.
    fetch(request).then(
      function (response) {
        event.waitUntil(putInCache(shell || request, response))
        return response
      },
      function () {
        // In order: the exact URL (or its rewritten shell), the directory index the edge
        // would have appended, then -- for a document only -- the home page. Falling
        // straight to the home page would answer /404/ with the shelf.
        return caches
          .match(shell || request)
          .then(function (hit) {
            return hit || caches.match(indexFor(url.pathname) || url.pathname)
          })
          .then(function (hit) {
            if (hit) return hit
            // The home page is a last resort for a *document*. Handing its HTML to a
            // subresource is worse than failing: /_next/data/<buildId>/p/<id>.json from a
            // build this worker has not cached would resolve with 200 and an HTML body,
            // and Next's route loader would throw on res.json(). Same for
            // /site.webmanifest, the icons, robots.txt -- none of them precached. Without
            // a worker each is a clean network error; keep it that way.
            if (request.mode !== 'navigate') return offlineResponse('file')
            return caches.match('/')
          })
          .then(function (hit) {
            return hit || offlineResponse('page')
          })
      },
    ),
  )
})

// Exported for test only; harmless in a worker scope, which has no `exports`.
if (typeof exports !== 'undefined') {
  exports.indexFor = indexFor
  exports.shellFor = shellFor
}
