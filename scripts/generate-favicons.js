#!/usr/bin/env node
'use strict'

// PROVISIONAL MARK. Everything about the shape below is a placeholder chosen to be
// valid rather than designed -- a single calm wave, one stroke, no type inside the
// icon -- and it is expected to be replaced by a real identity. What is NOT
// provisional is the set of files and their sizes: Chromium will not fire
// beforeinstallprompt without icons at both 192 and 512, and Firefox for Android's
// install gate is one icon of at least 192 with purpose `any` or `maskable`. Change
// the drawing freely; change the list only against ~/Projects/pwa-requirements.md.
//
// Run by hand (`npm run generate:favicons`), not by the build: the outputs are checked
// in, so a redesign is a reviewable diff rather than something that appears at deploy.

const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const publicDir = path.join(__dirname, '..', 'public')

// Keep these in step with src/config/colors.ts. THEME_COLOR there is the same #111214,
// and the manifest's theme_color and background_color both carry it.
const GROUND = '#111214'
const STROKE = '#8fbcea'
const INK = '#ebeae5'
const INK_MUTED = '#9d9d96'

// A lull: the flat part of a wave. One stroke in a 0 0 100 100 box.
const WAVE = 'M14,62 C30,62 30,38 50,38 C70,38 70,62 86,62'

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="Lull">
  <style>
    .wave { stroke: #2f5d8a; }
    @media (prefers-color-scheme: dark) {
      .wave { stroke: ${STROKE}; }
    }
  </style>
  <path class="wave" d="${WAVE}" fill="none" stroke-width="9" stroke-linecap="round"/>
</svg>
`

// sharp's SVG rasterizer does not evaluate prefers-color-scheme, so raster output
// cannot reuse the theme-reactive icon.svg above -- it needs a fixed, opaque scene.
const markOnGround = (strokeWidth) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="${GROUND}"/>
  <path d="${WAVE}" fill="none" stroke="${STROKE}" stroke-width="${strokeWidth}" stroke-linecap="round"/>
</svg>`

// A maskable icon is cropped to whatever shape the platform likes -- a circle on
// Android -- and only the central 80% is guaranteed to survive. The mark is drawn at
// 80% scale on a full-bleed ground so nothing lands outside that safe zone; the `any`
// icons keep it full size, because they are never cropped.
const maskableMark = (strokeWidth) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="${GROUND}"/>
  <g transform="translate(10,10) scale(0.8)">
    <path d="${WAVE}" fill="none" stroke="${STROKE}" stroke-width="${strokeWidth}" stroke-linecap="round"/>
  </g>
</svg>`

// The tagline here is the same string as the manifest description, the meta
// description, and the og/twitter descriptions. A product that describes itself
// differently in each place reads as four products.
const ogImage = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${GROUND}"/>
  <g transform="translate(480,90) scale(2.4)">
    <path d="${WAVE}" fill="none" stroke="${STROKE}" stroke-width="9" stroke-linecap="round"/>
  </g>
  <text x="600" y="440" font-family="Arial, Helvetica, sans-serif" font-size="72" font-weight="700" fill="${INK}" text-anchor="middle" letter-spacing="4">Lull</text>
  <text x="600" y="490" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="${INK_MUTED}" text-anchor="middle">A puzzle to pass the time</text>
</svg>`

async function generate() {
  fs.writeFileSync(path.join(publicDir, 'icon.svg'), iconSvg)

  await sharp(Buffer.from(markOnGround(14)))
    .resize(32, 32)
    .png()
    .toFile(path.join(publicDir, 'favicon-32x32.png'))
  await sharp(Buffer.from(markOnGround(16)))
    .resize(16, 16)
    .png()
    .toFile(path.join(publicDir, 'favicon-16x16.png'))
  await sharp(Buffer.from(markOnGround(9)))
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'))
  // Chromium will not fire beforeinstallprompt without icons at BOTH 192 and 512, so
  // the install card cannot appear on any Chromium platform unless these two exist.
  await sharp(Buffer.from(markOnGround(9)))
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'icon-192.png'))
  await sharp(Buffer.from(markOnGround(9)))
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'icon-512.png'))
  await sharp(Buffer.from(maskableMark(9)))
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'icon-maskable-512.png'))
  await sharp(Buffer.from(ogImage)).resize(1200, 630).png().toFile(path.join(publicDir, 'og-image.png'))

  console.log('✓ Generated public/icon.svg')
  console.log('✓ Generated public/favicon-32x32.png')
  console.log('✓ Generated public/favicon-16x16.png')
  console.log('✓ Generated public/apple-touch-icon.png')
  console.log('✓ Generated public/icon-192.png')
  console.log('✓ Generated public/icon-512.png')
  console.log('✓ Generated public/icon-maskable-512.png')
  console.log('✓ Generated public/og-image.png')
}

generate().catch((error) => {
  console.error(error)
  process.exit(1)
})
