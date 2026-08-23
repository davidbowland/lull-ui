import { render, screen } from '@testing-library/react'
import React from 'react'

import { FloorBar } from './index'

describe('FloorBar', () => {
  const renderFloor = (message = '', resting?: string): ReturnType<typeof render> =>
    render(
      <FloorBar message={message} resting={resting}>
        <button type="button">A</button>
      </FloorBar>,
    )

  it('holds the instrument it is given', () => {
    renderFloor()

    expect(screen.getByRole('button', { name: 'A' })).toBeInTheDocument()
  })

  // NVDA and JAWS announce changes inside a region they are already watching, so a
  // role="status" element inserted with its message already in it is missed.
  it('mounts the live region empty', () => {
    renderFloor()

    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('announces the message it is given', () => {
    renderFloor('Every Q is T. Three squares filled.')

    expect(screen.getByRole('status')).toHaveTextContent('Every Q is T. Three squares filled.')
  })

  it('does not re-read the whole region on every message', () => {
    renderFloor('Every Q is T.')

    expect(screen.getByRole('status')).toHaveAttribute('aria-atomic', 'false')
  })

  // The ribbon is reserved space and it is empty until the player's first move -- on a restored
  // board, for the whole visit. A bench that has something standing to say puts it here rather than
  // leaving 52px of near-black between the board and the instrument.
  describe('the resting line', () => {
    it('says it while there is no message', () => {
      renderFloor('', 'Tap a square first, then a letter.')

      expect(screen.getByText('Tap a square first, then a letter.')).toBeInTheDocument()
    })

    it('yields the ribbon to a message when one arrives', () => {
      renderFloor('Every Q is T.', 'Tap a square first, then a letter.')

      expect(screen.queryByText('Tap a square first, then a letter.')).not.toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('Every Q is T.')
    })

    // The whole announcement story rests on the live region being empty at mount: NVDA and JAWS
    // announce changes inside a region they are already watching. A standing line inside it would
    // cost the first message its announcement, so it sits beside the region rather than in it.
    it('stays out of the live region', () => {
      renderFloor('', 'Tap a square first, then a letter.')

      expect(screen.getByRole('status')).toBeEmptyDOMElement()
    })

    it('leaves the ribbon empty when a bench has nothing standing to say', () => {
      renderFloor()

      expect(screen.getByRole('status')).toBeEmptyDOMElement()
    })

    // Out of the live region, but still in the accessibility tree. The line is drawn over the
    // ribbon rather than beside it, and taking it out of flow is a layout move -- hiding it from a
    // screen reader as well would leave the floor saying nothing at all to the player who has the
    // least else to go on, on the one board state where it has something to say.
    it('is read in place rather than hidden from a screen reader', () => {
      renderFloor('', 'Tap a square first, then a letter.')

      expect(screen.getByText('Tap a square first, then a letter.').closest('[aria-hidden="true"]')).toBeNull()
    })
  })
})
