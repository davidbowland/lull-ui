import { render, screen } from '@testing-library/react'
import React from 'react'

import NotFound from '@pages/404'
import ServerError from '@pages/500'

// Same reasoning as `app.test.tsx`: next/head defers its children to a head manager that only
// exists inside a running Next app, so under jsdom the real component renders nothing and there
// would be nothing to assert. Rendered inline instead, which puts the robots tag where a query
// can reach it -- delete the meta and the tests below fail.
jest.mock('next/head', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

describe('error pages', () => {
  describe('404', () => {
    it('says the page does not exist', () => {
      render(<NotFound />)

      expect(screen.getByRole('heading', { name: 'That page doesn’t exist' })).toBeInTheDocument()
    })

    it('offers the way back', () => {
      render(<NotFound />)

      expect(screen.getByRole('link', { name: 'Back to today’s puzzles' })).toHaveAttribute('href', '/')
    })

    // A dead end is still a place, so it wears the same two landmarks as every other surface:
    // the content sits inside <main>, and the named breadcrumb says where "here" is. Without
    // both, a screen reader arriving on this page has nothing to jump to and no position.
    it('says where you are, inside the page landmark', () => {
      render(<NotFound />)

      expect(screen.getByRole('main')).toBeInTheDocument()
      expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Not found')
    })

    // An error message is not a search result, and this same build serves lull.bowland.link, so a
    // crawlable copy of it exists on two hosts. `follow` keeps the way out crawlable.
    it('keeps the page out of an index', () => {
      render(<NotFound />)

      expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toEqual('noindex, follow')
    })
  })

  describe('500', () => {
    // Named as ours, not as the reader's. Nobody browsing a puzzle app can act on a
    // status code, and "you did nothing wrong" is the only useful thing to say.
    it('takes the blame', () => {
      render(<ServerError />)

      expect(screen.getByRole('heading', { name: 'Something went wrong at our end' })).toBeInTheDocument()
    })

    it('offers the way back', () => {
      render(<ServerError />)

      expect(screen.getByRole('link', { name: 'Back to today’s puzzles' })).toHaveAttribute('href', '/')
    })

    it('keeps the page out of an index', () => {
      render(<ServerError />)

      expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toEqual('noindex, follow')
    })

    it('says where you are, inside the page landmark', () => {
      render(<ServerError />)

      expect(screen.getByRole('main')).toBeInTheDocument()
      expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Something went wrong')
    })
  })
})
