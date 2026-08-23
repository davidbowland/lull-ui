import { render, screen } from '@testing-library/react'
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

  // The page no longer carries a wordmark heading and a tagline of its own. The product
  // name is the first crumb of the breadcrumb -- one name, in the same place, on every
  // surface -- and the h1 is now the thing the reader actually came for. The tagline
  // survives where it always mattered, in the document head and the manifest, which is
  // not this component's to render.
  it('names the app in the trail', () => {
    setup()

    render(<Index />)

    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Lull')
  })

  // Deliberately the empty-device path: it is the one branch that does not read the clock,
  // so this asserts the heading without depending on what day the suite runs on.
  it('leads with the state of the device, not with itself', () => {
    setup()

    render(<Index />)

    expect(screen.getByRole('heading', { level: 1, name: 'No puzzles on this device' })).toBeInTheDocument()
  })

  it('shows the shelf', () => {
    setup()
    writePack('2026-08-18', pack)

    render(<Index />)

    expect(screen.getByRole('region', { name: 'Puzzles' })).toBeInTheDocument()
  })
})
