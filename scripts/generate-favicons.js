#!/usr/bin/env node
'use strict'

// THE MARK. Baskervville's capital L set into a plate, with its flared tail deleted so
// the foot runs on as the product's seam -- the same constant band the app docks every
// instrument to -- carrying the you-are-here pip that the breadcrumb uses.
//
// The drawings live beside this file in scripts/marks/ rather than inline, so the
// identity stays editable without touching the pipeline, and a change to the mark is a
// diff of a drawing rather than a diff of a script.
//
// Run by hand (`npm run generate:favicons`), not by the build: the outputs are checked
// in, so a change to the identity is a reviewable diff rather than something that
// appears at deploy time.
//
// WHAT IS NOT NEGOTIABLE is the set of files and their sizes. Chromium will not fire
// beforeinstallprompt without icons at BOTH 192 and 512, so the install card cannot
// appear on any Chromium platform unless those two exist -- and the whole seven-day
// offline window is gated on installing. Firefox for Android's install gate is one icon
// of at least 192 with purpose `any` or `maskable`. Change the drawings freely; change
// the list only against ~/Projects/pwa-requirements.md.
//
// ----------------------------------------------------------------------------------
// Three things about these drawings are load-bearing and easy to undo by accident.
//
// 1. EVERY GLYPH IS PATH DATA, never <text>. sharp rasterizes through librsvg, which
//    substitutes a missing font SILENTLY -- Baskervville is not installed on any machine
//    this runs on, so a <text> element would ship the wordmark in whatever serif the box
//    happened to have, with no warning and no error. The letterforms in marks/ were
//    converted from the real Baskervville and Source Serif 4 files with fontTools.
//
// 2. NO prefers-color-scheme INSIDE ANYTHING sharp TOUCHES. It does not evaluate media
//    queries, so a themed SVG would rasterize to whichever branch librsvg happened to
//    take. Every rasterized source is one fixed, opaque scene.
//
// 3. ONE SCENE SERVES BOTH BROWSER CHROMES, which is the reason this mark carries its
//    own opaque plate instead of being a transparent glyph. The plate reads 13.29:1
//    against Chrome's dark strip (#202124) and the seam band reads 11.39:1 against its
//    light one (#dee1e6), so neither half of the mark can dissolve into the tab it was
//    not drawn for. A transparent mark has to pick a chrome and lose the other.
// ----------------------------------------------------------------------------------

const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const publicDir = path.join(__dirname, '..', 'public')
const marksDir = path.join(__dirname, 'marks')

const mark = (name) => fs.readFileSync(path.join(marksDir, name))

// TWO CUTS, not one drawing resized, and this is the whole reason the mark survives a
// tab strip.
//
// The large cut is the real Baskervville outline: bracketed serifs, a tapering stem, and
// a 1.1-unit hairline where the foot meets the band. At 16px that hairline rasterizes to
// 0.18px and disappears, taking the seam -- the one idea the mark is about -- with it.
//
// The small cut is a different drawing on a 16x16 grid: 3px stem, 3px foot, no curves at
// all, every edge on a whole device pixel, and the seam redrawn as the boundary between
// two opaque grounds rather than as a stroke. A boundary between two fills has no
// minimum width, so it survives at any size a stroke would vanish at.
const LARGE = mark('icon-large.svg')
const SMALL = mark('icon-small.svg')
const MASKABLE = mark('icon-maskable.svg')
const OG = mark('og.svg')

// The live icon, which browsers render themselves rather than through sharp. It is the
// large cut and it carries NO media query, deliberately: the mark holds both chromes on
// one scene, so a query here would only let the live icon disagree with the five rasters
// beside it -- the same identity rendering two ways depending on which file a surface
// happened to ask for.
const iconSvg = LARGE

const targets = [
  // 16 and 32 take the small cut. 32 is exactly 2 device pixels per grid unit, so the
  // pixel-snapped drawing lands clean there too.
  { file: 'favicon-16x16.png', size: 16, source: SMALL },
  { file: 'favicon-32x32.png', size: 32, source: SMALL },
  // 180 and up take the real letterform, where the serifs and the taper are visible and
  // are the point.
  { file: 'apple-touch-icon.png', size: 180, source: LARGE },
  { file: 'icon-192.png', size: 192, source: LARGE },
  { file: 'icon-512.png', size: 512, source: LARGE },
  // Android crops a maskable icon to whatever shape it likes -- a circle, a squircle --
  // and only the central 80% is guaranteed to survive. The mark is drawn at 80% inside a
  // full-bleed ground so nothing that carries meaning lands in the croppable margin.
  { file: 'icon-maskable-512.png', size: 512, source: MASKABLE },
]

async function generate() {
  fs.writeFileSync(path.join(publicDir, 'icon.svg'), iconSvg)
  console.log('✓ public/icon.svg')

  for (const { file, size, source } of targets) {
    await sharp(source, { density: 384 }).resize(size, size).png().toFile(path.join(publicDir, file))
    console.log(`✓ public/${file}  ${size}x${size}`)
  }

  // 1200x630 is what every scraper expects, and the type sits inside a margin wide
  // enough to survive a square crop as well -- iMessage and some Slack layouts do not
  // honour 1.91:1.
  await sharp(OG, { density: 192 }).resize(1200, 630).png().toFile(path.join(publicDir, 'og-image.png'))
  console.log('✓ public/og-image.png  1200x630')
}

generate().catch((error) => {
  console.error(error)
  process.exit(1)
})
