import { render, screen } from '@testing-library/react'
import React from 'react'

import PuzzlePage, { getStaticPaths, getStaticProps } from '@pages/p/[...puzzleId]'
import { writePack } from '@services/storage'
import {
  cryptogramPack,
  cryptogramPuzzleId,
  missingVowelsPuzzleId,
  pack,
  packDate,
  phrasePack,
  puzzleId,
} from '@test/__mocks__'
import { puzzlePath } from '@utils/puzzle-path'

// jsdom reports navigator.onLine === true, so an unmocked frame fires a real axios
// request against a 35-second timeout.
jest.mock('@services/lull')
jest.mock('next/router', () => ({ useRouter: () => ({ asPath: window.location.pathname, push: jest.fn() }) }))

describe('PuzzlePage', () => {
  const setup = (path: string): void => {
    window.localStorage.clear()
    window.history.pushState({}, '', path)
  }

  describe('the id in the address bar', () => {
    // Every one of these pages is the same exported document, and
    // scripts/generate-dynamic-pages.js strips the placeholder out of __NEXT_DATA__ so
    // the router cannot answer with it. The URL is the only place the id exists.
    it('plays the puzzle the URL names', async () => {
      setup(`${puzzlePath(puzzleId)}/`)
      writePack('2026-08-18', pack)

      render(<PuzzlePage />)

      expect(await screen.findByRole('heading', { name: 'Make 154' })).toBeInTheDocument()
    })

    it('reads an id spelled across path segments', async () => {
      setup('/p/2026-08-18/gofigure/1a2b3c4d/')
      writePack('2026-08-18', pack)

      render(<PuzzlePage />)

      expect(await screen.findByRole('heading', { name: 'Make 10' })).toBeInTheDocument()
    })

    // Every link shared before this repo wrote path segments carries the id in one encoded
    // segment, and those links are in messages, bookmarks and home-screen shortcuts that
    // nobody is going to rewrite. They keep opening the puzzle they always opened.
    it('still reads the single encoded segment older links carry', async () => {
      setup('/p/2026-08-18%3Agofigure%3A1a2b3c4d/')
      writePack('2026-08-18', pack)

      render(<PuzzlePage />)

      expect(await screen.findByRole('heading', { name: 'Make 10' })).toBeInTheDocument()
    })

    it('shows the hint bar on a phrase puzzle', async () => {
      setup(`${puzzlePath(missingVowelsPuzzleId)}/`)
      writePack(packDate, phrasePack)

      render(<PuzzlePage />)

      expect(await screen.findByRole('button', { name: 'Open hint 1 of 3' })).toBeInTheDocument()
    })

    // The bench is a full-height column with a fixed seam at the bottom of it, and the page's
    // <main> is what it is measured against -- so it has to be exercised through the real page
    // and not only through the frame.
    it('plays a cipher puzzle inside the page chrome', async () => {
      setup(`${puzzlePath(cryptogramPuzzleId)}/`)
      writePack(packDate, cryptogramPack)

      render(<PuzzlePage />)

      expect(await screen.findByRole('region', { name: 'Cryptogram' })).toBeInTheDocument()
    })

    it('asks for nothing when the path carries no id at all', () => {
      setup('/p/')

      render(<PuzzlePage />)

      expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    })
  })

  // One of the five pieces that make /p/<id> work under a static export. The other four
  // are scripts/generate-dynamic-pages.js, scripts/generate-sw-manifest.js,
  // UiUrlRewriteFunction in template.yaml, and shellFor() in public/sw.js.
  describe('the exported placeholder', () => {
    it('exports exactly one path, under the literal placeholder name', () => {
      expect(getStaticPaths({})).toEqual({ fallback: false, paths: [{ params: { puzzleId: ['__placeholder__'] } }] })
    })

    it('lets the dev server answer any id', () => {
      const nodeEnv = process.env.NODE_ENV
      Object.defineProperty(process.env, 'NODE_ENV', { configurable: true, value: 'development' })

      const paths = getStaticPaths({})

      Object.defineProperty(process.env, 'NODE_ENV', { configurable: true, value: nodeEnv })
      expect(paths).toEqual({ fallback: 'blocking', paths: [] })
    })

    it('carries no props: the page reads the URL itself', () => {
      expect(getStaticProps({})).toEqual({ props: {} })
    })
  })
})
