'use strict'

const fs = require('fs')
const path = require('path')

const SW_PATH = path.join(__dirname, '..', 'public', 'sw.js')

// public/sw.js has no module wrapper and runs in a scope this one does not have: `self`,
// `caches`, `fetch`, and `Response` are all worker globals. It is loaded as text and
// evaluated with those injected, which is the only way to exercise the fetch handler --
// the code that IS the offline promise, and the file jest.config.ts's
// collectCoverageFrom: ['src/**/*'] cannot see.

// A Cache API good enough to be wrong in the same ways the real one is: put() rejects on
// a partial response, and match() is exact-key.
const createCaches = () => {
  const stores = new Map()

  const cacheFor = (name) => {
    if (!stores.has(name)) stores.set(name, new Map())
    const store = stores.get(name)
    return {
      addAll: (urls) => {
        urls.forEach((url) => store.set(url, { body: `precached ${url}`, ok: true, status: 200 }))
        return Promise.resolve()
      },
      keys: () => Promise.resolve([...store.keys()]),
      match: (key) => Promise.resolve(store.get(keyOf(key))),
      put: (key, response) => {
        if (response && response.status === 206) return Promise.reject(new Error('cannot cache a partial response'))
        store.set(keyOf(key), response)
        return Promise.resolve()
      },
    }
  }

  const keyOf = (key) => (typeof key === 'string' ? key : key.url.replace('https://lull.dbowland.com', ''))

  return {
    delete: (name) => Promise.resolve(stores.delete(name)),
    keys: () => Promise.resolve([...stores.keys()]),
    match: (key) => {
      for (const store of stores.values()) {
        const hit = store.get(keyOf(key))
        if (hit) return Promise.resolve(hit)
      }
      return Promise.resolve(undefined)
    },
    open: (name) => Promise.resolve(cacheFor(name)),
    // Test-only reach-in.
    stores,
  }
}

const ORIGIN = 'https://lull.dbowland.com'

const makeRequest = (pathname, { method = 'GET', mode = 'navigate', origin = ORIGIN } = {}) => ({
  method,
  mode,
  url: `${origin}${pathname}`,
})

// Minimal Response stand-in. jsdom provides no worker Response, and the worker only ever
// reads .ok/.status and calls .clone().
class FakeResponse {
  constructor(body, init = {}) {
    this.body = body
    this.headers = init.headers || {}
    this.status = init.status === undefined ? 200 : init.status
    this.statusText = init.statusText || ''
    this.ok = this.status >= 200 && this.status < 300
  }

  clone() {
    return new FakeResponse(this.body, { headers: this.headers, status: this.status, statusText: this.statusText })
  }
}

const loadWorker = ({ fetchImpl } = {}) => {
  const source = fs.readFileSync(SW_PATH, 'utf8')
  const listeners = {}
  const caches = createCaches()
  const claimed = { count: 0 }

  // Plain counters rather than jest.fn(): the harness is a .js file outside the jest
  // environment eslint applies to test files, and a helper should not depend on the
  // framework anyway.
  const skipped = { count: 0 }
  const self = {
    addEventListener: (type, handler) => {
      listeners[type] = handler
    },
    clients: {
      claim: () => {
        claimed.count += 1
        return Promise.resolve()
      },
    },
    location: { origin: ORIGIN },
    skipWaiting: () => {
      skipped.count += 1
    },
  }

  const fetchStub = fetchImpl || (() => Promise.reject(new Error('offline')))
  const exported = {}
  new Function('exports', 'self', 'caches', 'fetch', 'Response', source)(
    exported,
    self,
    caches,
    fetchStub,
    FakeResponse,
  )

  // Drives one event and resolves to whatever the handler answered with, plus every
  // promise it handed to waitUntil -- the writes happen there, so a test that ignored
  // them would assert on a cache that had not been written yet.
  const dispatch = async (type, event) => {
    const pending = []
    let answered
    const shaped = {
      ...event,
      respondWith: (value) => {
        answered = value
      },
      waitUntil: (value) => pending.push(value),
    }
    listeners[type](shaped)
    const response = await answered
    await Promise.all(pending)
    return response
  }

  return { caches, claimed, dispatch, exported, listeners, self, skipped }
}

module.exports = { FakeResponse, ORIGIN, loadWorker, makeRequest }
