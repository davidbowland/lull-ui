import { render, screen } from '@testing-library/react'
import React from 'react'

import { ErrorBoundary } from '@components/error-boundary'

const Boom = (): React.ReactNode => {
  throw new Error('render exploded')
}

describe('ErrorBoundary', () => {
  const setup = (): void => {
    // React logs the caught error itself; silencing keeps the suite readable.
    console.error = jest.fn()
  }

  it('renders its children when nothing throws', () => {
    setup()

    render(
      <ErrorBoundary>
        <p>the shelf</p>
      </ErrorBoundary>,
    )

    expect(screen.getByText('the shelf')).toBeInTheDocument()
  })

  // Without this, a render-time throw unmounts the root and leaves a blank white page.
  it('shows something a person can act on when a child throws', () => {
    setup()

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('heading', { name: 'Lull got stuck' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload Lull' })).toBeInTheDocument()
  })

  it('reassures the player their record survived', () => {
    setup()

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )

    expect(screen.getByText(/solved puzzles are safe on this device/)).toBeInTheDocument()
  })
})
