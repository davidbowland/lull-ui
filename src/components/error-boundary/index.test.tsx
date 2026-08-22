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

  // Reloading is not an exit on its own. A render that throws because of what is on the device --
  // a malformed stored value, a pack this build cannot parse -- throws again on the next render,
  // so reload is a loop. The manifest is display: standalone, which means no browser back button
  // and no address bar to escape through either, so this link is the only thing that changes what
  // gets rendered.
  it('offers a way home, not only a way to try the same render again', () => {
    setup()

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('link', { name: 'Back to today’s puzzles' })).toHaveAttribute('href', '/')
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
