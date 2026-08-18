#!/usr/bin/env node
'use strict'

// One of the five pieces that make /p/<id> work under a static export, and they only
// work together:
//
//   1. getStaticPaths in src/pages/p/[puzzleId].tsx, returning the literal placeholder
//   2. this script, which renames what that produced
//   3. scripts/generate-sw-manifest.js, which exits 1 if the rename did not happen
//   4. UiUrlRewriteFunction in template.yaml, which rewrites /p/<id> at the edge
//   5. shellFor() in public/sw.js, which mirrors that rewrite offline
//
// Change one and you must change all five.

const fs = require('fs')
const path = require('path')

const outDir = path.join(__dirname, '..', 'out', 'p')
const srcDir = path.join(outDir, '__placeholder__')
const destDir = path.join(outDir, '[puzzleId]')

function copyAndPatch(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  let html = fs.readFileSync(src, 'utf8')
  // Strip puzzleId out of the __NEXT_DATA__ query, so useRouter().query.puzzleId is
  // undefined rather than the literal '__placeholder__'. The page reads the id out of
  // window.location instead, which is the only place it actually exists.
  html = html.replace('"puzzleId":"__placeholder__"', '')
  fs.writeFileSync(dest, html)
}

copyAndPatch(path.join(srcDir, 'index.html'), path.join(destDir, 'index.html'))

// Remove the placeholder from out/ so it is never uploaded to S3
fs.rmSync(srcDir, { recursive: true })

console.log('✓ Generated out/p/[puzzleId]/index.html')
