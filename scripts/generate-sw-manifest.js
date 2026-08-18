#!/usr/bin/env node
'use strict'

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const outDir = path.join(__dirname, '..', 'out')
const swPath = path.join(outDir, 'sw.js')

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })

const toUrl = (file) => '/' + path.relative(outDir, file).split(path.sep).map(encodeURIComponent).join('/')

// Precache the app shell plus everything it needs to boot. Both trees are versioned by
// path -- _next/static filenames carry a content hash, _next/data sits under the build id
// -- so a stale entry is impossible and the whole set can be taken in one addAll. The
// route-data payloads matter as much as the chunks: without them a client-side
// navigation to /p/<id> with no connection has nothing to read.
const assets = walk(outDir)
  .map(toUrl)
  .filter((url) => /^\/_next\/(static\/.*\.(js|css|woff2)|data\/.*\.json)$/.test(url))
  .sort()

// Every exported page, so a first offline visit to any route renders that route rather
// than falling back to the home page. '/' is listed separately because it is the URL the
// browser asks for; CloudFront resolves it to index.html at the edge and offline nothing
// does.
const allShells = ['/'].concat(
  walk(outDir)
    .map(toUrl)
    .filter((url) => url.endsWith('.html'))
    .sort(),
)

const fileForShell = (url) =>
  path.join(outDir, ...(url === '/' ? ['index.html'] : url.slice(1).split('/').map(decodeURIComponent)))

// out/index.html is reachable as both '/' and '/index.html', and Next exports the 404
// document twice ('/404.html' and '/404/index.html'). addAll is atomic and fetches every
// entry, so a duplicate costs a request during install and buys nothing. Keep one URL per
// distinct document: whichever a client can actually ask for -- '/' for the root,
// otherwise the directory form public/sw.js reconstructs in indexFor.
const shellRank = (url) => (url === '/' ? 0 : url.endsWith('/index.html') ? 1 : 2)
const bestByContent = new Map()
for (const url of allShells) {
  const content = crypto
    .createHash('sha1')
    .update(fs.readFileSync(fileForShell(url)))
    .digest('hex')
  const kept = bestByContent.get(content)
  if (kept === undefined || shellRank(url) < shellRank(kept)) {
    bestByContent.set(content, url)
  }
}
const keptShells = new Set(bestByContent.values())
const shells = allShells.filter((url) => keptShells.has(url))

// The bracketed path is written by scripts/generate-dynamic-pages.js and is what
// public/sw.js rewrites /p/<id> onto. If it is absent the worker precaches a set that
// cannot open a single puzzle offline, so fail the build instead of shipping it. This is
// the third of the five pieces the dynamic route depends on, and the one that makes a
// broken combination loud rather than silent.
const required = ['/p/%5BpuzzleId%5D/index.html']
const missing = required.filter((url) => !shells.includes(url))
if (missing.length > 0) {
  console.error(`✗ sw.js precache is missing the puzzle shell: ${missing.join(', ')}`)
  console.error('  Did scripts/generate-dynamic-pages.js run first?')
  process.exit(1)
}

// The launcher icons. Neither lives under _next/, so neither was precached, and
// public/sw.js answers an uncached miss for a subresource with a synthetic 503 -- which
// is a broken image on an installed device with no connection.
//
// The manifest is deliberately NOT here: public/sw.js declines to intercept it at all,
// for the reason spelled out at that early return, so a precache entry for it would be
// fetched on every install and never once served.
const identity = ['/icon-192.png', '/icon-512.png', '/icon-maskable-512.png']
const absent = identity.filter((url) => !fs.existsSync(fileForShell(url)))
if (absent.length > 0) {
  console.error(`✗ sw.js precache is missing the app identity files: ${absent.join(', ')}`)
  console.error('  They are served from public/ — was one renamed without updating this list?')
  process.exit(1)
}

const precache = shells.concat(identity, assets)

// Every filename in the list is content-hashed, so hashing the list is enough to change
// the cache name on any build that changed a byte -- and to leave it alone on a rebuild
// that did not.
const version = crypto.createHash('sha1').update(precache.join('\n')).digest('hex').slice(0, 12)

const versionLine = `var CACHE_VERSION = '${version}'`
const precacheLine = `var PRECACHE = ${JSON.stringify(precache)}`

const source = fs
  .readFileSync(swPath, 'utf8')
  .replace(/^var CACHE_VERSION = .*$/m, versionLine)
  .replace(/^var PRECACHE = .*$/m, precacheLine)

// String.replace returns its input unchanged when the pattern misses, so a rename in
// public/sw.js -- `var` to `const`, say; eslint ignores public/ and prettier leaves it
// alone -- would write the file, print success, and exit 0 while shipping the 'dev'
// placeholders. Every installed player's cache would be replaced by a two-entry one that
// cannot boot offline, under a fixed name that never re-installs. So assert the
// post-condition on the output rather than trusting the replace: both declarations must
// be there, and CACHE_VERSION must be a real hash and not 'dev'.
const substituted = /^var CACHE_VERSION = '[0-9a-f]{12}'$/m.test(source) && source.includes(precacheLine)
if (!substituted) {
  console.error('✗ sw.js manifest substitution did not apply')
  console.error(`  ${swPath} must declare 'var CACHE_VERSION = ...' and 'var PRECACHE = ...', each on its own line.`)
  process.exit(1)
}

fs.writeFileSync(swPath, source)

console.log(`✓ sw.js precache: ${precache.length} entries, version ${version}`)
