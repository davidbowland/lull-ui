'use strict'

const { FakeResponse, loadWorker, makeRequest } = require('./sw-harness')

// The offline promise is this file. Nothing else in the repo decides what a player sees
// when the connection is gone, and until now nothing exercised it -- test/sw.test.js
// covers the two pure rewrite helpers, and jest.config.ts's collectCoverageFrom is
// ['src/**/*'], so public/sw.js never appeared in a coverage number at all.
describe('sw.js fetch handler', () => {
  const ok = (body) => new FakeResponse(body, { status: 200 })

  describe('requests it deliberately ignores', () => {
    it('leaves a non-GET alone', async () => {
      const worker = loadWorker()
      const respondWith = jest.fn()

      worker.listeners.fetch({ request: makeRequest('/packs', { method: 'POST' }), respondWith })

      expect(respondWith).not.toHaveBeenCalled()
    })

    it('leaves a cross-origin request alone', async () => {
      const worker = loadWorker()
      const respondWith = jest.fn()

      worker.listeners.fetch({
        request: makeRequest('/v1/packs/2026-08-18', { origin: 'https://lull-api.dbowland.com' }),
        respondWith,
      })

      expect(respondWith).not.toHaveBeenCalled()
    })

    // The single most consequential line in the file. Gecko fetches the manifest from a
    // requestIdleCallback with no try/catch and discards it on any non-2xx, so one bad
    // answer means no manifest for the whole page load and Android offers a bookmark
    // instead of an app. The miss branch below answers a non-navigate with a synthetic
    // 503, which is exactly such an answer.
    it('never answers for the manifest', async () => {
      const worker = loadWorker()
      const respondWith = jest.fn()

      worker.listeners.fetch({ request: makeRequest('/site.webmanifest', { mode: 'no-cors' }), respondWith })

      expect(respondWith).not.toHaveBeenCalled()
    })
  })

  describe('hashed assets under /_next/', () => {
    it('answers from the cache without touching the network', async () => {
      const fetchImpl = jest.fn()
      const worker = loadWorker({ fetchImpl })
      const cache = await worker.caches.open('lull-dev')
      await cache.put('/_next/static/chunks/main-abc.js', ok('cached chunk'))

      const response = await worker.dispatch('fetch', {
        request: makeRequest('/_next/static/chunks/main-abc.js', { mode: 'no-cors' }),
      })

      expect(response.body).toEqual('cached chunk')
      expect(fetchImpl).not.toHaveBeenCalled()
    })

    it('fetches and stores a chunk it has never seen', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(ok('fresh chunk'))
      const worker = loadWorker({ fetchImpl })

      const response = await worker.dispatch('fetch', {
        request: makeRequest('/_next/static/chunks/main-def.js', { mode: 'no-cors' }),
      })

      expect(response.body).toEqual('fresh chunk')
      const cache = await worker.caches.open('lull-dev')
      expect((await cache.match('/_next/static/chunks/main-def.js')).body).toEqual('fresh chunk')
    })

    // A data payload under /_next/ resolves to the shared placeholder, so it is NOT
    // immutable and must not take the cache-first path.
    //
    // Asserting WHERE it stored, not merely that it fetched. Both paths fetch on a cache
    // miss, so `expect(fetchImpl).toHaveBeenCalled()` passes either way -- a weaker
    // version of this test survived dropping the `shell === null` guard entirely. The
    // discriminator is the key: cache-first stores under the request's own URL, while
    // network-first stores under the shared placeholder the payload rewrites to.
    it('does not treat a rewritten data payload as immutable', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(ok('fresh data'))
      const worker = loadWorker({ fetchImpl })
      const requested = '/_next/data/build123/p/2026-08-18/gofigure/aa.json'

      await worker.dispatch('fetch', { request: makeRequest(requested, { mode: 'no-cors' }) })

      expect((await worker.caches.match('/_next/data/build123/p/__placeholder__.json')).body).toEqual('fresh data')
      expect(await worker.caches.match(requested)).toBeUndefined()
    })
  })

  describe('everything else, network first', () => {
    it('answers from the network and stores the result', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(ok('live shelf'))
      const worker = loadWorker({ fetchImpl })

      const response = await worker.dispatch('fetch', { request: makeRequest('/') })

      expect(response.body).toEqual('live shelf')
      expect((await worker.caches.match('/')).body).toEqual('live shelf')
    })

    // A puzzle URL is stored under the SHELL it rewrites to, not its own address --
    // every puzzle of every day shares one exported document.
    it('stores a puzzle page under the shell it rewrites to', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(ok('puzzle shell'))
      const worker = loadWorker({ fetchImpl })

      await worker.dispatch('fetch', { request: makeRequest('/p/2026-08-18/gofigure/aa') })

      expect((await worker.caches.match('/p/%5B...puzzleId%5D/index.html')).body).toEqual('puzzle shell')
    })
  })

  describe('offline, in the order the fallbacks are tried', () => {
    it('answers a puzzle page from the shell', async () => {
      const worker = loadWorker()
      const cache = await worker.caches.open('lull-dev')
      await cache.put('/p/%5B...puzzleId%5D/index.html', ok('offline shell'))

      const response = await worker.dispatch('fetch', { request: makeRequest('/p/2026-08-18/gofigure/aa') })

      expect(response.body).toEqual('offline shell')
    })

    it('falls back to the directory index the edge would have appended', async () => {
      const worker = loadWorker()
      const cache = await worker.caches.open('lull-dev')
      await cache.put('/404/index.html', ok('the 404 page'))

      const response = await worker.dispatch('fetch', { request: makeRequest('/404/') })

      expect(response.body).toEqual('the 404 page')
    })

    // Last resort for a DOCUMENT only.
    it('falls back to the home page for a navigation', async () => {
      const worker = loadWorker()
      const cache = await worker.caches.open('lull-dev')
      await cache.put('/', ok('the shelf'))

      const response = await worker.dispatch('fetch', { request: makeRequest('/somewhere-new/') })

      expect(response.body).toEqual('the shelf')
    })

    // Handing the home page's HTML to a subresource is worse than failing: a route
    // loader would resolve with 200 and an HTML body and throw on res.json(). Without a
    // worker each of these is a clean network error, and it stays that way.
    it('refuses to hand the home page to a subresource', async () => {
      const worker = loadWorker()
      const cache = await worker.caches.open('lull-dev')
      await cache.put('/', ok('the shelf'))

      const response = await worker.dispatch('fetch', {
        request: makeRequest('/_next/data/build123/p/x.json', { mode: 'cors' }),
      })

      expect(response.status).toEqual(503)
      expect(response.body).toContain('file')
      expect(response.body).not.toContain('the shelf')
    })

    it('declares a charset, because the copy carries a typographic apostrophe', async () => {
      const worker = loadWorker()

      const response = await worker.dispatch('fetch', {
        request: makeRequest('/icon-192.png', { mode: 'no-cors' }),
      })

      expect(response.headers['Content-Type']).toEqual('text/plain; charset=utf-8')
    })

    it('gives a navigation with nothing cached a readable page', async () => {
      const worker = loadWorker()

      const response = await worker.dispatch('fetch', { request: makeRequest('/') })

      expect(response.status).toEqual(503)
      expect(response.body).toContain('page')
    })
  })

  describe('what it refuses to store', () => {
    it('does not cache an error page over a good one', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(new FakeResponse('not found', { status: 404 }))
      const worker = loadWorker({ fetchImpl })

      await worker.dispatch('fetch', { request: makeRequest('/gone/') })

      expect(await worker.caches.match('/gone/')).toBeUndefined()
    })

    // cache.put rejects on a 206, and an unhandled rejection in a worker is noisy and
    // useless -- the response is already on its way to the page.
    it('survives a partial response the Cache API refuses', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(new FakeResponse('partial', { status: 206 }))
      const worker = loadWorker({ fetchImpl })

      const response = await worker.dispatch('fetch', { request: makeRequest('/big-thing/') })

      expect(response.body).toEqual('partial')
    })
  })
})

describe('sw.js lifecycle', () => {
  it('precaches the manifest on install', async () => {
    const worker = loadWorker()

    await worker.dispatch('install', {})

    expect((await worker.caches.match('/')).body).toEqual('precached /')
    expect(worker.skipped.count).toEqual(1)
  })

  it('deletes previous generations and keeps the current one', async () => {
    const worker = loadWorker()
    await worker.caches.open('lull-old-build')
    await worker.caches.open('lull-dev')

    await worker.dispatch('activate', {})

    expect(await worker.caches.keys()).toEqual(['lull-dev'])
  })

  it('claims open pages only after the old caches are gone', async () => {
    const worker = loadWorker()
    await worker.caches.open('lull-old-build')

    await worker.dispatch('activate', {})

    expect(worker.claimed.count).toEqual(1)
    expect(await worker.caches.keys()).not.toContain('lull-old-build')
  })

  // The dictionary cache is a SIBLING, keyed by the DICTIONARY version rather than the build, so it
  // has to survive a deploy. caches.keys() is origin-wide and this sweep deletes everything that is
  // not the current build's cache, which would take it with every release.
  //
  // toContain / not.toContain rather than toEqual on an array, because the test above already pins
  // exact membership for the build caches and this one is about the exemption, not about ordering.
  it('keeps the dictionary cache across a deploy', async () => {
    const worker = loadWorker()
    await worker.caches.open('lull-old-build')
    await worker.caches.open('lull-dict-v1')

    await worker.dispatch('activate', {})

    expect(await worker.caches.keys()).toContain('lull-dict-v1')
    expect(await worker.caches.keys()).not.toContain('lull-old-build')
  })
})
