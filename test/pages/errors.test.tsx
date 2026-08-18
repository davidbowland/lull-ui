import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import React from 'react'

import NotFound from '@pages/404'
import ServerError from '@pages/500'

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

    it('has no accessibility violations', async () => {
      const { container } = render(<NotFound />)

      expect(await axe(container)).toHaveNoViolations()
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

    it('has no accessibility violations', async () => {
      const { container } = render(<ServerError />)

      expect(await axe(container)).toHaveNoViolations()
    })
  })
})
