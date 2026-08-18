import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import React from 'react'

import Index from '@pages/index'
import { writePack } from '@services/storage'
import { pack } from '@test/__mocks__'

// Page tests live under test/ rather than beside the page: next.config.js sets
// pageExtensions to ts and tsx, so anything named *.tsx inside src/pages is a route,
// and a test file there would be exported as one.
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn() }) }))

describe('Index', () => {
  const setup = (): void => {
    window.localStorage.clear()
  }

  it('names the app', () => {
    setup()

    render(<Index />)

    expect(screen.getByRole('heading', { level: 1, name: 'Lull' })).toBeInTheDocument()
  })

  it('says what it is', () => {
    setup()

    render(<Index />)

    expect(screen.getByText('A puzzle to pass the time')).toBeInTheDocument()
  })

  it('shows the shelf', () => {
    setup()
    writePack('2026-08-18', pack)

    render(<Index />)

    expect(screen.getByRole('region', { name: 'Puzzles' })).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    setup()

    const { container } = render(<Index />)

    expect(await axe(container)).toHaveNoViolations()
  })
})
